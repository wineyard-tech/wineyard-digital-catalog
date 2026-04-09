/** Ordered DB slots: [400×400, 800×800, 1200×1200] WebP public URLs */

export const PRODUCT_IMAGE_W400 = 0
export const PRODUCT_IMAGE_W800 = 1
export const PRODUCT_IMAGE_W1200 = 2

export type ProductImageVariantIndex = 0 | 1 | 2

/** Prefer larger slots when the requested size is missing. */
const FALLBACK_ORDER: readonly ProductImageVariantIndex[] = [2, 1, 0]

/**
 * Normalize `items.image_urls` JSONB: three strings, or legacy shapes.
 */
export function normalizeItemImageUrls(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const urls = raw
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (urls.length === 0) return null
  if (urls.length === 3) return urls
  // Legacy four-slot [70w, 200w, 400w, 800w] → use 400, 800, duplicate 800 as 1200 stand-in until re-upload
  if (urls.length === 4) {
    const w400 = urls[2] || urls[3]
    const w800 = urls[3] || urls[2]
    return [w400, w800, w800]
  }
  const u = urls[0]
  return [u, u, u]
}

/**
 * Prefer `categories.icon_urls` (3 slots); else legacy `icon_url` repeated.
 */
export function normalizeCategoryIconUrls(
  iconUrlsRaw: unknown,
  iconUrlLegacy: string | null | undefined
): string[] | null {
  const fromArray = normalizeItemImageUrls(iconUrlsRaw)
  if (fromArray) return fromArray
  const leg = typeof iconUrlLegacy === 'string' ? iconUrlLegacy.trim() : ''
  if (!leg) return null
  return [leg, leg, leg]
}

export function itemHasProductImage(itemUrls: string[] | null | undefined): boolean {
  return Boolean(itemUrls?.some((u) => typeof u === 'string' && u.trim().length > 0))
}

function pickFromSlots(urls: string[] | null | undefined, variant: ProductImageVariantIndex): string | null {
  if (!urls || urls.length === 0) return null
  const direct = urls[variant]?.trim()
  if (direct) return direct
  for (const j of FALLBACK_ORDER) {
    const u = urls[j]?.trim()
    if (u) return u
  }
  return null
}

/**
 * Prefer item slots when the item has any product image; else category slots.
 */
export function pickProductImageVariant(
  itemUrls: string[] | null | undefined,
  categoryUrls: string[] | null | undefined,
  variant: ProductImageVariantIndex
): string | null {
  if (itemHasProductImage(itemUrls)) {
    const v = pickFromSlots(itemUrls, variant)
    if (v) return v
  }
  return pickFromSlots(categoryUrls ?? null, variant)
}
