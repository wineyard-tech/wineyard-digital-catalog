# TraderOps Design System v3
**Version 3.0 | March 2026**  
**A Universal B2B Commerce Catalog Platform**

---

## Executive Summary

TraderOps is a platform-agnostic design system for B2B commerce catalogs, enabling distributors across any industry to digitize their buyer networks with a mobile-first, offline-capable, low-tech-friendly experience.

**Core Philosophy:** Build once for WineYard (CCTV), scale to any distributor in any industry (FMCG, pharma, industrial supplies, electronics).

**Technical Approach:** Design tokens + component patterns documented for implementation across web (React + Tailwind), iOS (Swift/SwiftUI), and Android (Kotlin/Jetpack Compose).

**Target Audience:** 90% Android, 10% iOS users across age groups and vernacular backgrounds (rural, urban, suburban) in India.

---

## Design Principles (The Foundation)

### 1. Friction is the Enemy
Every extra tap, every extra screen, every moment of confusion costs orders.

**Target:** 3 taps from catalog open → quotation sent  
**Inspiration:** Swiggy's reorder flow (40% higher repeat purchase rates for sub-5-minute orders)

**Implementation:**
- Persistent bottom cart button (always visible)
- Direct add-to-cart from product cards (no intermediate screens)
- One-tap reorder from order history

---

### 2. Offline-First is Non-Negotiable
Buyers work in warehouses, job sites, and low-connectivity zones. The catalog must work without internet.

**Target:** Full catalog browsable offline, enquiries queued when offline  
**Inspiration:** WhatsApp's offline message queue, Google Maps offline mode

**Implementation:**
- Local catalog cache (sync 4x daily or on WiFi)
- Optimistic UI (instant feedback, sync in background)
- Status banner only shown when offline (no unnecessary noise when online)
- Queue icon when offline actions pending

---

### 3. Repeat Purchase = Revenue Engine
Most B2B orders are repeat purchases. Make reordering effortless.

**Target:** 60%+ of orders from "Buy Again" flow  
**Inspiration:** Amazon's "Buy Again", Swiggy's reorder tab

**Implementation:**
- "Buy Again" as primary home screen section
- Saved order templates (e.g., "Warehouse Install Kit")
- Frequently ordered items auto-surfaced

---

### 4. Progressive Disclosure Over Information Overload
Show basics first. Reveal details only when user shows interest.

**Target:** Product card shows 4 data points max; tap for full specs  
**Inspiration:** Airtable's progressive feature reveal, Apple's product pages

**Implementation:**
- Card: Image, Name, Your Price, Stock
- Tap card: Full specs, bundles, alternatives
- No dropdowns or forms on first screen

---

### 5. Familiarity Breeds Speed
Low-tech users rely on patterns they already know from consumer apps.

**Target:** Zero learning curve for users of Swiggy/Amazon/Paytm  
**Inspiration:** Common mobile e-commerce patterns

**Implementation:**
- Bottom sticky cart (food delivery pattern)
- Product grid with images (e-commerce pattern)
- Swipe, pull-to-refresh (native mobile gestures)

---

### 6. Calm and Secure Experience
Business buyers placing orders carry professional risk. The interface must signal reliability and reduce cognitive load.

**Target:** Generous whitespace, trust signals at point of anxiety, single primary CTA per screen  
**Inspiration:** Blinkit's clean catalog, Udaan's minimal B2B interface

**Implementation:**
- 8px grid spacing system (16px card padding, 24px section margins)
- Near-white background (#F8FAFB) with clean white cards
- Soft shadows (barely perceptible depth)
- Navy blue + emerald green color palette (trust + success)

---

### 7. Trust Through Clarity
Eliminate all ambiguity. Show exact prices, exact stock, clear timelines.

**Target:** Zero hidden costs, transparent fulfillment  
**Inspiration:** Amazon Business pricing transparency

**Implementation:**
- All costs visible upfront (item total + transport charges)
- Delivery location and timeline shown before checkout
- Stock availability binary (available/notify me)

---

## Design Tokens

### Color Palette

**Primary Colors:**
```css
--color-primary: #0066CC;        /* Trust blue - navigation, links */
--color-primary-dark: #0052A3;   /* Hover/pressed states */
--color-cta: #059669;            /* Emerald green - CTAs */
--color-cta-dark: #047857;       /* CTA hover state */
```

**Backgrounds:**
```css
--color-bg: #F8FAFB;             /* Near-white page background */
--color-surface: #FFFFFF;        /* Card surfaces */
--color-surface-alt: #F1F5F9;    /* Section backgrounds */
```

**Text Hierarchy:**
```css
--color-text-primary: #0F172A;   /* Headings - 18.8:1 contrast */
--color-text-secondary: #334155; /* Body text - 10.7:1 contrast */
--color-text-tertiary: #64748B;  /* Labels - 4.6:1 contrast */
--color-text-disabled: #CBD5E1;  /* Placeholders */
```

**Semantic Colors:**
```css
--color-success: #059669;        /* Emerald green */
--color-success-bg: #ECFDF5;     /* Pale green background */
--color-warning: #D97706;        /* Amber */
--color-warning-bg: #FFFBEB;     /* Pale amber background */
--color-error: #DC2626;          /* Red */
--color-disabled: #64748B;       /* Slate gray */
```

**Borders & Dividers:**
```css
--color-border: #E2E8F0;         /* Default borders */
--color-border-subtle: #F1F5F9;  /* Subtle dividers */
```

### Typography

**Font Stack:**
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif;
```

**Size Scale:**
```css
--font-size-h1: 18-20px;         /* Page titles */
--font-size-h2: 16px;            /* Section headers */
--font-size-body: 14px;          /* Body text */
--font-size-small: 12px;         /* Secondary text */
--font-size-tiny: 10-11px;       /* Labels, captions */
```

**Weight Scale:**
```css
--font-weight-regular: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
```

**Line Heights:**
```css
--line-height-tight: 1.25;       /* Headings */
--line-height-normal: 1.5;       /* Body text */
--line-height-relaxed: 1.6;      /* Long-form content */
```

### Spacing (8px Grid System)

```css
--spacing-xs: 4px;               /* Tight spacing */
--spacing-sm: 8px;               /* Default spacing */
--spacing-md: 12px;              /* Card padding */
--spacing-lg: 16px;              /* Section padding */
--spacing-xl: 24px;              /* Section margins */
--spacing-2xl: 32px;             /* Large sections */
--spacing-3xl: 48px;             /* Major page divisions */
```

### Border Radius

```css
--radius-sm: 8px;                /* Buttons (rounded-md) */
--radius-md: 12px;               /* Cards (rounded-xl) */
--radius-lg: 16px;               /* Large cards */
--radius-full: 9999px;           /* Pills, search bars (rounded-full) */
```

### Shadows

```css
--shadow-card: 0 2px 8px rgba(0,0,0,0.08);           /* Default card */
--shadow-card-hover: 0 4px 12px rgba(0,0,0,0.12);    /* Card on hover */
--shadow-floating: 0 -4px 12px rgba(0,0,0,0.08);     /* Sticky footer */
--shadow-elevated: 0 8px 24px rgba(0,0,0,0.15);      /* Floating cart */
```

### Icons (Lucide)

**Library:** `https://unpkg.com/lucide@latest`

**Common Icons:**
```
home, refresh-cw, package, clipboard-list, search, user,
map-pin, arrow-left, chevron-right, arrow-right, share-2,
star, bell, trash-2, message-circle, wifi-off, building-2,
plus, minus, chevron-down, chevron-up
```

**Implementation:**
- React: `import { Home, Search, User } from 'lucide-react'`
- HTML: `<i data-lucide="home"></i>` + call `lucide.createIcons()`
- React Native: `react-native-lucide`
- Flutter: `lucide_icons_flutter`

---

## Core Components

### 1. Product Card (Catalog View)

**Purpose:** Display product in grid catalog with quick add-to-cart

**Dimensions:**
- Card width: 50% viewport (2-column grid)
- Image height: 120px (40% reduction from earlier versions)
- Padding: 12px
- Gap between cards: 12px

**Structure:**
```
┌─────────────────────────┐
│   [15% OFF]            │ ← Top badge (rounded-b-md)
│                         │
│      🎥 Image          │
│    (120px height)      │
│                    [+] │ ← Add button (bottom-2 right-2)
└─────────────────────────┘
  Product Name (14px)
  Variant detail (12px)
  ₹2,800  ₹3,200
```

**States:**
1. **Default:** Outline add button (+), transparent bg, emerald border
2. **Selected:** Filled green button with - [qty] +
3. **Out of Stock:** Gray badge, grayed image, "Notify" button

**Badge (Top-Aligned):**
- Position: `top-0`, centered horizontally
- Shape: `rounded-b-md` (bottom corners only)
- Discount: Green bg (#059669), white text, "15% OFF"
- Out of Stock: Gray bg (#64748B), white text, "Out of Stock"

**Add Button:**
- Empty: 32×32px `rounded-md`, 2px border #059669, transparent bg, + icon
- Selected: Same size, filled #059669, white text, - [qty] +
- Position: `bottom-2 right-2` (moved into thumbnail to avoid text overlap)

**Code Sample (React + Tailwind):**
```jsx
<div className="relative bg-white rounded-xl card-shadow">
  {/* Top badge */}
  {discount > 0 && (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 rounded-b-md px-2 py-1 bg-emerald-600">
      <span className="text-xs font-bold text-white">{discount}% OFF</span>
    </div>
  )}
  
  {/* Image */}
  <div className="w-full h-[120px] bg-gray-50 rounded-t-xl flex items-center justify-center text-4xl relative">
    {image}
    
    {/* Add button */}
    <div className="absolute bottom-2 right-2">
      {quantity === 0 ? (
        <button className="w-8 h-8 rounded-md border-2 border-emerald-600 bg-transparent text-emerald-600 font-bold text-lg">
          +
        </button>
      ) : (
        <div className="flex items-center gap-1.5 px-2 h-8 rounded-md bg-emerald-600 text-white text-xs font-medium">
          <button>−</button>
          <span>{quantity}</span>
          <button>+</button>
        </div>
      )}
    </div>
  </div>
  
  {/* Product info */}
  <div className="p-3 pt-2">
    <h3 className="text-sm font-medium truncate text-gray-900">{name}</h3>
    <p className="text-xs truncate text-gray-600">{detail}</p>
    <div className="flex items-center gap-2 mt-1">
      <span className="text-sm font-bold text-gray-900">₹{price}</span>
      {mrp > price && <span className="text-xs line-through text-gray-400">₹{mrp}</span>}
    </div>
  </div>
</div>
```

---

### 2. Floating Cart Button

**Purpose:** Persistent access to cart from any screen

**Position:** Fixed bottom center, above bottom tabs (z-index: 50)

**Dimensions:**
- Min width: 200px
- Height: Auto (padding 12px vertical)
- Border radius: 12px (rounded-xl)

**Structure:**
```
┌────────────────────────────┐
│ 🎥📹🔗  View Cart      →  │ ← Thumbnails -space-x-3 (overlap 12px)
│         3 items           │   Single line guaranteed
└────────────────────────────┘
```

**Thumbnails:**
- Size: 36×36px each
- Overlap: -12px (`-space-x-3` in Tailwind)
- Max shown: 3 items
- Border: 2px white border around each

**Code Sample:**
```jsx
<button className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl min-w-[200px]">
  {/* Thumbnails */}
  <div className="flex -space-x-3">
    {cartItems.slice(0, 3).map((item, idx) => (
      <div key={idx} className="w-9 h-9 bg-white border-2 border-white rounded-lg flex items-center justify-center text-lg">
        {item.image}
      </div>
    ))}
  </div>
  
  {/* Label */}
  <div className="flex-1 text-left">
    <div className="text-sm font-semibold whitespace-nowrap">View Cart</div>
    <div className="text-xs opacity-90">{cartItemCount} items</div>
  </div>
  
  {/* Arrow */}
  <ChevronRight className="w-4 h-4" />
</button>
```

---

### 3. Cart Item Card

**Purpose:** Display cart item with quantity control and delete option

**Layout Changes (v3):**
- Delete icon: Next to product image, below name/variant
- Quantity: Top-right, aligned with product name row
- Subtotal: Bottom-right, closer to quantity (no "Subtotal:" label)

**Structure:**
```
┌─────────────────────────────────────┐
│ 🎥  Product Name         [- 2 +]   │ ← Quantity top-right
│     2MP • 20m IR                    │
│ 🗑️                       ₹5,600    │ ← Trash left, subtotal right
└─────────────────────────────────────┘
```

**Code Sample:**
```jsx
<div className="bg-white rounded-xl p-3 flex gap-3 card-shadow">
  {/* Image */}
  <div className="flex-none w-16 h-16 rounded-lg bg-gray-50 flex items-center justify-center text-2xl">
    {image}
  </div>
  
  {/* Info column */}
  <div className="flex-1 min-w-0 flex flex-col">
    {/* Top row: Name + Quantity + Trash */}
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium truncate text-gray-900">{name}</h3>
        <p className="text-xs truncate text-gray-600">{detail}</p>
      </div>
      
      {/* Quantity - top-right */}
      <div className="flex items-center gap-2 px-2 h-7 bg-emerald-600 text-white rounded-md">
        <button>−</button>
        <span className="text-sm font-medium">{quantity}</span>
        <button>+</button>
      </div>
      
      {/* Trash - top-right corner */}
      <button>
        <Trash2 className="w-4 h-4 text-red-600" />
      </button>
    </div>
    
    {/* Bottom row: Delete left, Subtotal right */}
    <div className="mt-2 flex items-center justify-between">
      <div></div> {/* Spacer */}
      <span className="text-sm font-semibold text-gray-900">₹{price * quantity}</span>
    </div>
  </div>
</div>
```

---

### 4. Cart Screen Layout (v3 - Scrollable Bill Details)

**Structure:**
```
┌─────────────────────────────────────┐
│ ← Cart                              │ ← Fixed header
├─────────────────────────────────────┤
│ [Offline banner if offline]         │ ← Conditional
├─────────────────────────────────────┤
│                                      │
│ [Cart items...]                     │
│ [Cart items...]                     │ ← Scrollable area
│ [Cart items...]                     │
│                                      │
│ ┌─────────────────────────┐        │
│ │ Bill Details            │        │ ← Scrollable (not fixed)
│ │ Items (49): ₹56,680     │        │
│ │ Transport: ₹150         │        │
│ │ ───────────────────     │        │
│ │ To Pay: ₹56,830         │        │
│ └─────────────────────────┘        │
│                                      │
│ ┌─────────────────────────┐        │
│ │ 📍 Delivery to...       │        │ ← Scrollable (not fixed)
│ │ From WineYard Outlet    │        │
│ └─────────────────────────┘        │
│                                      │
├─────────────────────────────────────┤
│ 49 items • ₹56,830                  │ ← Fixed footer ribbon
│ [💬 WhatsApp] [Place Order →]      │ ← Fixed footer CTAs
└─────────────────────────────────────┘
```

**Cart Footer (Fixed, v3):**
1. **Info Ribbon:** Simple text, no labels
   - "49 items • ₹56,830"
   - Font: 12px, medium weight
   - Color: #64748B (tertiary text)

2. **Dual CTAs:**
   - **WhatsApp Quote (Secondary):** Outline button
     - Border: 2px solid #059669
     - Background: white
     - Text: #059669
     - Icon: message-circle
   - **Place Order (Primary):** Filled button
     - Background: #059669
     - Text: white
     - Icon: arrow-right

3. **Footer note (optional):** "Share quote or place order directly"

**Code Sample:**
```jsx
{/* Scrollable content */}
<div className="px-4 py-4 space-y-3 pb-48">
  {/* Cart items */}
  {cartItems.map(item => <CartItemCard key={item.id} {...item} />)}
  
  {/* Bill Details - Scrollable */}
  <div className="p-3 rounded-lg bg-gray-50">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-semibold text-gray-900">Bill Details</span>
    </div>
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">Item total ({totalItems} items)</span>
        <span className="text-xs font-medium text-gray-900">₹{subtotal}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">Transport charges</span>
        <span className="text-xs font-medium text-gray-900">₹{transport}</span>
      </div>
      <div className="pt-1.5 mt-1.5 flex items-center justify-between border-t border-gray-200">
        <span className="text-sm font-semibold text-gray-900">To Pay</span>
        <span className="text-lg font-bold text-gray-900">₹{total}</span>
      </div>
    </div>
  </div>
  
  {/* Delivery Location - Scrollable */}
  <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50">
    <MapPin className="w-4 h-4 mt-0.5 text-blue-600" />
    <div>
      <div className="text-xs font-semibold text-gray-900">Delivery to Himayatnagar Warehouse</div>
      <div className="text-xs text-gray-600">From WineYard Outlet, Banjara Hills • Est. 45 mins</div>
    </div>
  </div>
</div>

{/* Fixed footer */}
<div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t border-gray-200 shadow-floating">
  {/* Info ribbon */}
  <div className="text-center text-xs text-gray-600 mb-2">
    {totalItems} items • ₹{total}
  </div>
  
  {/* CTAs */}
  <div className="flex gap-2">
    <button className="flex-1 h-11 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 bg-white text-emerald-600 border-2 border-emerald-600">
      <MessageCircle className="w-4 h-4" />
      WhatsApp Quote
    </button>
    <button className="flex-1 h-11 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 bg-emerald-600 text-white">
      Place Order
      <ArrowRight className="w-4 h-4" />
    </button>
  </div>
</div>
```

---

### 5. Bottom Navigation Tabs

**Purpose:** Primary navigation between main sections

**Critical Fix (v3):**
- **Z-index:** Set to `z-40` (higher than product cards at `z-10`)
- **Position:** `fixed bottom-0` with proper viewport padding
- **Height:** 56px (14 in Tailwind = 56px, ensuring full visibility)

**Structure:**
```
┌─────┬─────┬─────┬─────┐
│ 🏠  │ 🔄  │ 📦  │ 📋  │
│Home │Buy  │Cat. │Ord. │
└─────┴─────┴─────┴─────┘
```

**States:**
- Active: Blue icon + text (#0066CC)
- Inactive: Gray icon + text (#64748B)
- Icons: Lucide 20px (w-5 h-5)
- Text: 10px, medium weight

**Code Sample:**
```jsx
<nav className="fixed bottom-0 left-0 right-0 h-14 bg-white flex border-t border-gray-200 z-40">
  <button className="flex-1 flex flex-col items-center justify-center gap-1 text-blue-600">
    <Home className="w-5 h-5" />
    <span className="text-xs font-medium">Home</span>
  </button>
  <button className="flex-1 flex flex-col items-center justify-center gap-1 text-gray-600">
    <RefreshCw className="w-5 h-5" />
    <span className="text-xs">Buy Again</span>
  </button>
  <button className="flex-1 flex flex-col items-center justify-center gap-1 text-gray-600">
    <Package className="w-5 h-5" />
    <span className="text-xs">Categories</span>
  </button>
  <button className="flex-1 flex flex-col items-center justify-center gap-1 text-gray-600">
    <ClipboardList className="w-5 h-5" />
    <span className="text-xs">Orders</span>
  </button>
</nav>
```

---

### 6. Header (Catalog Screen)

**Purpose:** Location display, search bar, account access

**Critical Fixes (v3):**
1. **Single user icon:** Remove duplicate icon next to search bar
2. **Reduced spacing:** Location → search bar spacing reduced from 14px to 8px
3. **Scroll behavior:** Smooth transition, no flickering on scroll-to-top

**Full State Structure:**
```
┌─────────────────────────────────────┐
│ 📍 Himayatnagar Warehouse ▼     👤 │ ← 56px height
├─────────────────────────────────────┤
│ 🔍 Search for 'HDMI cable'      👤 │ ← 48px height
└─────────────────────────────────────┘
Total: 104px (header-full)
```

**Collapsed State:**
```
┌─────────────────────────────────────┐
│ 🔍 Search for 'HDMI cable'      👤 │ ← 64px height
└─────────────────────────────────────┘
```

**Scroll Behavior (Fixed v3):**
```javascript
const handleScroll = () => {
  const currentScrollY = window.scrollY;
  const scrollingDown = currentScrollY > lastScrollY.current;
  const atTop = currentScrollY < 50;
  
  if (atTop) {
    setHeaderState('full');
    setTabsVisible(true);
  } else if (scrollingDown) {
    setHeaderState('collapsed');
    setTabsVisible(false);
  } else {
    setHeaderState('collapsed');
    setTabsVisible(true);
  }
  
  lastScrollY.current = currentScrollY;
};
```

**Code Sample:**
```jsx
<header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm transition-all duration-300" style={{ height: headerState === 'full' ? '120px' : '64px' }}>
  {/* Row 1: Location + Avatar (only when full) */}
  {headerState === 'full' && (
    <div className="flex items-center justify-between px-4 h-14">
      <button className="flex items-center gap-2 text-sm font-medium text-gray-900">
        <MapPin className="w-4 h-4" />
        <span>Himayatnagar Warehouse</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      <button className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
        <User className="w-5 h-5 text-gray-600" />
      </button>
    </div>
  )}
  
  {/* Row 2: Search Bar (SINGLE USER ICON) */}
  <div className="px-4 py-2 flex items-center gap-2">
    <div className="flex-1 relative">
      <input 
        type="text" 
        className="w-full h-11 pl-11 pr-4 rounded-full bg-gray-100 text-sm focus:ring-2 outline-none"
        placeholder="Search for 'HDMI cable'"
      />
      <Search className="absolute left-4 top-3 w-5 h-5 text-gray-600" />
    </div>
    {/* ONLY ONE USER ICON - only show when collapsed */}
    {headerState === 'collapsed' && (
      <button className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
        <User className="w-5 h-5 text-gray-600" />
      </button>
    )}
  </div>
</header>
```

---

### 7. Product Detail Screen Footer

**Critical Fix (v3):** Ensure footer is fully visible, not cut off at bottom

**Bottom Padding:**
```css
/* Add padding to body/container */
padding-bottom: 192px; /* 12rem in Tailwind = pb-48 */

/* Footer height calculation */
/* Variant grid: 64px */
/* Price + Add row: 40px */
/* Padding: 16px * 4 = 64px */
/* Total: 168px + safe area = 192px */
```

**Code Sample:**
```jsx
{/* Container with proper bottom padding */}
<div className="pb-48">
  {/* Content */}
  
  {/* Fixed footer - ensure full visibility */}
  <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t border-gray-200 shadow-floating z-40">
    {/* Variant grid */}
    <div className="grid grid-cols-3 gap-2 mb-3">
      {/* Variants */}
    </div>
    
    {/* Price + Add */}
    <div className="flex items-center justify-between">
      {/* Content */}
    </div>
  </div>
</div>
```

---

## Screen Flow & Navigation

### Primary Navigation (Bottom Tabs)
1. **Home** → Catalog + Buy Again section
2. **Buy Again** → Full history of past orders
3. **Categories** → Browse by category hierarchy
4. **Orders** → Order status and history

### Screen Transitions
- **Horizontal slide (left/right):** Product Detail, Categories, Orders
- **Vertical slide (up):** Cart screen only
- **Duration:** 300ms
- **Easing:** cubic-bezier(0.4, 0.0, 0.2, 1)

---

## Accessibility Standards

### WCAG 2.1 AA Compliance
- Text contrast: Minimum 4.5:1 (AA), target 7:1 (AAA)
- Touch targets: Minimum 44×44px
- Focus indicators: 2px outline, high contrast
- Screen reader support: ARIA labels on all interactive elements

### Low-Tech User Optimizations
- Font size: 14px body minimum (18px recommended for Android)
- Icon + text labels (never icon-only navigation)
- High contrast mode support
- Offline functionality clearly indicated

---

## Platform-Specific Guidelines

### Android (90% of users)
- Material Design 3 principles
- 8dp grid system (1dp = 1px at mdpi)
- Touch targets: 48dp minimum
- System fonts: Roboto, Noto Sans (Indic scripts)

### iOS (10% of users)
- Human Interface Guidelines
- 8pt grid system
- Touch targets: 44pt minimum
- System fonts: SF Pro

### React Native Implementation
```javascript
// Color tokens
const colors = {
  primary: '#0066CC',
  cta: '#059669',
  bg: '#F8FAFB',
  surface: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  border: '#E2E8F0'
};

// Shadow styles
const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4
  }
};
```

---

## Success Metrics

### User Experience
- **Time to first quotation:** <60 seconds
- **Repeat purchase rate:** 60%+ from Buy Again
- **Cart abandonment:** <30%
- **Offline usage:** 40%+ of sessions

### Technical Performance
- **First Contentful Paint:** <1.5s
- **Largest Contentful Paint:** <2.5s
- **First Input Delay:** <100ms
- **Cumulative Layout Shift:** <0.1

---

## Version History

**v3.0 (March 2026):**
- Lucide icon system implementation
- Cart layout redesign (scrollable bill details, fixed clean footer)
- Header fixes (single user icon, reduced spacing, scroll behavior)
- Bottom tabs z-index fix
- Product Detail footer viewport fix
- Final production-ready version

**v2.0 (March 2026):**
- Color palette refinement (navy + emerald green)
- Font size reduction, whitespace improvements
- Product thumbnail 40% size reduction
- Removed category tabs from Home
- Added offline-only status banners

**v1.0 (March 2026):**
- Initial design system
- Core components and patterns
- Blinkit-inspired catalog patterns

---

## Implementation Checklist

### Phase 1: Core Catalog (Weeks 1-3)
- [ ] Home screen with catalog grid
- [ ] Product Detail screen
- [ ] Cart screen with bill details
- [ ] Buy Again section
- [ ] Categories screen
- [ ] Orders screen
- [ ] Offline mode support

### Phase 2: Configurability (Weeks 4-8)
- [ ] Multi-outlet inventory module
- [ ] Promotions module
- [ ] Loyalty tiers module
- [ ] Credit/payment terms module
- [ ] Batch/expiry tracking module

### Phase 3: Industry Expansion (Weeks 9-16)
- [ ] FMCG distributor onboarding
- [ ] Pharma distributor adaptation
- [ ] Industrial supplies customization

---

**Document Status:** Final v3.0  
**Last Updated:** March 15, 2026  
**Next Review:** Post-pilot with 10 WineYard integrators
