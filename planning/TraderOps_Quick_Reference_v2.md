# TraderOps Design System — Quick Reference v2.0

**For:** Frontend Developers  
**Version:** 2.0 | March 2026  
**Updated:** Complete redesign with Blinkit/Instamart patterns

---

## What Changed in v2.0

**Major Updates:**
- Product cards redesigned (image overlays, rounded borders)
- Scroll behaviors defined (sticky header collapse)
- Product Detail screen specs added
- Navigation restructured (4 tabs + floating cart)
- Bottom sticky cart with thumbnails
- Screen transitions (no bottom sheets)
- Variant selector grid pattern
- Out-of-stock simplified (Notify Me only)

---

## Design Tokens (CSS Variables)

### Colors

```css
/* Primary Palette */
--color-primary-500: #2196F3;
--color-primary-600: #1E88E5;
--color-primary-700: #1976D2;

/* Semantic Colors */
--color-success-700: #388E3C;  /* Green - in stock, cart */
--color-warning-500: #FF9800;  /* Amber - discounts, alerts */
--color-warning-700: #F57C00;  /* Dark amber - limited stock */
--color-error-700: #D32F2F;    /* Red - out of stock */

/* Neutrals */
--color-neutral-0: #FFFFFF;    /* White backgrounds */
--color-neutral-50: #FAFAFA;   /* Card backgrounds */
--color-neutral-100: #F5F5F5;  /* Disabled, search bar bg */
--color-neutral-200: #EEEEEE;  /* Borders */
--color-neutral-300: #E0E0E0;  /* Inactive elements */
--color-neutral-500: #9E9E9E;  /* Placeholder text */
--color-neutral-600: #757575;  /* Body text */
--color-neutral-700: #616161;  /* Headings */
--color-neutral-900: #212121;  /* Maximum contrast */
```

---

### Typography

```css
/* Font Stack */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

/* Type Scale */
--font-size-xs: 12px;    /* Labels, badges */
--font-size-sm: 14px;    /* Secondary text */
--font-size-base: 16px;  /* Body text - NEVER go below */
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
--spacing-1: 4px;   /* Tight spacing */
--spacing-2: 8px;   /* Default gap */
--spacing-3: 12px;  /* Comfortable */
--spacing-4: 16px;  /* Standard padding */
--spacing-6: 24px;  /* Section spacing */
--spacing-8: 32px;  /* Large spacing */
```

**Rule:** All spacing must be multiples of 4px.

---

### Border Radius

```css
--radius-sm: 4px;      /* Badges, chips */
--radius-base: 8px;    /* Default cards, buttons */
--radius-lg: 12px;     /* Product images */
--radius-xl: 16px;     /* Modal corners, cart */
--radius-full: 9999px; /* Pills, circles */
```

---

### Shadows

```css
/* Card at rest */
--elevation-1: 0 1px 3px rgba(0,0,0,0.12);

/* Hoverable card */
--elevation-2: 0 3px 6px rgba(0,0,0,0.16);

/* Floating cart, sticky footer */
--elevation-3: 0 10px 20px rgba(0,0,0,0.19);
```

---

## Navigation & Tabs

### Bottom Tab Bar

```html
<nav class="fixed bottom-0 left-0 right-0 h-14 bg-white border-t flex">
  <button class="flex-1">Home</button>
  <button class="flex-1">Buy Again</button>
  <button class="flex-1">Categories</button>
  <button class="flex-1">Orders</button>
</nav>
```

**Tabs:**
- Home: Catalog browse, search
- Buy Again: Previously ordered items
- Categories: Products by category
- Orders: Order history

**Not Tabs:**
- Cart: Floating button (bottom-center)
- Account: User avatar (top-right)

---

## Scroll Behaviors (Blinkit Pattern)

### Header States

**State 1: Full Header (At Top)**
```html
<header class="h-40 bg-white">
  <div class="flex items-center justify-between px-4 h-14">
    <button>📍 Himayatnagar Warehouse ▼</button>
    <button class="w-10 h-10 rounded-full">👤</button>
  </div>
  <div class="px-4 h-12">
    <input class="w-full h-12 px-4 rounded-full bg-gray-100" 
           placeholder="Search for 'spike box'..." />
  </div>
  <div class="flex gap-2 px-4 overflow-x-auto">
    <button class="px-4 h-9 rounded-full bg-blue-500 text-white">All</button>
    <button class="px-4 h-9 rounded-full bg-gray-100">Cameras</button>
  </div>
</header>
```

**State 2: Collapsed Header (Scrolled Down)**
```html
<header class="h-24 bg-white sticky top-0 shadow-sm">
  <div class="px-4 h-12">
    <input class="w-full h-12 px-4 rounded-full bg-gray-100" />
  </div>
  <div class="flex gap-2 px-4 overflow-x-auto">
    <!-- Category chips -->
  </div>
</header>
<!-- Bottom tabs HIDDEN -->
```

**State 3: Scroll Up (Tabs Reappear)**
```html
<!-- Header stays collapsed -->
<!-- Bottom tabs VISIBLE -->
```

### Implementation (JavaScript)

```javascript
let lastScrollY = 0;
const SCROLL_THRESHOLD = 50;

window.addEventListener('scroll', () => {
  const currentScrollY = window.scrollY;
  const scrollingDown = currentScrollY > lastScrollY;
  const atTop = currentScrollY < SCROLL_THRESHOLD;
  
  if (atTop) {
    header.classList.add('expanded');
    bottomTabs.classList.remove('hidden');
  } else if (scrollingDown) {
    header.classList.add('collapsed');
    bottomTabs.classList.add('hidden');
  } else {
    header.classList.add('collapsed');
    bottomTabs.classList.remove('hidden');
  }
  
  lastScrollY = currentScrollY;
});
```

---

## Product Card (Redesigned)

### Structure

```html
<div class="relative bg-white rounded-lg">
  <!-- Top Badge (Discount/Promotion) -->
  <div class="absolute top-2 left-1/2 -translate-x-1/2 z-10">
    <span class="px-2 py-1 text-xs font-bold text-white bg-amber-500 rounded">
      15% OFF
    </span>
  </div>
  
  <!-- Product Image -->
  <img 
    src="product.webp" 
    class="w-full aspect-square object-cover rounded-xl" 
    alt="Product"
  />
  
  <!-- Bottom-Right Add Button Overlay -->
  <button class="absolute bottom-2 right-2 w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center">
    +
  </button>
  <!-- OR when in cart: -->
  <div class="absolute bottom-2 right-2 flex items-center gap-2 px-2 h-8 bg-green-700 text-white rounded-full">
    <button>−</button>
    <span>2</span>
    <button>+</button>
  </div>
  
  <!-- Product Info -->
  <div class="p-3 pt-2">
    <h3 class="text-base font-medium text-gray-900 truncate">
      Hikvision PTZ Camera
    </h3>
    <p class="text-sm text-gray-600 truncate">
      4MP • IR 30m
    </p>
    <div class="flex items-center gap-2 mt-1">
      <span class="text-lg font-bold text-gray-900">₹2,800</span>
      <span class="text-sm text-gray-500 line-through">₹3,200</span>
    </div>
  </div>
</div>
```

### Grid Layout (Tailwind)

```html
<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
  <!-- Product cards -->
</div>
```

**Responsive:**
- Mobile (<640px): 2 columns, 12px gap
- Tablet (640-1024px): 3 columns, 16px gap
- Desktop (>1024px): 4 columns, 20px gap

---

### Out-of-Stock State

```html
<div class="relative bg-white rounded-lg opacity-60">
  <!-- Top Badge: Out of Stock -->
  <div class="absolute top-2 left-1/2 -translate-x-1/2 z-10">
    <span class="px-2 py-1 text-xs font-bold text-white bg-red-700 rounded">
      Out of Stock
    </span>
  </div>
  
  <!-- Image with Grayscale -->
  <img 
    class="w-full aspect-square object-cover rounded-xl grayscale" 
    src="product.webp"
  />
  
  <!-- Notify Button (replaces Add) -->
  <button class="absolute bottom-2 right-2 px-3 h-8 bg-blue-500 text-white text-sm rounded-full">
    Notify
  </button>
  
  <!-- Product info remains same -->
</div>
```

---

## Bottom Sticky Cart (with Thumbnails)

```html
<div class="fixed bottom-0 left-0 right-0 h-16 bg-green-700 text-white px-4 flex items-center justify-between rounded-t-2xl shadow-2xl">
  <!-- Thumbnails (max 3) -->
  <div class="flex -space-x-2">
    <img src="item1.jpg" class="w-10 h-10 rounded-lg border-2 border-white" />
    <img src="item2.jpg" class="w-10 h-10 rounded-lg border-2 border-white" />
    <img src="item3.jpg" class="w-10 h-10 rounded-lg border-2 border-white" />
  </div>
  
  <!-- Text -->
  <div class="flex-1 px-4">
    <div class="text-lg font-semibold">View Cart</div>
    <div class="text-sm opacity-90">8 items</div>
  </div>
  
  <!-- Arrow -->
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
  </svg>
</div>
```

**States:**
- Empty: Hidden
- 1-3 items: Show actual thumbnails
- 4+ items: Show first 3 thumbnails

---

## Search Bar (Rotating Placeholders)

```html
<input 
  id="searchInput"
  class="w-full h-12 px-4 pl-12 rounded-full bg-gray-100 focus:ring-2 focus:ring-blue-500"
  placeholder="Search for 'spike box'..."
/>

<script>
const placeholders = [
  "Search for '4mp wifi camera'",
  "Search for 'spike box'",
  "Search for 'HDMI cable'",
  "Search for 'PTZ camera'",
  "Search for 'NVR 16 channel'"
];

let currentIndex = 0;

setInterval(() => {
  const input = document.getElementById('searchInput');
  if (!input.value) {
    input.placeholder = placeholders[currentIndex];
    currentIndex = (currentIndex + 1) % placeholders.length;
  }
}, 3000);
</script>
```

---

## Category Grouping (+X More Pattern)

### Collapsed State

```html
<div class="mb-6">
  <button class="flex items-center justify-between w-full mb-3">
    <h2 class="text-lg font-semibold">Cameras (12 items)</h2>
    <span class="text-sm text-gray-600">+9 more</span>
  </button>
  
  <div class="grid grid-cols-2 gap-3">
    <!-- Show first 3 products only -->
    <div>Product 1</div>
    <div>Product 2</div>
    <div>Product 3</div>
  </div>
</div>
```

### Expanded State

```html
<div class="mb-6">
  <button class="flex items-center justify-between w-full mb-3">
    <h2 class="text-lg font-semibold">Cameras (12 items)</h2>
    <span class="text-sm text-gray-600">▲</span>
  </button>
  
  <div class="grid grid-cols-2 gap-3">
    <!-- Show all 12 products -->
  </div>
</div>
```

---

## Product Detail Screen

### Top Bar (Sticky)

```html
<div class="sticky top-0 z-50 h-14 bg-white border-b flex items-center justify-between px-4">
  <button class="w-10 h-10">←</button>
  <button class="w-10 h-10">🔍</button>
  <button class="w-10 h-10">↗️</button>
</div>
```

---

### Hero Image Carousel

```html
<div class="relative w-full aspect-square bg-gray-100">
  <img src="product-1.jpg" class="w-full h-full object-cover" />
  
  <!-- Dots Indicator -->
  <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
    <div class="w-2 h-2 rounded-full bg-blue-500"></div>
    <div class="w-2 h-2 rounded-full bg-gray-300"></div>
    <div class="w-2 h-2 rounded-full bg-gray-300"></div>
  </div>
</div>
```

---

### Product Info

```html
<div class="px-4 pt-4">
  <!-- Name -->
  <h1 class="text-2xl font-bold text-gray-900">
    Hikvision DS-2CD2143G2
  </h1>
  
  <!-- Variant Detail -->
  <p class="text-base text-gray-600 mt-1">
    4MP PTZ Camera • IR 30m
  </p>
  
  <!-- Ratings (optional) -->
  <div class="flex items-center gap-2 mt-2">
    <div class="flex text-amber-500">
      ★★★★☆
    </div>
    <span class="text-sm text-gray-600">4.1 (253 reviews)</span>
  </div>
  
  <!-- Price -->
  <div class="flex items-center gap-3 mt-3">
    <span class="text-2xl font-bold text-gray-900">₹2,800</span>
    <span class="text-lg text-gray-500 line-through">₹3,200</span>
    <span class="text-sm font-semibold text-green-700">15% OFF</span>
  </div>
</div>
```

---

### Collapsible Product Details

```html
<div class="mx-4 mt-6 bg-gray-50 rounded-lg p-4">
  <button class="flex items-center justify-between w-full">
    <h3 class="text-lg font-semibold">Product Details</h3>
    <span>▼</span>
  </button>
  
  <ul class="mt-3 space-y-2 text-base text-gray-700">
    <li>• Resolution: 4MP (2688x1520)</li>
    <li>• IR Range: 30 meters</li>
    <li>• Lens: 2.8-12mm varifocal</li>
    <li>• Power: PoE / 12V DC</li>
  </ul>
</div>
```

---

### Brand Exploration CTA

```html
<div class="mx-4 mt-6 border border-gray-200 rounded-lg p-4 flex items-center justify-between">
  <div class="flex items-center gap-3">
    <img src="hikvision-logo.png" class="w-10 h-10 rounded" />
    <div>
      <div class="text-lg font-semibold">Hikvision</div>
      <div class="text-sm text-gray-600">Explore all products</div>
    </div>
  </div>
  <svg class="w-5 h-5 text-gray-400">→</svg>
</div>
```

---

### Recommendation Sections (Horizontal Scroll)

```html
<div class="mt-8">
  <h3 class="px-4 text-lg font-semibold mb-3">People also bought</h3>
  
  <div class="flex gap-3 px-4 overflow-x-auto no-scrollbar">
    <!-- Product Cards (140px width each) -->
    <div class="flex-none w-[140px]">
      <!-- Product card -->
    </div>
    <div class="flex-none w-[140px]">
      <!-- Product card -->
    </div>
    <!-- ... more cards -->
  </div>
</div>

<!-- Repeat for "Similar Products" and "Top in Category" -->
```

**CSS for hiding scrollbar:**
```css
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

---

### Sticky Footer (Variant Selector + Add)

**No Variants:**
```html
<div class="fixed bottom-0 left-0 right-0 h-18 bg-white border-t shadow-2xl px-4 flex items-center justify-between">
  <div class="flex-1">
    <div class="text-base font-medium text-gray-700">4MP • 30m IR</div>
    <div class="text-xl font-bold text-gray-900">₹2,800</div>
  </div>
  
  <button class="px-6 h-12 bg-green-700 text-white rounded-lg font-semibold">
    Add +
  </button>
</div>
```

**With Variants (<5 variants):**
```html
<div class="fixed bottom-0 left-0 right-0 bg-white border-t shadow-2xl p-4">
  <!-- Variant Grid -->
  <div class="grid grid-cols-3 gap-2 mb-3">
    <button class="h-20 border-2 border-gray-300 rounded-lg p-2 text-center">
      <div class="text-sm font-semibold">2MP</div>
      <div class="text-sm text-gray-600">₹2,000</div>
    </button>
    <button class="h-20 border-2 border-blue-500 bg-blue-50 rounded-lg p-2 text-center">
      <div class="text-sm font-semibold">4MP</div>
      <div class="text-sm text-gray-600">₹2,800</div>
    </button>
    <button class="h-20 border-2 border-gray-300 rounded-lg p-2 text-center">
      <div class="text-sm font-semibold">8MP</div>
      <div class="text-sm text-gray-600">₹4,000</div>
    </button>
  </div>
  
  <!-- Price + Add -->
  <div class="flex items-center justify-between">
    <div class="flex-1">
      <div class="text-base font-medium text-gray-700">4MP • 30m IR</div>
      <div class="text-xl font-bold text-gray-900">₹2,800</div>
    </div>
    <button class="px-6 h-12 bg-green-700 text-white rounded-lg font-semibold">
      Add +
    </button>
  </div>
</div>
```

---

## Screen Transitions

### Horizontal (Slide Left/Right)

```css
/* Enter from right */
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0.8;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Exit to left */
@keyframes slideOutLeft {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-30%);
    opacity: 0.5;
  }
}

.screen-enter {
  animation: slideInRight 300ms cubic-bezier(0.4, 0.0, 0.2, 1);
}

.screen-exit {
  animation: slideOutLeft 300ms cubic-bezier(0.4, 0.0, 0.2, 1);
}
```

---

### Vertical (Slide Up/Down - Cart Only)

```css
/* Slide up from bottom */
@keyframes slideUpFromBottom {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

/* Slide down to bottom */
@keyframes slideDownToBottom {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}

.cart-enter {
  animation: slideUpFromBottom 300ms cubic-bezier(0.4, 0.0, 0.2, 1);
}

.cart-exit {
  animation: slideDownToBottom 300ms cubic-bezier(0.4, 0.0, 0.2, 1);
}
```

---

## Add-to-Cart Animation

```css
.add-button {
  transition: all 200ms cubic-bezier(0.4, 0.0, 0.2, 1);
}

.add-button:active {
  transform: scale(1.1);
}

/* Morph from circle to pill */
.add-button.expanded {
  width: 80px;
  border-radius: 9999px;
}

/* Cart badge bounce */
@keyframes bounce {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.cart-badge.updated {
  animation: bounce 300ms ease-in-out;
}
```

---

## Offline Indicator

```html
<!-- Offline State -->
<div class="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-2">
  <span class="text-amber-900">⚠️</span>
  <div class="text-sm font-medium text-amber-900">
    Offline • Last synced 10:30 AM
  </div>
</div>

<!-- Syncing State -->
<div class="bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center gap-2">
  <svg class="animate-spin w-4 h-4 text-blue-900">🔄</svg>
  <div class="text-sm font-medium text-blue-900">
    Syncing catalog...
  </div>
</div>

<!-- Success State (auto-dismiss after 3s) -->
<div class="bg-green-50 border-b border-green-200 px-4 py-3 flex items-center gap-2">
  <span class="text-green-900">✓</span>
  <div class="text-sm font-medium text-green-900">
    Updated 2 min ago
  </div>
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

**Usage:**
```html
<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
  <!-- 2 cols mobile, 3 cols tablet, 4 cols desktop -->
</div>
```

---

## Image Optimization

### Product Thumbnails (Grid)

```html
<img 
  src="product-300w.webp"
  srcset="product-300w.webp 1x, product-600w.webp 2x"
  alt="Hikvision PTZ Camera"
  loading="lazy"
  class="w-full aspect-square object-cover rounded-xl"
/>
```

**Specs:**
- Format: WebP (fallback JPEG)
- Dimensions: 300x300 (1x), 600x600 (2x)
- Compression: 80% quality
- Lazy load: below fold

---

### Hero Images (Product Detail)

```html
<img 
  src="product-800w.webp"
  srcset="product-800w.webp 1x, product-1600w.webp 2x"
  alt="Hikvision PTZ Camera - Full View"
  class="w-full aspect-square object-cover"
/>
```

**Specs:**
- Format: WebP (fallback JPEG)
- Dimensions: 800x800 (1x), 1600x1600 (2x)
- Compression: 85% quality
- No lazy loading (hero image)

---

## Accessibility Checklist

**Touch Targets:**
- [ ] Minimum 44x44px (iOS standard)
- [ ] 8px minimum gap between targets

**Color Contrast:**
- [ ] Body text: 4.5:1 against background
- [ ] Large text (18px+): 3:1 against background
- [ ] UI components: 3:1 against adjacent colors

**Screen Reader:**
```html
<!-- Product Card -->
<div role="article" 
     aria-label="Hikvision PTZ Camera, 4MP with IR 30m, ₹2,800, 15% off">
  <!-- Content -->
</div>

<!-- Out of Stock -->
<div role="article" 
     aria-label="Hikvision PTZ Camera, Out of Stock, Notify me when available">
  <!-- Content -->
</div>

<!-- Cart Button -->
<button aria-label="View cart, 8 items, tap to view details">
  View Cart
</button>
```

**Keyboard Navigation:**
- `/` : Focus search bar
- `Esc` : Close screen / Go back
- `Tab` : Next element
- `Shift+Tab` : Previous element
- `Enter/Space` : Activate button

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| LCP | <2.5s | Largest Contentful Paint |
| FID | <100ms | First Input Delay |
| CLS | <0.1 | Cumulative Layout Shift |
| Bundle size (JS) | <150KB gzipped | Initial load |
| Bundle size (CSS) | <30KB gzipped | Tailwind + custom |
| Product Detail weight | <800KB | Including hero images |

---

## Testing Matrix

### Devices
- [ ] iPhone SE (375px)
- [ ] iPhone 14 (390px)
- [ ] Android mid-range (412px)
- [ ] iPad (768px, 1024px)
- [ ] Desktop (1440px)

### Browsers
- [ ] Chrome mobile + desktop
- [ ] Safari iOS + macOS
- [ ] Firefox
- [ ] Samsung Internet (Android)

### Network
- [ ] 3G throttled
- [ ] Offline mode
- [ ] Connection loss during action
- [ ] Intermittent connectivity

---

## Common Patterns (React Native / Flutter)

### Bottom Tab Navigator (React Native)

```javascript
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Tab = createBottomTabNavigator();

function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2196F3',
        tabBarInactiveTintColor: '#9E9E9E',
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="BuyAgain" component={BuyAgainScreen} />
      <Tab.Screen name="Categories" component={CategoriesScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
    </Tab.Navigator>
  );
}
```

---

### Floating Action Button (Cart - React Native)

```javascript
<TouchableOpacity
  style={{
    position: 'absolute',
    bottom: 80, // Above tab bar
    alignSelf: 'center',
    backgroundColor: '#388E3C',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.19,
    shadowRadius: 20,
    elevation: 10,
  }}
  onPress={() => navigation.navigate('Cart')}
>
  {/* Thumbnails */}
  <View style={{ flexDirection: 'row', marginLeft: -8 }}>
    <Image source={item1} style={thumbnailStyle} />
    <Image source={item2} style={thumbnailStyle} />
    <Image source={item3} style={thumbnailStyle} />
  </View>
  
  {/* Text */}
  <View>
    <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFF' }}>
      View Cart
    </Text>
    <Text style={{ fontSize: 14, color: '#FFF', opacity: 0.9 }}>
      8 items
    </Text>
  </View>
  
  {/* Arrow */}
  <Text style={{ fontSize: 20, color: '#FFF' }}>›</Text>
</TouchableOpacity>
```

---

## Common Mistakes to Avoid

❌ **Don't:**
- Use font-size below 16px for body text
- Create touch targets smaller than 44x44px
- Use bottom sheets (all full-screen transitions)
- Show total amount on floating cart (can deter purchases)
- Show stock numbers for in-stock items (unnecessary info)
- Use nested scrolls (horizontal inside vertical without proper handling)

✅ **Do:**
- Test scroll behavior on real devices
- Use optimistic UI (instant feedback)
- Cache aggressively for offline
- Show rotating search placeholders
- Use rounded corners (12px for images, 16px for cart)
- Implement proper z-index layering (cart above footer)

---

## Quick Implementation Checklist

**Week 1: Core Components**
- [ ] Product card with image overlays
- [ ] Bottom sticky cart with thumbnails
- [ ] Search bar with rotating placeholders
- [ ] Category filter chips
- [ ] Sticky header with scroll behavior

**Week 2: Navigation & Screens**
- [ ] Bottom tab navigator
- [ ] Screen transitions (horizontal/vertical)
- [ ] Home screen
- [ ] Buy Again tab
- [ ] Categories tab
- [ ] Orders tab

**Week 3: Product Detail**
- [ ] Hero image carousel
- [ ] Variant selector grid
- [ ] Sticky footer
- [ ] Recommendation sections
- [ ] Brand exploration CTA

---

## Additional Resources

**Full Documentation:** `TraderOps_Design_System_v2.md`  
**Figma Library:** [Link to Figma components]  
**Icon Set:** Use system icons (SF Symbols on iOS, Material Icons on Android)  
**Fonts:** System fonts (no custom fonts for speed)

---

**Version:** 2.0  
**Last Updated:** March 14, 2026  
**Changelog:** Complete redesign with Blinkit/Instamart patterns, Product Detail screen added, scroll behaviors defined, navigation restructured
