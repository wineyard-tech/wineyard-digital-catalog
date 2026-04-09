#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load `app/.env.local` into process.env (only keys not already set).
 * Same line format as Next.js: KEY=value, optional quotes, # comments.
 */
function loadAppEnvLocal() {
  const dotenvPath = path.join(scriptDir, "../app/.env.local");
  try {
    const raw = readFileSync(dotenvPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn(`Warning: could not read ${dotenvPath}: ${err.message}`);
    }
  }
}

loadAppEnvLocal();

if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

/** Resolve SDK from repo root `node_modules` or `app/node_modules` (where Next installs deps). */
let createClient;
try {
  ({ createClient } = await import("@supabase/supabase-js"));
} catch (rootErr) {
  const fallbackPkg = path.join(scriptDir, "../app/node_modules/@supabase/supabase-js/dist/index.mjs");
  try {
    ({ createClient } = await import(pathToFileURL(fallbackPkg).href));
  } catch (appErr) {
    console.error("MODULE_NOT_FOUND: could not load @supabase/supabase-js.");
    console.error(`  Tried package import: ${rootErr.message}`);
    console.error(`  Tried ${fallbackPkg}: ${appErr.message}`);
    console.error("Fix: run `npm install` in the repo root and/or `cd app && npm install`.");
    process.exit(1);
  }
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
const PAD_COLOR = (process.env.PAD_COLOR || "FFFFFF").replace(/^#/, "");
const WEBP_QUALITY = Number(process.env.WEBP_QUALITY || 82);

/** Three responsive variants: [400, 800, 1200] — DB `image_urls` / `icon_urls` order must match. */
const VARIANT_WIDTHS = [400, 800, 1200];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function zeroPerVariant() {
  return Object.fromEntries(VARIANT_WIDTHS.map((w) => [w, 0]));
}

function createVariantStats() {
  return {
    generated: zeroPerVariant(),
    skippedDisk: zeroPerVariant(),
    resizeFailed: zeroPerVariant(),
    uploaded: zeroPerVariant(),
    uploadFailed: zeroPerVariant(),
  };
}

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

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
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
    dbUpdated: 0,
    dbFailed: 0,
    partialUploadSkippedDb: 0,
  };
}

function printVariantStats(label, vstats) {
  console.log(`\n${label} variant stats (per width)`);
  for (const w of VARIANT_WIDTHS) {
    console.log(
      `  ${w}w: generated=${vstats.generated[w]} skipped_disk=${vstats.skippedDisk[w]} resize_failed=${vstats.resizeFailed[w]} uploaded=${vstats.uploaded[w]} upload_failed=${vstats.uploadFailed[w]}`
    );
  }
}

function printSummary(label, stats, missingNames, resizeErrors, uploadErrors, dbErrors, vstats) {
  console.log(`\n${label} summary`);
  console.log(`- Total source files: ${stats.totalFiles}`);
  console.log(`- Files matched to DB: ${stats.matched}`);
  console.log(`- Files with no DB match: ${stats.missingInDb}`);
  console.log(`- DB rows updated (all ${VARIANT_WIDTHS.length} variants OK): ${stats.dbUpdated}`);
  console.log(`- DB update failed: ${stats.dbFailed}`);
  console.log(`- Skipped DB update (incomplete variant set): ${stats.partialUploadSkippedDb}`);

  printVariantStats(label, vstats);

  if (missingNames.length > 0) {
    console.log("\nMissing in DB (first 50):");
    for (const name of missingNames.slice(0, 50)) console.log(`- ${name}`);
  }

  if (resizeErrors.length > 0) {
    console.log("\nResize errors (first 40):");
    for (const err of resizeErrors.slice(0, 40)) console.log(`- ${err}`);
  }

  if (uploadErrors.length > 0) {
    console.log("\nUpload errors (first 40):");
    for (const err of uploadErrors.slice(0, 40)) console.log(`- ${err}`);
  }

  if (dbErrors.length > 0) {
    console.log("\nDB update errors (first 20):");
    for (const err of dbErrors.slice(0, 20)) console.log(`- ${err}`);
  }
}

/**
 * Process one source image → three local files → three uploads → ordered public URLs.
 * DB is updated only when `publicUrls.length === VARIANT_WIDTHS.length` (and not DRY_RUN).
 * DRY_RUN: no Sharp, no disk writes, no Storage uploads — only logs and hypothetical URLs.
 */
async function processFourVariants({
  entityLabel,
  sourceFilePath,
  safeBaseName,
  storagePrefix,
  resizedDir,
  resizeErrors,
  uploadErrors,
  vstats,
}) {
  const publicUrls = [];

  for (const w of VARIANT_WIDTHS) {
    const fileName = `${safeBaseName}-${w}w.webp`;
    const localPath = path.join(resizedDir, fileName);
    const objectPath = storagePrefix ? `${storagePrefix}/${fileName}` : fileName;
    const hypotheticalUrl = toPublicUrl(SUPABASE_URL, BUCKET, objectPath);

    if (DRY_RUN) {
      const onDisk = await fileExists(localPath);
      if (onDisk) {
        vstats.skippedDisk[w] += 1;
        console.log(`[dry-run] ${entityLabel}: ${w}w — file on disk, would upload ${objectPath}`);
      } else {
        console.log(`[dry-run] ${entityLabel}: ${w}w — would Sharp → ${localPath} → upload ${objectPath}`);
      }
      publicUrls.push(hypotheticalUrl);
      continue;
    }

    const onDisk = await fileExists(localPath);
    if (onDisk) {
      vstats.skippedDisk[w] += 1;
    } else {
      try {
        await resizeToWebpSquare(sourceFilePath, localPath, w, PAD_COLOR, WEBP_QUALITY);
        vstats.generated[w] += 1;
      } catch (error) {
        vstats.resizeFailed[w] += 1;
        resizeErrors.push(`${entityLabel} ${w}w resize: ${error.message}`);
        continue;
      }
    }

    let imageBuffer;
    try {
      imageBuffer = await fs.readFile(localPath);
    } catch (error) {
      vstats.uploadFailed[w] += 1;
      uploadErrors.push(`${entityLabel} ${w}w: cannot read ${localPath}: ${error.message}`);
      continue;
    }

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, imageBuffer, {
      contentType: "image/webp",
      upsert: true,
    });

    if (uploadError) {
      vstats.uploadFailed[w] += 1;
      uploadErrors.push(`${entityLabel} ${w}w upload: ${uploadError.message}`);
      continue;
    }

    vstats.uploaded[w] += 1;
    publicUrls.push(hypotheticalUrl);
  }

  return publicUrls;
}

async function processItemImages(itemMap) {
  const files = await listWebpFiles(ITEMS_DATA_DIR);
  const stats = createStats(files.length);
  const vstats = createVariantStats();
  const missingNames = [];
  const resizeErrors = [];
  const uploadErrors = [];
  const dbErrors = [];

  console.log(`\nItems source: ${ITEMS_DATA_DIR}`);
  console.log(`Items resized output: ${ITEMS_RESIZED_DIR}`);
  console.log(`Found ${files.length} item image files.`);
  console.log(`Variants per item: ${VARIANT_WIDTHS.map((w) => `${w}w`).join(", ")}`);

  if (files.length === 0) {
    printSummary("Items", stats, missingNames, resizeErrors, uploadErrors, dbErrors, vstats);
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
    async (job) => {
      const item = itemMap.get(job.itemSku);
      if (!item) {
        stats.missingInDb += 1;
        missingNames.push(job.itemSku);
        return;
      }

      stats.matched += 1;
      const safeBase = sanitizeForPath(job.itemSku);
      const entityLabel = `SKU ${job.itemSku}`;

      const publicUrls = await processFourVariants({
        entityLabel,
        sourceFilePath: job.filePath,
        safeBaseName: safeBase,
        storagePrefix: ITEM_STORAGE_PREFIX,
        resizedDir: ITEMS_RESIZED_DIR,
        resizeErrors,
        uploadErrors,
        vstats,
      });

      if (publicUrls.length !== VARIANT_WIDTHS.length) {
        stats.partialUploadSkippedDb += 1;
        console.warn(
          `[skip-db] ${entityLabel}: only ${publicUrls.length}/${VARIANT_WIDTHS.length} variants ready — not updating items.image_urls`
        );
        return;
      }

      if (DRY_RUN) {
        console.log(
          `[dry-run] ${entityLabel}: would set items.image_urls to ${VARIANT_WIDTHS.length} URLs (${VARIANT_WIDTHS.map((w) => `${w}w`).join(", ")})`
        );
        stats.dbUpdated += 1;
        return;
      }

      const { error: updateError } = await supabase
        .from("items")
        .update({ image_urls: publicUrls })
        .eq("zoho_item_id", item.zoho_item_id);

      if (updateError) {
        stats.dbFailed += 1;
        dbErrors.push(`${job.itemSku}: ${updateError.message}`);
        return;
      }

      stats.dbUpdated += 1;
      console.log(
        `OK ${entityLabel}: ${VARIANT_WIDTHS.length} variants uploaded + DB updated (${VARIANT_WIDTHS.map((w) => `${w}w`).join(", ")})`
      );
    },
    CONCURRENCY
  );

  printSummary("Items", stats, missingNames, resizeErrors, uploadErrors, dbErrors, vstats);
}

async function processCategoryImages(categoryMap) {
  const files = await listWebpFiles(CATEGORIES_DATA_DIR);
  const stats = createStats(files.length);
  const vstats = createVariantStats();
  const missingNames = [];
  const resizeErrors = [];
  const uploadErrors = [];
  const dbErrors = [];

  console.log(`\nCategories source: ${CATEGORIES_DATA_DIR}`);
  console.log(`Categories resized output: ${CATEGORIES_RESIZED_DIR}`);
  console.log(`Found ${files.length} category image files.`);

  if (files.length === 0) {
    printSummary("Categories", stats, missingNames, resizeErrors, uploadErrors, dbErrors, vstats);
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
    async (job) => {
      const category = categoryMap.get(job.categoryName);
      if (!category) {
        stats.missingInDb += 1;
        missingNames.push(job.categoryName);
        return;
      }

      stats.matched += 1;
      const safeBase = sanitizeForPath(job.categoryName);
      const entityLabel = `Category "${job.categoryName}"`;

      const publicUrls = await processFourVariants({
        entityLabel,
        sourceFilePath: job.filePath,
        safeBaseName: safeBase,
        storagePrefix: CATEGORY_STORAGE_PREFIX,
        resizedDir: CATEGORIES_RESIZED_DIR,
        resizeErrors,
        uploadErrors,
        vstats,
      });

      if (publicUrls.length !== VARIANT_WIDTHS.length) {
        stats.partialUploadSkippedDb += 1;
        console.warn(
          `[skip-db] ${entityLabel}: only ${publicUrls.length}/${VARIANT_WIDTHS.length} variants ready — not updating categories`
        );
        return;
      }

      if (DRY_RUN) {
        console.log(
          `[dry-run] ${entityLabel}: would set categories.icon_urls + icon_url (1200w slot) (${VARIANT_WIDTHS.map((w) => `${w}w`).join(", ")})`
        );
        stats.dbUpdated += 1;
        return;
      }

      const iconLargest = publicUrls[2];
      const { error: updateError } = await supabase
        .from("categories")
        .update({ icon_urls: publicUrls, icon_url: iconLargest })
        .eq("zoho_category_id", category.zoho_category_id);

      if (updateError) {
        stats.dbFailed += 1;
        dbErrors.push(`${job.categoryName}: ${updateError.message}`);
        return;
      }

      stats.dbUpdated += 1;
      console.log(
        `OK ${entityLabel}: ${VARIANT_WIDTHS.length} variants uploaded + DB updated (${VARIANT_WIDTHS.map((w) => `${w}w`).join(", ")})`
      );
    },
    CONCURRENCY
  );

  printSummary("Categories", stats, missingNames, resizeErrors, uploadErrors, dbErrors, vstats);
}

async function main() {
  console.log(`Starting image upload script (items + categories) — ${VARIANT_WIDTHS.length} WebP variants each`);
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Dry run: ${DRY_RUN ? "yes" : "no"}`);
  console.log(`Variant widths: ${VARIANT_WIDTHS.join(", ")}`);
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
