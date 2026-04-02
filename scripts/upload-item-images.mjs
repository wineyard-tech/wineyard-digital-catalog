#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  const fallbackSharpPath = path.join(scriptDir, "../app/node_modules/sharp/lib/index.js");
  try {
    ({ default: sharp } = await import(pathToFileURL(fallbackSharpPath).href));
  } catch {
    console.error(
      "Sharp not found. Install it at repo root (`npm install sharp`) or in app (`cd app && npm install sharp`)."
    );
    process.exit(1);
  }
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const ITEMS_DATA_DIR = path.resolve(process.env.ITEM_IMAGE_DATA_DIR || path.join(process.cwd(), "data/items-images"));
const ITEMS_RESIZED_DIR = path.resolve(
  process.env.RESIZED_ITEM_IMAGE_DIR || path.join(process.cwd(), "data/resized_items_images")
);
const CATEGORIES_DATA_DIR = path.resolve(
  process.env.CATEGORY_IMAGE_DATA_DIR || path.join(process.cwd(), "data/categories-images")
);
const CATEGORIES_RESIZED_DIR = path.resolve(
  process.env.RESIZED_CATEGORY_IMAGE_DIR || path.join(process.cwd(), "data/resized_categories_images")
);

const BUCKET = process.env.SUPABASE_IMAGE_BUCKET || "images";
const ITEM_STORAGE_PREFIX = (process.env.ITEM_STORAGE_PREFIX || "items-images").replace(/^\/+|\/+$/g, "");
const CATEGORY_STORAGE_PREFIX = (process.env.CATEGORY_STORAGE_PREFIX || "categories-images").replace(
  /^\/+|\/+$/g,
  ""
);

const DRY_RUN = process.env.DRY_RUN === "1";
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);
const ITEM_TARGET_SIZE = Number(process.env.ITEM_TARGET_SIZE || 1200);
const CATEGORY_TARGET_SIZE = Number(process.env.CATEGORY_TARGET_SIZE || 800);
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

  try {
    await walk(dir);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  return files;
}

function sanitizeForPath(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function toPublicUrl(supabaseUrl, bucket, objectPath) {
  const cleanBase = supabaseUrl.replace(/\/+$/g, "");
  const encodedPath = objectPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${cleanBase}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
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
    const { data, error } = await supabase.from("items").select("zoho_item_id, sku").range(from, to);

    if (error) throw new Error(`Failed to fetch items: ${error.message}`);

    const rows = data || [];
    for (const row of rows) {
      const sku = typeof row.sku === "string" ? row.sku.trim() : "";
      const id = typeof row.zoho_item_id === "string" ? row.zoho_item_id : "";
      if (sku && id) skuMap.set(sku, { zoho_item_id: id, sku });
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return skuMap;
}

async function fetchCategoriesByName() {
  const nameMap = new Map();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("categories")
      .select("zoho_category_id, category_name")
      .range(from, to);

    if (error) throw new Error(`Failed to fetch categories: ${error.message}`);

    const rows = data || [];
    for (const row of rows) {
      const categoryName = typeof row.category_name === "string" ? row.category_name.trim() : "";
      const id = typeof row.zoho_category_id === "string" ? row.zoho_category_id : "";
      if (categoryName && id) nameMap.set(categoryName, { zoho_category_id: id, category_name: categoryName });
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return nameMap;
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

function createStats(totalFiles) {
  return {
    totalFiles,
    matched: 0,
    missingInDb: 0,
    resizeFailed: 0,
    uploadSuccess: 0,
    uploadFailed: 0,
    dbUpdated: 0,
    dbFailed: 0,
  };
}

function printSummary(label, stats, missingNames, resizeErrors, uploadErrors, dbErrors) {
  console.log(`\n${label} summary`);
  console.log(`- Total files found: ${stats.totalFiles}`);
  console.log(`- Files matched to DB: ${stats.matched}`);
  console.log(`- Files with no DB match: ${stats.missingInDb}`);
  console.log(`- Resize failed: ${stats.resizeFailed}`);
  console.log(`- Upload success: ${stats.uploadSuccess}`);
  console.log(`- Upload failed: ${stats.uploadFailed}`);
  console.log(`- DB rows updated: ${stats.dbUpdated}`);
  console.log(`- DB update failed: ${stats.dbFailed}`);

  if (missingNames.length > 0) {
    console.log("\nMissing in DB (first 50):");
    for (const name of missingNames.slice(0, 50)) console.log(`- ${name}`);
  }

  if (resizeErrors.length > 0) {
    console.log("\nResize errors (first 20):");
    for (const err of resizeErrors.slice(0, 20)) console.log(`- ${err}`);
  }

  if (uploadErrors.length > 0) {
    console.log("\nUpload errors (first 20):");
    for (const err of uploadErrors.slice(0, 20)) console.log(`- ${err}`);
  }

  if (dbErrors.length > 0) {
    console.log("\nDB update errors (first 20):");
    for (const err of dbErrors.slice(0, 20)) console.log(`- ${err}`);
  }
}

async function processItemImages(itemMap) {
  const files = await listWebpFiles(ITEMS_DATA_DIR);
  const stats = createStats(files.length);
  const missingNames = [];
  const resizeErrors = [];
  const uploadErrors = [];
  const dbErrors = [];

  console.log(`\nItems source: ${ITEMS_DATA_DIR}`);
  console.log(`Items resized output: ${ITEMS_RESIZED_DIR}`);
  console.log(`Found ${files.length} item image files.`);

  if (files.length === 0) {
    printSummary("Items", stats, missingNames, resizeErrors, uploadErrors, dbErrors);
    return;
  }

  await fs.mkdir(ITEMS_RESIZED_DIR, { recursive: true });

  const jobs = files.map((filePath) => {
    const fileName = path.basename(filePath);
    const itemSku = path.basename(fileName, path.extname(fileName)).trim();
    return { filePath, itemSku };
  });

  await runWithConcurrency(
    jobs,
    async (job, index) => {
      const item = itemMap.get(job.itemSku);
      if (!item) {
        stats.missingInDb += 1;
        missingNames.push(job.itemSku);
        return;
      }

      stats.matched += 1;

      const resizedFilePath = path.join(
        ITEMS_RESIZED_DIR,
        `${String(index).padStart(6, "0")}-${sanitizeForPath(job.itemSku)}.webp`
      );

      try {
        await resizeToWebpSquare(job.filePath, resizedFilePath, ITEM_TARGET_SIZE, PAD_COLOR, WEBP_QUALITY);
      } catch (error) {
        stats.resizeFailed += 1;
        resizeErrors.push(`${job.itemSku}: ${error.message}`);
        return;
      }

      const objectName = `${job.itemSku}.webp`;
      const objectPath = ITEM_STORAGE_PREFIX ? `${ITEM_STORAGE_PREFIX}/${objectName}` : objectName;
      const imageBuffer = await fs.readFile(resizedFilePath);

      if (!DRY_RUN) {
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, imageBuffer, {
          contentType: "image/webp",
          upsert: true,
        });

        if (uploadError) {
          stats.uploadFailed += 1;
          uploadErrors.push(`${job.itemSku}: ${uploadError.message}`);
          return;
        }
      }

      stats.uploadSuccess += 1;

      const publicUrl = toPublicUrl(SUPABASE_URL, BUCKET, objectPath);

      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from("items")
          .update({ image_urls: [publicUrl] })
          .eq("zoho_item_id", item.zoho_item_id);

        if (updateError) {
          stats.dbFailed += 1;
          dbErrors.push(`${job.itemSku}: ${updateError.message}`);
          return;
        }
      }

      stats.dbUpdated += 1;
    },
    CONCURRENCY
  );

  printSummary("Items", stats, missingNames, resizeErrors, uploadErrors, dbErrors);
}

async function processCategoryImages(categoryMap) {
  const files = await listWebpFiles(CATEGORIES_DATA_DIR);
  const stats = createStats(files.length);
  const missingNames = [];
  const resizeErrors = [];
  const uploadErrors = [];
  const dbErrors = [];

  console.log(`\nCategories source: ${CATEGORIES_DATA_DIR}`);
  console.log(`Categories resized output: ${CATEGORIES_RESIZED_DIR}`);
  console.log(`Found ${files.length} category image files.`);

  if (files.length === 0) {
    printSummary("Categories", stats, missingNames, resizeErrors, uploadErrors, dbErrors);
    return;
  }

  await fs.mkdir(CATEGORIES_RESIZED_DIR, { recursive: true });

  const jobs = files.map((filePath) => {
    const fileName = path.basename(filePath);
    const categoryName = path.basename(fileName, path.extname(fileName)).trim();
    return { filePath, categoryName };
  });

  await runWithConcurrency(
    jobs,
    async (job, index) => {
      const category = categoryMap.get(job.categoryName);
      if (!category) {
        stats.missingInDb += 1;
        missingNames.push(job.categoryName);
        return;
      }

      stats.matched += 1;

      const resizedFilePath = path.join(
        CATEGORIES_RESIZED_DIR,
        `${String(index).padStart(6, "0")}-${sanitizeForPath(job.categoryName)}.webp`
      );

      try {
        await resizeToWebpSquare(job.filePath, resizedFilePath, CATEGORY_TARGET_SIZE, PAD_COLOR, WEBP_QUALITY);
      } catch (error) {
        stats.resizeFailed += 1;
        resizeErrors.push(`${job.categoryName}: ${error.message}`);
        return;
      }

      const objectName = `${job.categoryName}.webp`;
      const objectPath = CATEGORY_STORAGE_PREFIX ? `${CATEGORY_STORAGE_PREFIX}/${objectName}` : objectName;
      const imageBuffer = await fs.readFile(resizedFilePath);

      if (!DRY_RUN) {
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, imageBuffer, {
          contentType: "image/webp",
          upsert: true,
        });

        if (uploadError) {
          stats.uploadFailed += 1;
          uploadErrors.push(`${job.categoryName}: ${uploadError.message}`);
          return;
        }
      }

      stats.uploadSuccess += 1;

      const publicUrl = toPublicUrl(SUPABASE_URL, BUCKET, objectPath);

      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from("categories")
          .update({ icon_url: publicUrl })
          .eq("zoho_category_id", category.zoho_category_id);

        if (updateError) {
          stats.dbFailed += 1;
          dbErrors.push(`${job.categoryName}: ${updateError.message}`);
          return;
        }
      }

      stats.dbUpdated += 1;
    },
    CONCURRENCY
  );

  printSummary("Categories", stats, missingNames, resizeErrors, uploadErrors, dbErrors);
}

async function main() {
  console.log("Starting image upload script (items + categories)");
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Dry run: ${DRY_RUN ? "yes" : "no"}`);
  console.log(`Item target size: ${ITEM_TARGET_SIZE}x${ITEM_TARGET_SIZE}`);
  console.log(`Category target size: ${CATEGORY_TARGET_SIZE}x${CATEGORY_TARGET_SIZE}`);
  console.log(`WebP quality: ${WEBP_QUALITY}`);
  console.log(`Item storage prefix: ${ITEM_STORAGE_PREFIX || "(none)"}`);
  console.log(`Category storage prefix: ${CATEGORY_STORAGE_PREFIX || "(none)"}`);

  await ensureBucketExists(BUCKET);

  const [itemMap, categoryMap] = await Promise.all([fetchItemsBySku(), fetchCategoriesByName()]);
  console.log(`Loaded ${itemMap.size} item SKUs from DB.`);
  console.log(`Loaded ${categoryMap.size} categories from DB.`);

  await processItemImages(itemMap);
  await processCategoryImages(categoryMap);

  if (DRY_RUN) {
    console.log("\nDry run complete. Re-run without DRY_RUN=1 to execute uploads and DB updates.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
