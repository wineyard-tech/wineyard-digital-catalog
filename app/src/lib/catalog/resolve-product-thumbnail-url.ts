/**
 * Prefer product image (first of `image_urls` on the server, exposed as `image_url`);
 * when missing or empty, use the category's `icon_url` (APIs expose as `category_icon_url`).
 */
export function resolveProductThumbnailUrl(
  imageUrl: string | null | undefined,
  categoryIconUrl: string | null | undefined
): string | null {
  const img = typeof imageUrl === 'string' ? imageUrl.trim() : ''
  if (img.length > 0) return img
  const icon = typeof categoryIconUrl === 'string' ? categoryIconUrl.trim() : ''
  return icon.length > 0 ? icon : null
}
