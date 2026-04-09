-- Ordered WebP variant public URLs: [70w, 200w, 400w, 800w] — populated by scripts/upload-item-images.mjs
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS icon_urls jsonb;

COMMENT ON COLUMN public.categories.icon_urls IS 'JSON array of 3 public image URLs in order: 400×400, 800×800, 1200×1200 WebP.';
