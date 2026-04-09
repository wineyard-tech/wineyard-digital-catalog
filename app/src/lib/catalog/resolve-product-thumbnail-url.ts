/**
 * Prefer product image slots when present; else category icon slots.
 * Legacy string-only helper for code paths that only have single URLs.
 */
export {
  pickProductImageVariant,
  itemHasProductImage,
  PRODUCT_IMAGE_W400,
  PRODUCT_IMAGE_W800,
  PRODUCT_IMAGE_W1200,
} from '@/lib/catalog/product-image-urls'

export function resolveProductThumbnailUrl(
  imageUrl: string | null | undefined,
  categoryIconUrl: string | null | undefined
): string | null {
  const img = typeof imageUrl === 'string' ? imageUrl.trim() : ''
  if (img.length > 0) return img
  const icon = typeof categoryIconUrl === 'string' ? categoryIconUrl.trim() : ''
  return icon.length > 0 ? icon : null
}
