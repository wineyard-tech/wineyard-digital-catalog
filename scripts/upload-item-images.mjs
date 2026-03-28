#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const DATA_DIR = path.resolve(process.env.IMAGE_DATA_DIR || path.join(process.cwd(), "data/images"));
const RESIZED_DIR = path.resolve(process.env.RESIZED_IMAGE_DIR || path.join(process.cwd(), "data/resized_images"));
const BUCKET = process.env.SUPABASE_IMAGE_BUCKET || "images";
const STORAGE_PREFIX = (process.env.STORAGE_PREFIX || "items").replace(/^\/+|\/+$/g, "");
const DRY_RUN = process.env.DRY_RUN === "1";
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);
const TARGET_SIZE = Number(process.env.TARGET_SIZE || 1200);
const PAD_COLOR = (process.env.PAD_COLOR || "FFFFFF").replace(/^#/, "");
const WEBP_QUALITY = Number(process.env.WEBP_QUALITY || 82);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function listWebpFiles(dir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".webp")) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

function sanitizeForPath(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function resizeToWebpSquare(inputPath, outputPath, size, padColor, webpQuality) {
  await sharp(inputPath)
    .resize(size, size, {
      fit: "contain",
      background: `#${padColor}`,
    })
    .webp({ quality: webpQuality })
    .toFile(outputPath);
}

async function ensureBucketExists(bucketName) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Failed to list storage buckets: ${listError.message}`);
  }

  const existing = (buckets || []).find((b) => b.name === bucketName);
  if (existing) {
    console.log(`Using existing bucket: ${bucketName} (public=${String(existing.public)})`);
    if (!existing.public) {
      console.warn(
        `Warning: bucket '${bucketName}' is private. Public URLs may not be accessible without signed URLs.`
      );
    }
    return;
  }

  if (DRY_RUN) {
    console.log(`[dry-run] Bucket '${bucketName}' does not exist and would be created.`);
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: true,
    fileSizeLimit: "10MB",
    allowedMimeTypes: ["image/webp"],
  });

  if (createError) {
    throw new Error(`Failed to create bucket '${bucketName}': ${createError.message}`);
  }

  console.log(`Created bucket: ${bucketName}`);
}

async function fetchItemsBySku() {
  const skuMap = new Map();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("items")
      .select("zoho_item_id, sku")
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch items: ${error.message}`);
    }

    const rows = data || [];
    for (const row of rows) {
      const sku = typeof row.sku === "string" ? row.sku.trim() : "";
      const id = typeof row.zoho_item_id === "string" ? row.zoho_item_id : "";
      if (sku && id) {
        skuMap.set(sku, { zoho_item_id: id, sku });
      }
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return skuMap;
}

async function runWithConcurrency(items, worker, concurrency) {
  let index = 0;

  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      await worker(items[current], current);
    }
  });

  await Promise.all(runners);
}

async function main() {
  console.log("Starting one-time item image upload script");
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Resized output directory: ${RESIZED_DIR}`);
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Storage prefix: ${STORAGE_PREFIX || "(none)"}`);
  console.log(`Dry run: ${DRY_RUN ? "yes" : "no"}`);
  console.log(`Target size: ${TARGET_SIZE}x${TARGET_SIZE}`);
  console.log(`Output format: webp`);
  console.log(`WebP quality: ${WEBP_QUALITY}`);

  await ensureBucketExists(BUCKET);
  await fs.mkdir(RESIZED_DIR, { recursive: true });

  const files = await listWebpFiles(DATA_DIR);
  if (files.length === 0) {
    console.log("No .webp files found. Nothing to do.");
    return;
  }

  console.log(`Found ${files.length} webp files.`);

  const skuToItem = await fetchItemsBySku();
  console.log(`Loaded ${skuToItem.size} SKUs from items table.`);

  const jobs = files.map((filePath) => {
    const fileName = path.basename(filePath);
    const sku = path.basename(fileName, path.extname(fileName)).trim();
    return { filePath, sku };
  });

  const stats = {
    totalFiles: jobs.length,
    matched: 0,
    missingSkuInDb: 0,
    resizeFailed: 0,
    uploadSuccess: 0,
    uploadFailed: 0,
    dbUpdated: 0,
    dbFailed: 0,
  };

  const missingSkus = [];
  const uploadErrors = [];
  const dbErrors = [];
  const resizeErrors = [];

  await runWithConcurrency(
    jobs,
    async (job, index) => {
      const item = skuToItem.get(job.sku);

      if (!item) {
        stats.missingSkuInDb += 1;
        missingSkus.push(job.sku);
        return;
      }

      stats.matched += 1;

      const safeSku = sanitizeForPath(job.sku);
      const resizedFilePath = path.join(RESIZED_DIR, `${String(index).padStart(6, "0")}-${safeSku}.webp`);

      try {
        await resizeToWebpSquare(job.filePath, resizedFilePath, TARGET_SIZE, PAD_COLOR, WEBP_QUALITY);
      } catch (error) {
        stats.resizeFailed += 1;
        resizeErrors.push(`${job.sku}: ${error.message}`);
        return;
      }

      const objectPath = STORAGE_PREFIX ? `${STORAGE_PREFIX}/${job.sku}.webp` : `${job.sku}.webp`;
      const imageBuffer = await fs.readFile(resizedFilePath);

      if (!DRY_RUN) {
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(objectPath, imageBuffer, {
            contentType: "image/webp",
            upsert: true,
          });

        if (uploadError) {
          stats.uploadFailed += 1;
          uploadErrors.push(`${job.sku}: ${uploadError.message}`);
          return;
        }
      }

      stats.uploadSuccess += 1;

      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
      const publicUrl = publicUrlData.publicUrl;

      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from("items")
          .update({ image_urls: [publicUrl] })
          .eq("zoho_item_id", item.zoho_item_id);

        if (updateError) {
          stats.dbFailed += 1;
          dbErrors.push(`${job.sku}: ${updateError.message}`);
          return;
        }
      }

      stats.dbUpdated += 1;
    },
    CONCURRENCY
  );

  console.log("\nSummary");
  console.log(`- Total files found: ${stats.totalFiles}`);
  console.log(`- Files matched to DB SKU: ${stats.matched}`);
  console.log(`- Files with no SKU match: ${stats.missingSkuInDb}`);
  console.log(`- Resize failed: ${stats.resizeFailed}`);
  console.log(`- Upload success: ${stats.uploadSuccess}`);
  console.log(`- Upload failed: ${stats.uploadFailed}`);
  console.log(`- DB rows updated: ${stats.dbUpdated}`);
  console.log(`- DB update failed: ${stats.dbFailed}`);

  if (missingSkus.length > 0) {
    console.log("\nSKUs not found in DB (first 50):");
    for (const sku of missingSkus.slice(0, 50)) {
      console.log(`- ${sku}`);
    }
  }

  if (resizeErrors.length > 0) {
    console.log("\nResize errors (first 20):");
    for (const err of resizeErrors.slice(0, 20)) {
      console.log(`- ${err}`);
    }
  }

  if (uploadErrors.length > 0) {
    console.log("\nUpload errors (first 20):");
    for (const err of uploadErrors.slice(0, 20)) {
      console.log(`- ${err}`);
    }
  }

  if (dbErrors.length > 0) {
    console.log("\nDB update errors (first 20):");
    for (const err of dbErrors.slice(0, 20)) {
      console.log(`- ${err}`);
    }
  }

  if (DRY_RUN) {
    console.log("\nDry run complete. Re-run without DRY_RUN=1 to execute uploads and DB updates.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
