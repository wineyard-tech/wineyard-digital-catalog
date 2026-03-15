# TraderOps Design System — Quick Reference

**For:** Frontend Developers  
**Version:** 1.0 | March 2026

---

## Design Tokens (Copy-Paste Ready)

### Colors (CSS Variables)

```css
/* Primary Palette */
--color-primary-500: #2196F3;
--color-primary-600: #1E88E5;
--color-primary-700: #1976D2;

/* Semantic Colors */
--color-success-700: #388E3C;
--color-warning-700: #F57C00;
--color-error-700: #D32F2F;

/* Neutrals */
--color-neutral-0: #FFFFFF;
--color-neutral-100: #F5F5F5;
--color-neutral-200: #EEEEEE;
--color-neutral-600: #757575;
--color-neutral-900: #212121;
```

---

### Typography

```css
/* Font Stack */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

/* Type Scale */
--font-size-sm: 14px;    /* Secondary text */
--font-size-base: 16px;  /* Body text - NEVER go below this */
--font-size-lg: 18px;    /* Emphasized text */
--font-size-xl: 20px;    /* Card titles */
--font-size-2xl: 24px;   /* Page titles */

/* Weights */
--font-weight-regular: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
```

---

### Spacing (8px Grid)

```css
--spacing-2: 8px;   /* Default spacing */
--spacing-3: 12px;  /* Comfortable */
--spacing-4: 16px;  /* Standard padding */
--spacing-6: 24px;  /* Section spacing */
--spacing-8: 32px;  /* Large spacing */
```

**Rule:** All spacing must be multiples of 4px.

---

### Shadows

```css
/* Card at rest */
--elevation-1: 0 1px 3px rgba(0,0,0,0.12);

/* Hoverable card */
--elevation-2: 0 3px 6px rgba(0,0,0,0.16);

/* Floating cart button */
--elevation-3: 0 10px 20px rgba(0,0,0,0.19);
```

---

## Component Quick Specs

### Product Card

**Grid Layout (Tailwind):**
```html
<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
  <!-- Cards -->
</div>
```

**Card Structure:**
```html
<div class="bg-white rounded-lg border border-gray-200 p-3">
  <img class="aspect-square object-cover rounded" />
  <h3 class="text-base font-medium line-clamp-2">Product Name</h3>
  <p class="text-lg font-bold text-blue-700">₹2,800</p>
  <span class="text-sm text-green-700">✓ In Stock</span>
  <button class="w-full h-10 bg-blue-500 text-white rounded">Add</button>
</div>
```

---

### Bottom Sticky Cart

```html
<div class="fixed bottom-0 left-0 right-0 h-14 bg-blue-500 text-white px-4 flex items-center justify-between shadow-lg rounded-t-xl">
  <span class="font-semibold">Cart: 8 items • ₹45,230</span>
  <button>View</button>
</div>
```

---

### Search Bar

```html
<div class="relative">
  <input 
    class="w-full h-12 px-4 pl-12 rounded-full bg-gray-100 focus:ring-2 focus:ring-blue-500"
    placeholder="Search products, brands, SKU..."
  />
  <svg class="absolute left-4 top-3 w-5 h-5 text-gray-600">
    <!-- Search icon -->
  </svg>
</div>
```

---

## Responsive Breakpoints

```css
/* Mobile-first */
sm: 640px   /* Tablet */
md: 768px   /* Tablet landscape */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
```

---

## Accessibility Checklist

- [ ] All text meets 4.5:1 contrast ratio
- [ ] Touch targets minimum 44x44px
- [ ] All images have alt text
- [ ] All buttons have aria-label
- [ ] Focus indicators visible (2px outline)
- [ ] Keyboard navigation works (Tab, Enter, Esc)
- [ ] Screen reader tested

---

## Performance Targets

- **LCP:** <2.5s (Largest Contentful Paint)
- **FID:** <100ms (First Input Delay)
- **CLS:** <0.1 (Cumulative Layout Shift)
- **Bundle size:** <150KB gzipped JS

---

## Common Patterns

### Offline Indicator

```html
<!-- Offline State -->
<div class="bg-amber-50 text-amber-900 px-4 py-2">
  ⚠️ Offline • Last synced 10:30 AM
</div>

<!-- Syncing State -->
<div class="bg-blue-50 text-blue-900 px-4 py-2">
  🔄 Syncing catalog...
</div>

<!-- Success State -->
<div class="bg-green-50 text-green-900 px-4 py-2">
  ✓ Updated 2 min ago
</div>
```

---

### Stock Indicators

```html
<!-- In Stock -->
<span class="text-green-700">✓ In Stock • 47 units</span>

<!-- Limited Stock -->
<span class="bg-amber-50 text-amber-900 px-2 py-1 rounded">
  ⚠ Limited • 4 units left
</span>

<!-- Out of Stock -->
<span class="text-red-700">✗ Out of Stock</span>
```

---

### Filter Chips

```html
<div class="flex gap-2 overflow-x-auto">
  <!-- Active Chip -->
  <button class="px-4 h-9 bg-blue-500 text-white rounded-full font-medium whitespace-nowrap">
    All
  </button>
  
  <!-- Inactive Chip -->
  <button class="px-4 h-9 bg-gray-100 text-gray-700 rounded-full border border-gray-300 whitespace-nowrap">
    2MP
  </button>
</div>
```

---

## State Management for Offline

**Pattern:** Local-first, sync in background

```javascript
// Pseudo-code
const addToCart = (product) => {
  // 1. Update local state immediately (optimistic UI)
  cart.add(product);
  
  // 2. Show feedback instantly
  showToast("Added to cart");
  
  // 3. Sync to server in background (if online)
  if (navigator.onLine) {
    syncToServer(cart);
  } else {
    queueForSync(cart);
  }
}
```

---

## Animation Guidelines

**Durations:**
- Button press: 100ms
- Hover state: 200ms
- Modal open: 300ms
- Page transition: 500ms

**Easing:**
```css
transition: all 300ms cubic-bezier(0.4, 0.0, 0.2, 1);
```

**Rule:** Keep animations <300ms on mobile for perceived speed.

---

## Image Optimization

**Product Images:**
```html
<img 
  src="product-600w.webp"
  srcset="product-600w.webp 1x, product-1200w.webp 2x"
  alt="Hikvision DS-2CD2143G2 PTZ Camera"
  loading="lazy"
  class="aspect-square object-cover"
/>
```

**Specifications:**
- Format: WebP (fallback JPEG)
- Dimensions: 600x600 (1x), 1200x1200 (2x)
- Compression: 80% quality
- Lazy load: below fold

---

## Module Feature Flags

**Enable per distributor:**

```javascript
const distributorConfig = {
  enableCredit: true,        // Module 1
  enablePromotions: true,    // Module 2
  enableMultiOutlet: true,   // Module 3
  enableBatchTracking: false,// Module 4 (pharma only)
  enableProjects: false,     // Module 5
  enableLoyaltyTiers: true   // Module 6
};
```

---

## Testing Checklist

### Devices
- [ ] iPhone SE (375px width)
- [ ] iPhone 14 (390px width)
- [ ] Android mid-range (412px width)
- [ ] iPad (768px, 1024px)
- [ ] Desktop (1440px)

### Browsers
- [ ] Chrome (mobile + desktop)
- [ ] Safari (iOS + macOS)
- [ ] Firefox
- [ ] Samsung Internet (Android)

### Network Conditions
- [ ] 3G throttled
- [ ] Offline mode
- [ ] Connection loss during action
- [ ] Intermittent connectivity

---

## Common Mistakes to Avoid

❌ **Don't:**
- Use font-size below 16px for body text
- Create touch targets smaller than 44x44px
- Block UI while syncing
- Show generic "Loading..." without context
- Use percentage-based table widths in generated documents

✅ **Do:**
- Test on real devices (not just emulators)
- Show optimistic UI (instant feedback)
- Queue actions offline, sync later
- Use specific loading messages ("Syncing catalog...")
- Use DXA units for tables in .docx files

---

**For full specifications, see:** `TraderOps_Design_System.md`
