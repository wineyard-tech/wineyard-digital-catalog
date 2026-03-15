# TraderOps Design System
**Version 1.0 | March 2026**  
**A Universal B2B Commerce Catalog Platform**

---

## Executive Summary

TraderOps is a platform-agnostic design system for B2B commerce catalogs, enabling distributors across any industry to digitize their buyer networks with a mobile-first, offline-capable, low-tech-friendly experience.

**Core Philosophy:** Build once for WineYard (CCTV), scale to any distributor in any industry (FMCG, pharma, industrial supplies, electronics).

**Technical Approach:** Design tokens + component patterns documented for implementation across web (React + Tailwind), iOS (Swift/SwiftUI), and Android (Kotlin/Jetpack Compose).

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
- Last-sync timestamp shown prominently
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

### 6. Personalization Without Asking
Use order history to personalize without requiring user input.

**Target:** Home screen unique per buyer based on behavior  
**Inspiration:** Netflix's personalized rows, Amazon's recommendations

**Implementation:**
- Surface frequently ordered categories at top
- "Others bought with this" bundles
- Hide categories never purchased

---

### 7. Trust Through Clarity
Eliminate all ambiguity. Show exact prices, exact stock, clear timelines.

**Target:** Zero post-order disputes about pricing/availability  
**Inspiration:** Udaan's transparency (30-50% cost savings for kirana owners)

**Implementation:**
- Your exact negotiated price shown upfront (not MRP)
- Stock status per outlet with numbers (not "Available")
- Clear delivery estimates

---

## Design Tokens

### Color System

#### Primary Palette
```
--color-primary-50: #E3F2FD
--color-primary-100: #BBDEFB
--color-primary-200: #90CAF9
--color-primary-300: #64B5F6
--color-primary-400: #42A5F5
--color-primary-500: #2196F3  /* Primary brand */
--color-primary-600: #1E88E5
--color-primary-700: #1976D2
--color-primary-800: #1565C0
--color-primary-900: #0D47A1
```

**Usage:** CTAs, active states, links, focus indicators

#### Neutral Palette (Dark-on-Light Default)
```
--color-neutral-0: #FFFFFF    /* Backgrounds */
--color-neutral-50: #FAFAFA   /* Card backgrounds */
--color-neutral-100: #F5F5F5  /* Disabled backgrounds */
--color-neutral-200: #EEEEEE  /* Borders, dividers */
--color-neutral-300: #E0E0E0  /* Inactive elements */
--color-neutral-400: #BDBDBD  /* Placeholder text */
--color-neutral-500: #9E9E9E  /* Secondary text */
--color-neutral-600: #757575  /* Body text */
--color-neutral-700: #616161  /* Headings */
--color-neutral-800: #424242  /* Strong emphasis */
--color-neutral-900: #212121  /* Maximum contrast */
```

#### Semantic Colors
```
/* Success (stock available, order confirmed) */
--color-success-50: #E8F5E9
--color-success-500: #4CAF50
--color-success-700: #388E3C

/* Warning (limited stock, attention needed) */
--color-warning-50: #FFF3E0
--color-warning-500: #FF9800
--color-warning-700: #F57C00

/* Error (out of stock, validation error) */
--color-error-50: #FFEBEE
--color-error-500: #F44336
--color-error-700: #D32F2F

/* Info (promotions, deals, new arrivals) */
--color-info-50: #E1F5FE
--color-info-500: #03A9F4
--color-info-700: #0288D1
```

#### Industry-Specific Accent (Configurable per Distributor)
```
--color-accent-500: #FF5722  /* Example: WineYard's orange */
```

**Usage:** Promotional badges, featured products, special pricing

---

### Typography

**Font Stack (System Fonts for Speed):**
```css
font-family: -apple-system, BlinkMacSystemFont, 
             "Segoe UI", Roboto, "Helvetica Neue", 
             Arial, sans-serif;
```

**Why:** Zero download time, native feel, excellent readability on low-DPI screens

#### Type Scale
```
--font-size-xs: 12px    /* 0.75rem - Labels, captions */
--font-size-sm: 14px    /* 0.875rem - Secondary text, metadata */
--font-size-base: 16px  /* 1rem - Body text (NEVER go below this for readability) */
--font-size-lg: 18px    /* 1.125rem - Subheadings, emphasized text */
--font-size-xl: 20px    /* 1.25rem - Card titles, section headers */
--font-size-2xl: 24px   /* 1.5rem - Page titles */
--font-size-3xl: 30px   /* 1.875rem - Hero text (rare) */
```

#### Font Weights
```
--font-weight-regular: 400   /* Body text */
--font-weight-medium: 500    /* Emphasized text */
--font-weight-semibold: 600  /* Subheadings */
--font-weight-bold: 700      /* Headings, CTAs */
```

#### Line Heights
```
--line-height-tight: 1.25    /* Headings */
--line-height-normal: 1.5    /* Body text */
--line-height-relaxed: 1.75  /* Long-form content */
```

---

### Spacing System (8px Base Grid)

```
--spacing-0: 0
--spacing-1: 4px      /* Tight spacing (icon-to-text) */
--spacing-2: 8px      /* Default spacing (card padding start) */
--spacing-3: 12px     /* Comfortable spacing */
--spacing-4: 16px     /* Standard padding/margin */
--spacing-5: 20px     /* Section spacing */
--spacing-6: 24px     /* Large spacing */
--spacing-8: 32px     /* Extra large spacing */
--spacing-10: 40px    /* Section dividers */
--spacing-12: 48px    /* Page-level spacing */
--spacing-16: 64px    /* Hero sections */
```

**Rule:** All spacing must be a multiple of 4px for visual consistency.

---

### Elevation (Shadow System)

```css
/* Flat (default cards) */
--elevation-0: none;

/* Subtle lift (hoverable cards) */
--elevation-1: 0 1px 3px rgba(0,0,0,0.12), 
               0 1px 2px rgba(0,0,0,0.24);

/* Floating elements (dropdowns, tooltips) */
--elevation-2: 0 3px 6px rgba(0,0,0,0.16), 
               0 3px 6px rgba(0,0,0,0.23);

/* Modals, bottom sheets */
--elevation-3: 0 10px 20px rgba(0,0,0,0.19), 
               0 6px 6px rgba(0,0,0,0.23);

/* Full-screen overlays */
--elevation-4: 0 14px 28px rgba(0,0,0,0.25), 
               0 10px 10px rgba(0,0,0,0.22);
```

**Usage:**
- Cards at rest: elevation-0 or elevation-1
- Interactive cards on hover/press: elevation-2
- Floating cart button: elevation-3
- Modal overlays: elevation-4

---

### Border Radius

```
--radius-sm: 4px      /* Small elements (badges, chips) */
--radius-base: 8px    /* Default (cards, buttons) */
--radius-lg: 12px     /* Large cards */
--radius-xl: 16px     /* Modal corners */
--radius-full: 9999px /* Pills, avatars */
```

---

### Animation & Timing

```
--duration-instant: 100ms   /* Toggle switches, checkboxes */
--duration-fast: 200ms      /* Hover states, button press */
--duration-base: 300ms      /* Default transitions */
--duration-slow: 500ms      /* Page transitions, modals */

--easing-standard: cubic-bezier(0.4, 0.0, 0.2, 1)  /* Deceleration */
--easing-emphasized: cubic-bezier(0.0, 0.0, 0.2, 1)  /* Sharp deceleration */
--easing-linear: linear  /* Loading spinners only */
```

**Rule:** Prefer shorter durations (<300ms) for mobile to maintain perceived speed.

---

## Component Specifications

### Product Card (Primary Component)

**Purpose:** Display product in browsable grid/list with instant add-to-cart

**Anatomy:**
```
┌─────────────────────────┐
│ [Product Image]         │ ← 1:1 ratio, lazy-loaded
│                         │
├─────────────────────────┤
│ Product Name (2 lines)  │ ← Truncate with ellipsis
│ ₹2,800 • In Stock      │ ← Price + stock inline
│ ★★★★☆ Popular          │ ← Social proof (optional)
│                         │
│ [+ Add]  [Quick View]  │ ← CTAs (Quick View optional)
└─────────────────────────┘
```

**Specifications:**

| Element | Token | Value | Notes |
|---------|-------|-------|-------|
| Container width | Variable | 48% viewport (2 cols on mobile) | 3 cols on tablet+ |
| Container padding | --spacing-3 | 12px | Internal padding |
| Border radius | --radius-base | 8px | |
| Background | --color-neutral-0 | #FFFFFF | |
| Border | --color-neutral-200 | 1px solid | Subtle outline |
| Image aspect ratio | 1:1 | Square | Consistent grid |
| Image background | --color-neutral-100 | #F5F5F5 | While loading |
| Product name font | --font-size-base | 16px | Never smaller |
| Product name weight | --font-weight-medium | 500 | Readable |
| Product name lines | 2 max | Truncate | Prevent layout shift |
| Price font | --font-size-lg | 18px | Emphasize |
| Price weight | --font-weight-bold | 700 | High contrast |
| Price color | --color-primary-700 | #1976D2 | Brand color |
| Stock indicator | --font-size-sm | 14px | Secondary info |
| Stock color (available) | --color-success-700 | #388E3C | Green |
| Stock color (limited) | --color-warning-700 | #F57C00 | Amber |
| Stock color (out) | --color-error-700 | #D32F2F | Red |
| Add button height | 40px | Touch-friendly | Min 44px tap target |
| Add button radius | --radius-base | 8px | |

**States:**

1. **Default:**
   - elevation-0
   - Border: 1px solid neutral-200

2. **Hover (web only):**
   - elevation-2
   - Border color → primary-300

3. **Pressed (mobile):**
   - Scale: 0.98
   - elevation-0
   - Background → neutral-50

4. **Out of Stock:**
   - Opacity: 0.6
   - Grayscale filter on image
   - Add button → disabled state

**Responsive Behavior:**

- Mobile (<640px): 2 columns, 16px gap
- Tablet (640-1024px): 3 columns, 20px gap
- Desktop (>1024px): 4 columns, 24px gap

**Accessibility:**

- Image alt text: "{Product name} - {Price} - {Stock status}"
- Add button aria-label: "Add {product name} to cart"
- Focus indicator: 2px solid primary-500 outline

---

### Bottom Sticky Cart

**Purpose:** Always-visible cart status + quick access to quotation

**Anatomy:**
```
┌─────────────────────────────────────┐
│ Cart: 8 items • ₹45,230    [View] │ ← Sticky bottom
└─────────────────────────────────────┘
```

**Specifications:**

| Element | Value | Notes |
|---------|-------|-------|
| Position | Fixed bottom | Always visible |
| Height | 56px | Standard mobile bottom bar |
| Background | --color-primary-500 | High contrast |
| Text color | #FFFFFF | White on blue |
| Padding | 16px horizontal | Touch-friendly |
| Shadow | elevation-3 | Floats above content |
| Font size | --font-size-base | 16px |
| Font weight | --font-weight-semibold | 600 |
| Border radius (top) | 12px | Rounded top corners |

**States:**

1. **Empty Cart:**
   - Hidden (collapsed to nothing)

2. **Items in Cart:**
   - Slides up from bottom (300ms)
   - Shows item count + total

3. **Offline with Queued Items:**
   - Background → warning-500 (amber)
   - Text: "3 items queued • Will sync when online"

**Tap Behavior:**
- Tap anywhere → expand to full cart view (bottom sheet)

---

### Buy Again Section (Home Screen)

**Purpose:** Surface frequently ordered products for instant reorder

**Anatomy:**
```
┌─────────────────────────────────────┐
│ 🔄 Buy Again                         │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ →      │
│ │PTZ │ │NVR │ │CBL │ │... │        │ ← Horizontal scroll
│ └────┘ └────┘ └────┘ └────┘        │
└─────────────────────────────────────┘
```

**Card Specifications:**

| Element | Value | Notes |
|---------|-------|-------|
| Card width | 120px | Fixed for horizontal scroll |
| Card height | 160px | Image + name + price |
| Gap between cards | 12px | Comfortable spacing |
| Image ratio | 1:1 | Square thumbnails |
| Name font | --font-size-sm | 14px, 2 lines max |
| Price font | --font-size-base | 16px, bold |
| Add button | Icon only (+) | 32px diameter circle |

**Data Source:** 
- Last 30 days order history
- Top 10 most frequently ordered items
- Ordered by purchase frequency (descending)

---

### Search Bar

**Purpose:** Quick product discovery by name, SKU, or brand

**Anatomy:**
```
┌─────────────────────────────────────┐
│ 🔍 Search products, brands, SKU...  │
└─────────────────────────────────────┘
```

**Specifications:**

| Element | Value | Notes |
|---------|-------|-------|
| Height | 48px | Touch-friendly |
| Border radius | --radius-full | Pill shape |
| Background | --color-neutral-100 | Subtle contrast |
| Placeholder color | --color-neutral-500 | Gray |
| Border (focus) | 2px solid primary-500 | Clear focus state |
| Icon size | 20px | Magnifying glass |
| Icon color | --color-neutral-600 | Matches text |

**Behavior:**

1. **Tap to activate:**
   - Keyboard appears
   - Cancel button slides in from right

2. **Type to search:**
   - Instant filter (no "Search" button)
   - Results update as user types
   - Minimum 2 characters to trigger

3. **Search scope:**
   - Product name (primary)
   - SKU / Model number (exact match)
   - Brand name
   - Category tags

4. **Empty state:**
   - "No products found for '{query}'"
   - Suggest: "Try searching by brand or category"

---

### Stock Indicator

**Purpose:** Show availability status with urgency cues

**Variants:**

1. **In Stock (High Qty):**
   ```
   ✓ In Stock • 47 units
   Color: success-700 (#388E3C)
   ```

2. **Limited Stock (Low Qty):**
   ```
   ⚠ Limited • 4 units left
   Color: warning-700 (#F57C00)
   Background: warning-50 (subtle amber tint)
   ```

3. **Out of Stock:**
   ```
   ✗ Out of Stock
   Color: error-700 (#D32F2F)
   Show: "Notify Me" button
   ```

4. **Multi-Outlet Stock:**
   ```
   ✓ Available at 2 outlets
   Tap to expand:
     Himayatnagar: 30 units
     Gachibowli: 13 units
   ```

**Threshold Logic:**

- High stock: >10 units
- Limited stock: 1-10 units
- Out of stock: 0 units

**Configurable per Distributor:**
- Some industries need higher thresholds (FMCG: 100+ is "high")
- Some track by weight/volume not units

---

### Category Filter Chips

**Purpose:** Quick category switching without dropdown menus

**Anatomy:**
```
┌──────┬──────┬──────┬──────┬──────┐
│ All  │ 2MP  │ 4MP  │ 8MP  │ PTZ  │ → Horizontal scroll
└──────┴──────┴──────┴──────┴──────┘
```

**Specifications:**

| Element | Value | Notes |
|---------|-------|-------|
| Chip height | 36px | Compact |
| Chip padding | 16px horizontal | Touch-friendly |
| Chip radius | --radius-full | Pill shape |
| Gap | 8px | Tight spacing |
| Font size | --font-size-sm | 14px |
| Font weight | --font-weight-medium | 500 |

**States:**

1. **Inactive:**
   - Background: neutral-100
   - Text: neutral-700
   - Border: 1px solid neutral-300

2. **Active:**
   - Background: primary-500
   - Text: #FFFFFF
   - Border: none
   - Font weight: semibold (600)

3. **Pressed:**
   - Scale: 0.95
   - Duration: 100ms

---

### Offline Indicator Banner

**Purpose:** Show sync status and connectivity state

**Anatomy (Offline):**
```
┌─────────────────────────────────────┐
│ ⚠️ Offline • Last synced 10:30 AM   │
└─────────────────────────────────────┘
```

**Anatomy (Syncing):**
```
┌─────────────────────────────────────┐
│ 🔄 Syncing catalog...               │
└─────────────────────────────────────┘
```

**Anatomy (Synced):**
```
┌─────────────────────────────────────┐
│ ✓ Updated 2 min ago                 │
└─────────────────────────────────────┘
```

**Specifications:**

| State | Background | Text Color | Icon |
|-------|-----------|-----------|------|
| Offline | warning-50 | warning-900 | ⚠️ |
| Syncing | info-50 | info-900 | 🔄 (animated) |
| Synced | success-50 | success-900 | ✓ |

**Behavior:**

- Appears at top of screen (pushes content down)
- Auto-dismisses after 3s (success state only)
- Stays visible (offline/syncing states)
- Tap to force sync (if online)

---

## Buyer View vs Seller View (Dual Personas)

### Buyer View (Integrators/Retailers)

**Focus:** Speed, simplicity, reordering

**Home Screen Sections (Priority Order):**

1. **Buy Again** (horizontal scroll)
2. **Your Usual Orders** (saved templates)
3. **Deals for You** (personalized promotions)
4. **New Arrivals** (discovery)
5. **Browse by Category** (fallback)

**Primary Actions:**
- Add to cart
- Get quotation
- Reorder past order

**Navigation (Bottom Tabs):**
```
┌───────┬───────┬───────┬───────┬───────┐
│ Home  │ Search│ Cart  │Orders │Account│
└───────┴───────┴───────┴───────┴───────┘
```

**Hidden Features:**
- No pricing management
- No inventory editing
- No analytics/reporting

---

### Seller View (Distributor Admin)

**Focus:** Control, oversight, analytics

**Home Screen Sections:**

1. **Today's Orders** (pending fulfillment)
2. **Low Stock Alerts** (actionable warnings)
3. **Top Sellers This Week** (performance)
4. **Recent Enquiries** (conversion tracking)

**Primary Actions:**
- Approve/reject credit orders
- Update stock levels
- Create promotions
- View buyer activity

**Navigation (Bottom Tabs):**
```
┌───────┬───────┬───────┬───────┬───────┐
│Catalog│Orders │Buyers │Promos │Reports│
└───────┴───────┴───────┴───────┴───────┘
```

**Exclusive Features:**
- Catalog management (add/edit/EOL products)
- Buyer account management (credit limits, tiers)
- Promotion creation (flash sales, bundles)
- Analytics dashboard (sales, conversion, churn)

---

## Configurable Modules

### Module 1: Credit/Payment Terms

**Buyer View:**
- Outstanding balance shown on Account tab
- Credit limit displayed
- Pay Now button (Cashfree integration)
- Payment history

**Seller View:**
- Set credit limit per buyer
- View all outstanding balances
- Send payment reminders
- Approve credit orders >limit

**Components Needed:**
- Credit balance card
- Payment history list
- Credit limit adjuster (seller only)

---

### Module 2: Promotions/Deals

**Buyer View:**
- "Deals for You" section on home
- Badge on discounted products ("20% OFF")
- Countdown timer on flash sales
- Bundle offers ("Buy 3, Get 1 Free")

**Seller View:**
- Create promotion wizard
- Set rules (product, category, buyer tier, date range)
- Preview how buyers see it
- Performance metrics (views, conversions)

**Components Needed:**
- Promotion badge
- Countdown timer
- Bundle selector
- Promotion creation form

---

### Module 3: Multi-Outlet Inventory

**Buyer View:**
- Stock shown per outlet
- "View at all outlets" expander
- Select outlet for fulfillment
- Delivery time estimate per outlet

**Seller View:**
- Stock levels across all outlets (single view)
- Inter-outlet transfer requests
- Low stock alerts per outlet
- Outlet performance comparison

**Components Needed:**
- Multi-location stock display
- Outlet selector
- Transfer request form

---

### Module 4: Batch/Expiry Tracking (Pharma, FMCG)

**Buyer View:**
- Batch number shown (if relevant)
- Expiry date displayed
- Filter: "Expiring within 30 days" (discounted)

**Seller View:**
- Batch-level stock tracking
- Expiry alerts (30/60/90 days)
- FIFO enforcement (oldest batch first)
- Batch disposal tracking

**Components Needed:**
- Batch info card
- Expiry date badge
- Batch selector (seller)

---

### Module 5: Project/Job Management

**Buyer View:**
- Create project (e.g., "Factory XYZ Install")
- Assign orders to project
- Track project completion %
- Share project summary with client

**Seller View:**
- View all buyer projects
- Project-level analytics (margin, timeline)
- Mark project complete

**Components Needed:**
- Project creation form
- Project card (with progress bar)
- Order-to-project assignment

---

### Module 6: Loyalty/Tier Pricing

**Buyer View:**
- Current tier shown (Gold/Silver/Bronze)
- Tier benefits explained
- Progress to next tier (gamification)

**Seller View:**
- Define tier rules (order volume, revenue)
- Set tier-specific pricing
- Manually upgrade/downgrade buyers
- Tier distribution analytics

**Components Needed:**
- Tier badge
- Progress bar to next tier
- Tier benefit list
- Tier pricing matrix

---

## Industry-Specific Adaptations

### CCTV/Electronics (WineYard)

**Custom Attributes:**
- Resolution (2MP, 4MP, 8MP)
- IR range (meters)
- Lens type (fixed, varifocal)
- Power (PoE, 12V)

**Unit of Measure:** Pieces (pcs)

**Typical Bundle:** Camera + NVR + Cable

---

### FMCG/Kirana (Udaan-style)

**Custom Attributes:**
- Weight/Volume (500g, 1L, 5kg)
- MRP (regulatory)
- Brand
- Pack size (6-pack, 12-pack)

**Unit of Measure:** Pieces, kg, liters, packs

**Typical Bundle:** 6-pack discount

---

### Industrial Supplies (Moglix-style)

**Custom Attributes:**
- Material (steel, aluminum, plastic)
- Dimensions (mm, cm)
- Load capacity (kg)
- Certification (ISI, ISO)

**Unit of Measure:** Pieces, meters, kg

**Typical Bundle:** Hardware kit (bolts + nuts + washers)

---

### Pharma/Medical

**Custom Attributes:**
- Batch number (required)
- Expiry date (required)
- Manufacturer
- Composition
- Prescription required (Yes/No)

**Unit of Measure:** Strips, bottles, boxes

**Regulatory:** Batch tracking mandatory, expiry alerts critical

---

## Accessibility Standards (WCAG 2.1 AA Compliance)

### Color Contrast

**Minimum Ratios:**
- Body text (16px): 4.5:1 against background
- Large text (18px+): 3:1 against background
- UI components: 3:1 against adjacent colors

**Testing:**
- All text color combos validated
- Interactive elements tested at all states

---

### Touch Targets

**Minimum Size:** 44x44px (iOS guideline, stricter than Android's 48x48dp)

**Spacing:** Minimum 8px gap between adjacent touch targets

**Critical Targets:**
- Add to cart button: 48px height
- Product card: Entire card tappable (not just button)
- Bottom navigation icons: 56px height

---

### Screen Reader Support

**Required Attributes:**

```html
<!-- Product Card -->
<div role="article" aria-label="Hikvision PTZ Camera, ₹2,800, In Stock, 30 units available">
  <img alt="Hikvision DS-2CD2143G2 4MP PTZ Camera">
  <button aria-label="Add Hikvision PTZ Camera to cart">Add</button>
</div>

<!-- Stock Indicator -->
<span aria-live="polite" aria-atomic="true">
  In Stock • 30 units
</span>

<!-- Cart Badge -->
<button aria-label="View cart, 8 items, total ₹45,230">
  Cart
</button>
```

**Focus Management:**
- Logical tab order (top to bottom, left to right)
- Skip to main content link
- Focus visible on all interactive elements
- Focus trapped in modals

---

### Keyboard Navigation

**Required Shortcuts:**

- `/` : Focus search bar
- `Esc` : Close modal/drawer
- `Tab` : Next focusable element
- `Shift + Tab` : Previous focusable element
- `Enter/Space` : Activate button

**Focus Indicators:**
- 2px solid outline (primary-500)
- 2px offset from element

---

## Developer Handoff Specifications

### Spacing Grid

**Base Unit:** 8px

**Common Spacing Values:**
```
4px   (0.5 units) - Tight spacing
8px   (1 unit)    - Default gap
12px  (1.5 units) - Comfortable spacing
16px  (2 units)   - Standard padding
24px  (3 units)   - Section spacing
32px  (4 units)   - Large spacing
```

**Usage:**
- Card padding: 12px (mobile), 16px (tablet+)
- Grid gap: 16px (mobile), 20px (tablet), 24px (desktop)
- Section margins: 24px (mobile), 32px (tablet+)

---

### Breakpoints

```css
/* Mobile-first approach */
--breakpoint-sm: 640px   /* Tablet portrait */
--breakpoint-md: 768px   /* Tablet landscape */
--breakpoint-lg: 1024px  /* Desktop */
--breakpoint-xl: 1280px  /* Large desktop */
--breakpoint-2xl: 1536px /* Extra large desktop */
```

**Implementation (Tailwind):**
```html
<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
  <!-- Product cards -->
</div>
```

---

### Image Optimization

**Product Images:**
- Format: WebP (fallback to JPEG)
- Dimensions: 600x600px (1x), 1200x1200px (2x for retina)
- Compression: 80% quality
- Lazy loading: enabled (below fold)
- Aspect ratio: 1:1 (enforced with CSS)

**Placeholder:**
```css
.product-image {
  background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
  aspect-ratio: 1 / 1;
}
```

---

### Performance Targets

**Core Web Vitals:**
- Largest Contentful Paint (LCP): <2.5s
- First Input Delay (FID): <100ms
- Cumulative Layout Shift (CLS): <0.1

**Bundle Size:**
- Initial JS: <150KB gzipped
- Initial CSS: <30KB gzipped
- Total page weight: <500KB (including images)

**Offline:**
- Catalog cache: <10MB (compressed)
- Cache refresh: 4x daily or on WiFi
- Service worker: precache shell, lazy-load content

---

## Implementation Priority (Phased Rollout)

### Phase 1: Core Catalog (Weeks 1-3)

**Components:**
- Product card
- Product grid
- Search bar
- Category filter chips
- Bottom sticky cart
- Buy Again section
- Offline indicator

**Modules:**
- None (base functionality only)

**Goal:** WineYard pilot with 10 integrators

---

### Phase 2: Configurability (Weeks 4-8)

**Components:**
- Multi-outlet stock display
- Promotion badge
- Bundle selector
- Credit balance card
- Tier badge

**Modules:**
- Multi-outlet inventory (WineYard has 7 outlets)
- Promotions/deals (seasonal campaigns)
- Loyalty/tier pricing (Gold/Silver tiers)

**Goal:** Expand to 100+ WineYard integrators, onboard 1 new distributor

---

### Phase 3: Industry Expansion (Weeks 9-16)

**Components:**
- Batch info card
- Expiry date badge
- Project card
- Custom attribute fields (flexible schema)
- Unit selector (kg, L, pcs, boxes)

**Modules:**
- Batch/expiry tracking (pharma, FMCG)
- Project management (large integrators)
- Credit/payment terms (all industries)

**Goal:** Onboard distributors in FMCG, pharma, industrial supplies

---

## Design System Maintenance

### Version Control

**Semantic Versioning:** MAJOR.MINOR.PATCH

- **MAJOR:** Breaking changes (e.g., redesigned component API)
- **MINOR:** New components/tokens (backward compatible)
- **PATCH:** Bug fixes, clarifications

**Current Version:** 1.0.0

---

### Change Process

1. **Propose Change:** Document rationale + affected components
2. **Review:** Design team + 1 developer review
3. **Prototype:** Build in Figma + test with users
4. **Approve:** Requires 2 approvals
5. **Document:** Update design system docs
6. **Implement:** Roll out to codebase
7. **Announce:** Changelog + team notification

---

### Component Lifecycle

**States:**
- **Draft:** In Figma, not production-ready
- **Beta:** In code, tested, available for new projects only
- **Stable:** Production-ready, recommended
- **Deprecated:** Replaced, will be removed in next major version
- **Removed:** No longer available

---

## Figma Deliverables Checklist

- [ ] Design tokens documented as Figma variables
- [ ] Component library with all states (default, hover, pressed, disabled)
- [ ] Buyer view mockups (home, search, cart, checkout)
- [ ] Seller view mockups (catalog management, orders, analytics)
- [ ] Mobile screens (375px, 414px widths)
- [ ] Tablet screens (768px, 1024px widths)
- [ ] Desktop screens (1440px width)
- [ ] Responsive behavior annotations
- [ ] Interaction flows (user journeys)
- [ ] Accessibility notes per component
- [ ] Developer handoff specs (spacing, colors, typography)

---

## Success Metrics (Post-Launch)

### Buyer Metrics
- Time to first quotation: <60 seconds (target)
- Repeat purchase rate: 60%+ from Buy Again
- Cart abandonment rate: <30%
- Offline usage %: >40% (validates offline-first)
- Quote → Order conversion: 40%+

### Seller Metrics
- Catalog setup time: <2 hours (new distributor)
- Daily active buyers: 30%+ of total network
- Average order value (AOV): Increase 15% YoY
- Stock-out incidents: Reduce 50% (multi-outlet visibility)
- Promotion engagement: 20%+ click-through

### Platform Metrics
- New distributor onboarding: <1 week
- Cross-industry adoption: 3+ industries by Month 6
- Mobile-first usage: 90%+ on mobile devices
- Offline resilience: <1% data loss from offline mode

---

**End of Design System Documentation v1.0**
