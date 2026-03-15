# TraderOps Design System v2.0
**Version 2.0 | March 2026**  
**A Universal B2B Commerce Catalog Platform**

---

## What's New in v2.0

**Major Updates:**
- Complete Product Detail screen specification added
- Scroll behaviors and sticky header patterns defined (Blinkit/Instamart inspired)
- Screen transition patterns documented (full-screen, no bottom sheets)
- Buyer navigation restructured (Home, Buy Again, Categories, Orders, Account)
- Product card redesigned with image overlays and rounded borders
- Cart visualization with thumbnail previews
- Category browsing patterns refined

**Removed Complexity:**
- Out-of-stock handling simplified (Notify Me only)
- Multi-outlet stock display removed from v0
- Popularity tags removed
- Bottom sheets eliminated (full-screen only)

---

## Design Principles (Unchanged)

### 1. Friction is the Enemy
Target: 3 taps from catalog open → quotation sent

### 2. Offline-First is Non-Negotiable
Full catalog browsable offline, enquiries queued when offline

### 3. Repeat Purchase = Revenue Engine
60%+ of orders from "Buy Again" flow

### 4. Progressive Disclosure Over Information Overload
Show basics first, reveal details on demand

### 5. Familiarity Breeds Speed
Zero learning curve for Swiggy/Amazon/Blinkit users

### 6. Personalization Without Asking
Use order history to personalize without requiring user input

### 7. Trust Through Clarity
Eliminate all ambiguity — exact prices, clear stock status, transparency

---

## Design Tokens (Unchanged)

[Same as v1.0 — refer to Quick Reference for CSS variables]

**Key Tokens:**
- Primary: `#2196F3` (blue)
- Success: `#388E3C` (green)
- Warning: `#F57C00` (amber)
- Error: `#D32F2F` (red)
- Neutral backgrounds: `#FFFFFF`, `#F5F5F5`
- Spacing: 8px grid (4px, 8px, 12px, 16px, 24px, 32px)
- Border radius: 8px (default), 12px (large cards), 16px (modals)

---

## Navigation & Screen Transitions

### Bottom Tab Navigation (Buyer View)

```
┌──────┬──────┬──────┬──────┐
│ Home │ Buy  │Categ.│Orders│
│      │Again │      │      │
└──────┴──────┴──────┴──────┘
```

**Tabs:**
1. **Home** — Catalog browse, search, personalized sections
2. **Buy Again** — Previously ordered items (full product grid)
3. **Categories** — Products grouped by category, ordered by purchase frequency
4. **Orders** — Past order history (list of order cards)

**Account:** Collapsed into user avatar (top-right of Home screen header)

**Cart:** Floating button (bottom-center), NOT a tab

---

### Screen Transition Patterns

**Rule:** No bottom sheets. All transitions are full-screen.

**Horizontal Transitions (Left ← Right):**
- Tap product card → Product Detail screen (slide from right)
- Tap category → Category browse screen (slide from right)
- Tap order → Order detail screen (slide from right)
- Back button → Slide to left (reverse)

**Vertical Transitions (Bottom ↑ Up):**
- Tap floating Cart button → Cart screen (slide from bottom)
- Back from Cart → Slide down (reverse)

**No Modals/Bottom Sheets:**
- All content in dedicated screens
- Exception: System alerts only (e.g., "Product added to cart" toast)

**Animation:**
- Duration: 300ms (standard)
- Easing: `cubic-bezier(0.4, 0.0, 0.2, 1)` (deceleration)

---

## Scroll Behaviors (Blinkit/Instamart Pattern)

### Home Screen Header States

**State 1: Full Header (Default, Top of Page)**
```
┌─────────────────────────────────────┐
│ 📍 Himayatnagar Warehouse      👤  │ ← Location + Avatar
├─────────────────────────────────────┤
│ 🔍 Search for "4mp wifi camera"... │ ← Search bar
├─────────────────────────────────────┤
│ [All] [Fresh] [Gourmet] [50% Off]  │ ← Category chips
└─────────────────────────────────────┘
```

**State 2: Collapsed Header (Scroll Down / Swipe Up)**
```
┌─────────────────────────────────────┐
│ 🔍 Search               👤          │ ← Sticky search + avatar
├─────────────────────────────────────┤
│ [All] [Fresh] [Gourmet] [50% Off]  │ ← Sticky category chips
└─────────────────────────────────────┘

• Bottom tabs HIDDEN (more screen real estate for products)
• Header height reduced from 160px → 96px
• Location selector hidden
```

**State 3: Quick Scroll Up (Swipe Down)**
```
┌─────────────────────────────────────┐
│ 🔍 Search               👤          │ ← Header stays collapsed
├─────────────────────────────────────┤
│ [All] [Fresh] [Gourmet] [50% Off]  │
└─────────────────────────────────────┘

• Bottom tabs VISIBLE (user wants to navigate)
• Header stays collapsed (don't expand unless fully at top)
```

**State 4: Full Scroll to Top**
- Header expands to full state (State 1)
- Location selector visible again

**Technical Implementation:**
```javascript
let lastScrollY = 0;
const SCROLL_THRESHOLD = 50; // px

onScroll(currentScrollY) {
  const scrollingDown = currentScrollY > lastScrollY;
  const atTop = currentScrollY < SCROLL_THRESHOLD;
  
  if (atTop) {
    header.expand();
    tabs.show();
  } else if (scrollingDown) {
    header.collapse();
    tabs.hide();
  } else {
    header.collapse();
    tabs.show();
  }
  
  lastScrollY = currentScrollY;
}
```

---

## Header Component Specifications

### Home Screen Header (Full State)

**Anatomy:**
```
┌─────────────────────────────────────┐
│ 📍 Himayatnagar Warehouse ▼    👤  │ ← Row 1: Location + Avatar
├─────────────────────────────────────┤
│ 🔍 Search for "spike box"      🎙️  │ ← Row 2: Search bar + voice
├─────────────────────────────────────┤
│ [All] [Cameras] [NVR] [Cables] →   │ ← Row 3: Category chips (scroll)
└─────────────────────────────────────┘
```

**Specifications:**

| Element | Value | Notes |
|---------|-------|-------|
| Total height (full) | 160px | 3 rows @ ~50px each + padding |
| Total height (collapsed) | 96px | 2 rows (search + categories) |
| Background | --color-neutral-0 | White |
| Bottom border | 1px solid neutral-200 | Subtle divider |
| Padding horizontal | 16px | Standard |
| Padding vertical | 12px | Comfortable |
| Shadow (when sticky) | elevation-1 | Subtle lift |

**Row 1: Location + Avatar**

| Element | Value | Notes |
|---------|-------|-------|
| Location text | font-size-base (16px) | Readable |
| Location weight | font-weight-semibold (600) | Emphasize |
| Location icon | 20px | Map pin |
| Location tap target | Full row width | Easy to tap |
| Avatar size | 40px diameter | Standard |
| Avatar position | Absolute right | Fixed position |

**Row 2: Search Bar**

| Element | Value | Notes |
|---------|-------|-------|
| Height | 48px | Touch-friendly |
| Border radius | radius-full (9999px) | Pill shape |
| Background | neutral-100 (#F5F5F5) | Subtle contrast |
| Placeholder | Rotating examples | "spike box", "4mp camera", etc. |
| Icon size | 20px | Magnifying glass + voice |
| Border (focus) | 2px solid primary-500 | Clear active state |

**Rotating Placeholder Logic:**
```javascript
const placeholders = [
  "Search for \"4mp wifi camera\"",
  "Search for \"spike box\"",
  "Search for \"HDMI cable\"",
  "Search for \"PTZ camera\"",
  "Search for \"NVR 16 channel\""
];

// Rotate every 3 seconds when search is empty
setInterval(() => {
  if (!searchInput.value) {
    searchInput.placeholder = placeholders[currentIndex];
    currentIndex = (currentIndex + 1) % placeholders.length;
  }
}, 3000);
```

**Row 3: Category Chips**

| Element | Value | Notes |
|---------|-------|-------|
| Chip height | 36px | Compact |
| Chip padding | 16px horizontal | Touch-friendly |
| Chip radius | radius-full | Pill shape |
| Gap between chips | 8px | Tight spacing |
| Scroll behavior | Horizontal scroll | No wrapping |
| Active chip bg | primary-500 | Blue |
| Active chip text | #FFFFFF | White |
| Inactive chip bg | neutral-100 | Light gray |
| Inactive chip text | neutral-700 | Dark gray |

---

## Product Card Component (Redesigned)

**Purpose:** Display product in browsable grid with instant add-to-cart

**Anatomy (Blinkit/Instamart Pattern):**
```
┌─────────────────────────┐
│  [15% OFF]              │ ← Top overlay badge (discount/promo)
│                         │
│   [Product Image]       │ ← Rounded image (12px radius)
│                         │
│         [+ 1 -]         │ ← Bottom-right overlay (add/adjust qty)
├─────────────────────────┤
│ Hikvision PTZ Camera    │ ← Product name (1 line)
│ 4MP • IR 30m            │ ← Secondary detail (1 line, gray)
│ ₹2,800  ₹3,200         │ ← Price + MRP strikethrough
└─────────────────────────┘
```

**Specifications:**

| Element | Token/Value | Notes |
|---------|------------|-------|
| **Container** | | |
| Width | 48% viewport (2 cols) | Responsive |
| Padding | 0 | No internal padding |
| Background | transparent | Cards float on page bg |
| Gap between cards | 12px | Comfortable spacing |
| **Image** | | |
| Aspect ratio | 1:1 | Square |
| Border radius | 12px | Rounded corners |
| Background (loading) | neutral-100 | Light gray placeholder |
| Object fit | cover | Fill frame |
| **Top Overlay Badge** | | |
| Position | Absolute top-center | Centered on image |
| Background | warning-500 (#FF9800) | Amber for discount |
| Text color | #FFFFFF | White |
| Font size | font-size-xs (12px) | Small |
| Font weight | font-weight-bold (700) | High contrast |
| Padding | 4px 8px | Compact |
| Border radius | radius-sm (4px) | Small corners |
| **Bottom-Right Add Button Overlay** | | |
| Position | Absolute bottom-right | Over image |
| Size (default) | 32px × 32px | Compact circle |
| Size (with qty) | 80px × 32px | Expanded pill |
| Background | success-700 (#388E3C) | Green |
| Text color | #FFFFFF | White |
| Border radius | radius-full | Pill/circle |
| Icon | + (add) | Initial state |
| Qty display | - [2] + | Expanded state |
| **Product Name** | | |
| Font size | font-size-base (16px) | Readable |
| Font weight | font-weight-medium (500) | Slightly bold |
| Lines | 1 max | Truncate with ellipsis |
| Color | neutral-900 | Black |
| Margin top | 8px | Space from image |
| **Secondary Detail** | | |
| Font size | font-size-sm (14px) | Smaller |
| Font weight | font-weight-regular (400) | Normal |
| Lines | 1 max | Truncate |
| Color | neutral-600 | Gray |
| Margin top | 4px | Tight spacing |
| **Price** | | |
| Font size | font-size-lg (18px) | Emphasize |
| Font weight | font-weight-bold (700) | High contrast |
| Color | neutral-900 | Black |
| Margin top | 4px | Tight spacing |
| **MRP Strikethrough** | | |
| Font size | font-size-sm (14px) | Smaller |
| Font weight | font-weight-regular (400) | Normal |
| Color | neutral-500 | Light gray |
| Text decoration | line-through | Strikethrough |
| Display | Inline (next to price) | Side-by-side |

**States:**

1. **Default (Not in Cart):**
   - Add button shows `+` icon only
   - Button size: 32px circle
   - Tap → Add 1 to cart, expand to qty selector

2. **In Cart (Qty > 0):**
   - Button expands to pill: `- [2] +`
   - Button size: 80px × 32px
   - `-` tap → Decrease qty (remove if qty = 1)
   - `+` tap → Increase qty

3. **Out of Stock:**
   - Top badge: "Out of Stock" (red bg, white text)
   - Add button replaced with "Notify" button
   - Entire card opacity: 0.6
   - Image: grayscale filter

4. **Promotional Badge:**
   - Top badge shows: "15% OFF" or "Bestseller" or "Deal"
   - Background color varies: Discount = amber, Bestseller = blue, Deal = red

**Tap Behavior:**
- Tap anywhere on card (except add button) → Navigate to Product Detail screen

---

## Bottom Sticky Cart (Redesigned with Thumbnails)

**Purpose:** Always-visible cart status with visual preview

**Anatomy (Blinkit Pattern):**
```
┌─────────────────────────────────────┐
│ [🖼️][🖼️][🖼️]  View Cart        >  │
│                  8 items             │
└─────────────────────────────────────┘
```

**Specifications:**

| Element | Value | Notes |
|---------|-------|-------|
| Position | Fixed bottom | Always visible |
| Height | 64px | Slightly taller for thumbnails |
| Background | success-700 (#388E3C) | Green (cart action) |
| Text color | #FFFFFF | White |
| Padding | 12px horizontal | Comfortable |
| Border radius (top) | 16px | Rounded top corners |
| Shadow | elevation-3 | Strong lift |
| **Thumbnails** | | |
| Count | Up to 3 max | Show first 3 items |
| Size | 40px × 40px | Small squares |
| Border radius | 8px | Rounded |
| Border | 2px solid white | Outline for contrast |
| Spacing | -8px (overlap) | Slight overlap for compactness |
| Position | Absolute left | Left-aligned |
| **Text** | | |
| "View Cart" font size | font-size-lg (18px) | Emphasize |
| "View Cart" weight | font-weight-semibold (600) | Bold |
| Item count font size | font-size-sm (14px) | Secondary |
| Item count weight | font-weight-regular (400) | Normal |
| Text position | Center | Between thumbnails and arrow |
| **Arrow Icon** | | |
| Icon | > (chevron right) | Direction cue |
| Size | 20px | Standard |
| Position | Absolute right | Right-aligned |

**States:**

1. **Empty Cart:**
   - Hidden (collapsed to nothing)

2. **Items in Cart (1-3 items):**
   - Shows actual thumbnails
   - "View Cart" + "X items"

3. **Items in Cart (4+ items):**
   - Shows first 3 thumbnails only
   - Still says total count ("8 items")

4. **Offline with Queued Items:**
   - No visual change (save "queued" indicator for Cart detail screen)
   - Keep it simple at floating button level

**Tap Behavior:**
- Tap anywhere → Navigate to Cart screen (vertical slide from bottom)

---

## Buy Again Screen (New Tab)

**Purpose:** Dedicated tab for repeat purchases (high-frequency orders)

**Layout:**
```
┌─────────────────────────────────────┐
│ 🔍 Search your past orders...       │ ← Search bar (filter)
├─────────────────────────────────────┤
│ Cameras (12 items) ▼                │ ← Category group (expandable)
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │
│ │PTZ │ │4MP │ │8MP │ │... │        │ ← Product grid
│ └────┘ └────┘ └────┘ └────┘        │
├─────────────────────────────────────┤
│ NVRs (5 items) ▼                    │ ← Next category
│ ┌────┐ ┌────┐ ┌────┐               │
│ │16CH│ │32CH│ │... │               │
│ └────┘ └────┘ └────┘               │
└─────────────────────────────────────┘
```

**Data Source:**
- Last 90 days order history
- Grouped by category
- Ordered by purchase frequency (most frequent first)
- Categories ordered by total items purchased

**Category Group Pattern (+X More):**

**Collapsed State:**
```
┌─────────────────────────────────────┐
│ Cameras (12 items) +9 more          │ ← Shows first 3 products
│ ┌────┐ ┌────┐ ┌────┐               │
│ │PTZ │ │4MP │ │8MP │               │
│ └────┘ └────┘ └────┘               │
└─────────────────────────────────────┘
```

**Expanded State:**
```
┌─────────────────────────────────────┐
│ Cameras (12 items) ▲                │ ← Full grid shown
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │
│ │PTZ │ │4MP │ │8MP │ │Dome│        │
│ └────┘ └────┘ └────┘ └────┘        │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │
│ │... │ │... │ │... │ │... │        │
│ └────┘ └────┘ └────┘ └────┘        │
└─────────────────────────────────────┘
```

**Behavior:**
- Tap category header → Toggle expand/collapse
- Default: All categories collapsed (show 3 items each)
- Search: Filter products across all categories

---

## Categories Screen (Tab)

**Purpose:** Browse products grouped by category, ordered by relevance

**Layout:**
```
┌─────────────────────────────────────┐
│ 🔍 Search in categories...          │ ← Search bar
├─────────────────────────────────────┤
│ Cameras (45 items) ▼                │ ← Category (ordered by purchase freq)
│ ┌────┐ ┌────┐ ┌────┐ +42           │
│ │PTZ │ │Dome│ │Bullet│             │ ← Show first 3, rest expandable
│ └────┘ └────┘ └────┘               │
├─────────────────────────────────────┤
│ NVRs (18 items) ▼                   │
│ ┌────┐ ┌────┐ ┌────┐ +15           │
│ │16CH│ │32CH│ │4CH │               │
│ └────┘ └────┘ └────┘               │
└─────────────────────────────────────┘
```

**Ordering Logic:**
- Categories ordered by: Total items purchased from that category (last 90 days)
- New integrators (no purchase history): Alphabetical order

**Category Expansion:**
- Same "+X more" pattern as Buy Again tab
- Tap to expand full product grid

---

## Orders Screen (Tab)

**Purpose:** View past order history

**Layout:**
```
┌─────────────────────────────────────┐
│ Your Orders                          │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐│
│ │ Order #WY-4531                  ││
│ │ Mar 12, 2026 • 8 items          ││
│ │ ₹45,230 • Delivered             ││
│ │ [Reorder] [View Details]        ││
│ └─────────────────────────────────┘│
│ ┌─────────────────────────────────┐│
│ │ Order #WY-4512                  ││
│ │ Mar 8, 2026 • 12 items          ││
│ │ ₹67,890 • Delivered             ││
│ │ [Reorder] [View Details]        ││
│ └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

**Order Card Specifications:**

| Element | Value | Notes |
|---------|-------|-------|
| Card background | neutral-0 (white) | Clean |
| Card border | 1px solid neutral-200 | Subtle outline |
| Card radius | 8px | Rounded |
| Card padding | 16px | Comfortable |
| Card margin | 12px bottom | Spacing between cards |
| Order number font | font-size-base, semibold | Emphasize |
| Metadata font | font-size-sm, regular | Date, items, status |
| Metadata color | neutral-600 | Gray |
| Status color (delivered) | success-700 | Green |
| Status color (pending) | warning-700 | Amber |
| **CTAs** | | |
| Reorder button | Outlined, primary-500 border | Secondary action |
| View Details button | Filled, primary-500 bg | Primary action |
| Button height | 40px | Touch-friendly |

**Tap Behavior:**
- Tap "Reorder" → Add all items from this order to cart, show confirmation toast
- Tap "View Details" → Navigate to Order Detail screen (slide from right)

---

## Product Detail Screen (Full Specification)

**Purpose:** Comprehensive product information with purchase options

**Anatomy (Full Scroll View):**
```
┌─────────────────────────────────────┐
│ ← 🔍                           ↗️   │ ← Collapsed search + share
├─────────────────────────────────────┤
│                                     │
│   [Large Product Image Carousel]    │ ← Hero image (swipeable)
│                                     │
├─────────────────────────────────────┤
│ Hikvision DS-2CD2143G2              │ ← Product name (primary)
│ 4MP PTZ Camera • IR 30m             │ ← Variant detail (secondary)
│                                     │
│ ★★★★☆ 4.1 (253 reviews)            │ ← Ratings (if available)
│                                     │
│ ₹2,800  ₹3,200  15% OFF            │ ← Price + MRP + discount
├─────────────────────────────────────┤
│ Product Details ▼                   │ ← Collapsible details
│ • Resolution: 4MP (2688x1520)       │
│ • IR Range: 30 meters               │
│ • Lens: 2.8-12mm varifocal          │
│ • Power: PoE / 12V DC               │
│                                     │
├─────────────────────────────────────┤
│ 🏢 Hikvision                        │ ← Brand CTA
│ Explore all products           >    │
├─────────────────────────────────────┤
│ People also bought                  │ ← Recommendation section
│ ┌────┐ ┌────┐ ┌────┐              │
│ │NVR │ │Cable│ │Mount│             │ ← Product cards (horizontal scroll)
│ └────┘ └────┘ └────┘              │
├─────────────────────────────────────┤
│ Similar products                    │
│ ┌────┐ ┌────┐ ┌────┐              │
│ │2MP │ │8MP │ │Dome│              │
│ └────┘ └────┘ └────┘              │
├─────────────────────────────────────┤
│ Top in Cameras category             │
│ ┌────┐ ┌────┐ ┌────┐              │
│ │Best│ │#2  │ │#3  │              │
│ └────┘ └────┘ └────┘              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 4MP • 30m IR  ₹2,800     [Add +]   │ ← Sticky footer (always visible)
└─────────────────────────────────────┘
```

**Component Breakdown:**

### Top Bar (Sticky)

| Element | Value | Notes |
|---------|-------|-------|
| Height | 56px | Standard navbar |
| Background | neutral-0 (white) | Clean |
| Border bottom | 1px solid neutral-200 | Divider |
| Shadow | elevation-1 (when sticky) | Subtle lift |
| Back button | ← icon, 40px tap target | Left-aligned |
| Search button | 🔍 icon, 40px tap target | Collapsed (icon only) |
| Share button | ↗️ icon, 40px tap target | Right-aligned |

**Tap Behaviors:**
- Back: Navigate back to previous screen (slide left)
- Search: Navigate to Search screen (slide right)
- Share: Open native share sheet (product link)

---

### Hero Image Carousel

| Element | Value | Notes |
|---------|-------|-------|
| Aspect ratio | 1:1 | Square |
| Width | 100% viewport | Full-width |
| Height | Min 375px | Large hero |
| Background | neutral-100 | Loading placeholder |
| Border radius | 0 | No rounding (full-bleed) |
| Image count indicator | Dots at bottom | 1/3, 2/3, etc. |
| Dot size | 8px diameter | Small |
| Dot color (active) | primary-500 | Blue |
| Dot color (inactive) | neutral-300 | Gray |
| Swipe behavior | Horizontal swipe | Native carousel |
| Zoom on tap | Optional (nice-to-have) | Full-screen image view |

**Image Loading:**
- Progressive: Show low-res first, swap to high-res when loaded
- Lazy load: Only load visible image + next 1

---

### Product Name & Variant

| Element | Value | Notes |
|---------|-------|-------|
| Padding horizontal | 16px | Standard page padding |
| Padding top | 16px | Space from image |
| **Product Name** | | |
| Font size | font-size-2xl (24px) | Large, prominent |
| Font weight | font-weight-bold (700) | High emphasis |
| Color | neutral-900 | Black |
| Lines | 2 max | Wrap if needed |
| **Variant Detail** | | |
| Font size | font-size-base (16px) | Readable |
| Font weight | font-weight-regular (400) | Normal |
| Color | neutral-600 | Gray |
| Margin top | 4px | Tight spacing |

---

### Ratings (If Available)

| Element | Value | Notes |
|---------|-------|-------|
| Star icon size | 16px | Small |
| Star color (filled) | warning-500 (#FF9800) | Amber/gold |
| Star color (empty) | neutral-300 | Gray |
| Rating text | "4.1" | Bold, neutral-900 |
| Review count | "(253 reviews)" | Regular, neutral-600 |
| Font size | font-size-sm (14px) | Small |
| Margin top | 8px | Space from variant |

**Tap Behavior:**
- Tap ratings → Navigate to Reviews screen (future)
- For v0: No tap action (passive display)

---

### Price Section

| Element | Value | Notes |
|---------|-------|-------|
| Margin top | 12px | Space from ratings |
| **Current Price** | | |
| Font size | font-size-2xl (24px) | Large, prominent |
| Font weight | font-weight-bold (700) | High emphasis |
| Color | neutral-900 | Black |
| **MRP Strikethrough** | | |
| Font size | font-size-lg (18px) | Smaller than price |
| Font weight | font-weight-regular (400) | Normal |
| Color | neutral-500 | Light gray |
| Text decoration | line-through | Strikethrough |
| Display | Inline (next to price) | Side-by-side |
| **Discount Badge** | | |
| Font size | font-size-sm (14px) | Small |
| Font weight | font-weight-semibold (600) | Slightly bold |
| Color | success-700 (#388E3C) | Green |
| Display | Inline (after MRP) | "15% OFF" |

---

### Product Details (Collapsible)

| Element | Value | Notes |
|---------|-------|-------|
| Margin top | 24px | Section spacing |
| Background | neutral-50 (#FAFAFA) | Subtle contrast |
| Padding | 16px | Comfortable |
| Border radius | 8px | Rounded |
| **Header** | | |
| Text | "Product Details" | |
| Font size | font-size-lg (18px) | Emphasize |
| Font weight | font-weight-semibold (600) | Bold |
| Expand icon | ▼ / ▲ | Right-aligned |
| **Bullet Points** | | |
| Bullet style | • (Unicode bullet) | Simple |
| Font size | font-size-base (16px) | Readable |
| Font weight | font-weight-regular (400) | Normal |
| Color | neutral-700 | Dark gray |
| Line height | 1.5 | Comfortable |
| Max items (collapsed) | 4-5 bullets | Brief summary |
| Max items (expanded) | All specs | Full list |

**Default State:** Collapsed (show 4-5 key specs)

**Tap Behavior:**
- Tap header → Toggle expand/collapse
- Expand: Smooth height animation (300ms)

---

### Brand Exploration CTA

| Element | Value | Notes |
|---------|-------|-------|
| Margin top | 24px | Section spacing |
| Background | neutral-0 (white) | Clean |
| Border | 1px solid neutral-200 | Subtle outline |
| Border radius | 8px | Rounded |
| Padding | 16px | Comfortable |
| **Brand Logo** | | |
| Size | 40px × 40px | Small icon |
| Border radius | 8px | Slightly rounded |
| Position | Left-aligned | |
| **Text** | | |
| Brand name font | font-size-lg (18px), semibold | Emphasize |
| "Explore all products" font | font-size-sm (14px), regular | Secondary |
| Color | neutral-900 (name), neutral-600 (CTA) | Contrast |
| **Arrow Icon** | | |
| Icon | > (chevron right) | Direction cue |
| Size | 20px | Standard |
| Position | Right-aligned | |

**Tap Behavior:**
- Tap anywhere on card → Navigate to Brand Product Listing screen (all Hikvision products)

---

### Recommendation Sections

**Three Sections:**
1. **People Also Bought** — Products frequently purchased together
2. **Similar Products** — Same category, similar specs
3. **Top in [Category]** — Best-selling in this category

**Section Layout:**
```
┌─────────────────────────────────────┐
│ People also bought                  │ ← Section header
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ →     │
│ │NVR │ │Cable│ │Mount│ │... │     │ ← Horizontal scroll (product cards)
│ └────┘ └────┘ └────┘ └────┘       │
└─────────────────────────────────────┘
```

**Specifications:**

| Element | Value | Notes |
|---------|-------|-------|
| Section margin top | 32px | Large spacing |
| Section header font | font-size-lg (18px), semibold | Emphasize |
| Section header margin | 12px bottom | Space before cards |
| **Product Cards** | | |
| Format | Same as catalog browse | Consistent UX |
| Width | 140px fixed | Narrower for horizontal scroll |
| Gap | 12px | Comfortable spacing |
| Scroll behavior | Horizontal scroll | Swipe left/right |
| Show indicator | No scrollbar | Native feel |

**Data Logic:**

**People Also Bought:**
- Products frequently ordered together (last 90 days)
- Max 10 items shown
- Ordered by co-purchase frequency

**Similar Products:**
- Same category
- Similar price range (±30%)
- Ordered by popularity

**Top in Category:**
- Best-selling products in this category (last 30 days)
- Max 10 items shown
- Ordered by sales volume

---

### Sticky Footer (Variant + Add to Cart)

**Purpose:** Always-visible purchase controls

**Anatomy:**
```
┌─────────────────────────────────────┐
│ 4MP • 30m IR  ₹2,800     [Add +]   │
└─────────────────────────────────────┘
```

**With Variants (<5 variants):**
```
┌─────────────────────────────────────┐
│ ┌────┐ ┌────┐ ┌────┐               │ ← Variant grid (if <5 variants)
│ │2MP │ │4MP │ │8MP │               │
│ │₹2K │ │₹2.8K│ │₹4K│              │
│ └────┘ └────┘ └────┘               │
│ 4MP • 30m IR  ₹2,800     [Add +]   │ ← Price + CTA for selected variant
└─────────────────────────────────────┘
```

**Specifications:**

| Element | Value | Notes |
|---------|-------|-------|
| Position | Fixed bottom | Always visible |
| Background | neutral-0 (white) | Clean |
| Border top | 1px solid neutral-200 | Divider |
| Shadow | elevation-3 | Strong lift |
| Padding | 16px | Comfortable |
| Height (no variants) | 72px | Standard |
| Height (with variants) | 160px | Expanded for grid |
| **Variant Grid** | | |
| Card size | 100px × 80px | Compact |
| Border radius | 8px | Rounded |
| Border (inactive) | 1px solid neutral-300 | Gray outline |
| Border (active) | 2px solid primary-500 | Blue highlight |
| Background (active) | primary-50 | Light blue tint |
| Variant name font | font-size-sm (14px), semibold | Emphasize |
| Variant price font | font-size-sm (14px), regular | Secondary |
| Gap between cards | 8px | Tight spacing |
| **Selected Variant Detail** | | |
| Font size | font-size-base (16px) | Readable |
| Font weight | font-weight-medium (500) | Slightly bold |
| Color | neutral-700 | Dark gray |
| **Price** | | |
| Font size | font-size-xl (20px) | Large |
| Font weight | font-weight-bold (700) | High emphasis |
| Color | neutral-900 | Black |
| **Add Button** | | |
| Width | 120px | Fixed width |
| Height | 48px | Touch-friendly |
| Background | success-700 (#388E3C) | Green |
| Text | "Add +" or "- [2] +" | Conditional |
| Text color | #FFFFFF | White |
| Border radius | 8px | Rounded |

**States:**

1. **No Variants:**
   - Show selected variant detail + price + Add button
   - No variant grid

2. **Has Variants (<5):**
   - Show variant grid at top
   - Default: First variant selected
   - Tap variant → Update price + detail, highlight selected

3. **Item Not in Cart:**
   - Button text: "Add +"
   - Tap → Add 1 to cart, change to qty selector

4. **Item in Cart (Qty > 0):**
   - Button text: "- [2] +"
   - `-` tap → Decrease qty (remove if qty = 1)
   - `+` tap → Increase qty

---

### Floating Cart Button (Persistent)

**Important:** Cart button from Home screen remains visible on Product Detail screen (bottom-center, above sticky footer)

**Z-Index Layering:**
```
Floating Cart Button (z-index: 100)
   ↑ Above
Sticky Footer (z-index: 50)
```

**Position:**
- Bottom: 80px (above sticky footer height of 72px + 8px margin)
- Center horizontally

---

## Out-of-Stock Handling (Simplified)

**Rule:** Only show "Out of Stock" when unavailable across ALL warehouses.

**Product Card (Out of Stock):**
```
┌─────────────────────────┐
│  [Out of Stock]         │ ← Red badge at top
│                         │
│   [Grayscale Image]     │ ← Image desaturated
│                         │
│         [Notify]        │ ← "Notify Me" button (not "Add")
├─────────────────────────┤
│ Hikvision PTZ Camera    │
│ 4MP • IR 30m            │
│ ₹2,800  ₹3,200         │ ← Price still shown
└─────────────────────────┘
```

**Specifications:**

| Element | Value | Notes |
|---------|-------|-------|
| Card opacity | 0.6 | Faded appearance |
| Image filter | grayscale(100%) | Desaturated |
| Top badge bg | error-700 (#D32F2F) | Red |
| Top badge text | "Out of Stock" | Clear message |
| Button text | "Notify" | Not "Add" |
| Button bg | primary-500 | Blue (not green) |
| Button tap | Open notification form | Email/WhatsApp alert |

**Notification Form (Bottom Sheet - Exception):**
```
┌─────────────────────────────────────┐
│ Notify me when back in stock        │
│                                     │
│ Product: Hikvision PTZ 4MP          │
│                                     │
│ [ ] Email: suresh@example.com       │ ← Pre-filled
│ [ ] WhatsApp: +91 98765 43210       │ ← Pre-filled
│                                     │
│ [Cancel]              [Subscribe]   │
└─────────────────────────────────────┘
```

**No Multi-Outlet Stock Display:**
- For v0, ignore which warehouse is out of stock
- Simple binary: Available (at least 1 warehouse) or Out of Stock (all warehouses)

---

## Offline Behavior (Cart Detail)

**Online Cart Screen:**
```
┌─────────────────────────────────────┐
│ ← Cart                              │
├─────────────────────────────────────┤
│ ✓ Updated 2 min ago                 │ ← Sync status banner
├─────────────────────────────────────┤
│ [Product 1]  - 2 +    ₹5,600       │
│ [Product 2]  - 1 +    ₹2,800       │
│ ...                                 │
├─────────────────────────────────────┤
│ Total: 8 items • ₹45,230            │
│ [Get WhatsApp Quote]                │
└─────────────────────────────────────┘
```

**Offline Cart Screen:**
```
┌─────────────────────────────────────┐
│ ← Cart                              │
├─────────────────────────────────────┤
│ ⚠️ Offline • 3 items queued          │ ← Offline banner (amber)
│ Will sync when online               │
├─────────────────────────────────────┤
│ [Product 1]  - 2 +    ₹5,600       │
│ [Product 2]  - 1 +    ₹2,800       │
│ ...                                 │
├─────────────────────────────────────┤
│ Total: 8 items • ₹45,230            │
│ [Queue Quotation]                   │ ← CTA changes when offline
└─────────────────────────────────────┘
```

**Offline Banner Specifications:**

| Element | Value | Notes |
|---------|-------|-------|
| Background | warning-50 (#FFF3E0) | Light amber |
| Text color | warning-900 | Dark amber |
| Icon | ⚠️ | Warning symbol |
| Font size | font-size-sm (14px) | Small |
| Font weight | font-weight-medium (500) | Slightly bold |
| Padding | 12px | Comfortable |
| Border bottom | 1px solid warning-200 | Divider |

**CTA Changes:**
- Online: "Get WhatsApp Quote" → Sends immediately
- Offline: "Queue Quotation" → Saves locally, syncs later

---

## Responsive Grid Breakpoints

**Product Grid (2-3-4 Column Layout):**

| Screen Size | Columns | Gap | Notes |
|------------|---------|-----|-------|
| Mobile (<640px) | 2 | 12px | Default |
| Tablet (640-1024px) | 3 | 16px | More space |
| Desktop (>1024px) | 4 | 20px | Max density |

**Implementation (Tailwind):**
```html
<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
  <!-- Product cards -->
</div>
```

---

## Animation & Interaction Patterns

### Add-to-Cart Animation

**Sequence:**
1. User taps `+` button on product card
2. Button scales up (1.1x) for 100ms
3. Haptic feedback (vibrate 10ms)
4. Button morphs from circle → pill (200ms)
5. Quantity appears: `- [1] +`
6. Floating cart badge updates count (bounce animation)

**CSS:**
```css
.add-button {
  transition: all 200ms cubic-bezier(0.4, 0.0, 0.2, 1);
}

.add-button:active {
  transform: scale(1.1);
}

.cart-badge-bounce {
  animation: bounce 300ms ease-in-out;
}

@keyframes bounce {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
```

---

### Screen Transition Animation

**Horizontal (Left ← Right):**
```css
@keyframes slideInFromRight {
  from {
    transform: translateX(100%);
    opacity: 0.8;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutToLeft {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-30%);
    opacity: 0.5;
  }
}
```

**Vertical (Bottom ↑ Up):**
```css
@keyframes slideUpFromBottom {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
```

**Duration:** 300ms  
**Easing:** `cubic-bezier(0.4, 0.0, 0.2, 1)` (deceleration)

---

## Accessibility Updates (v2.0)

**All v1.0 standards apply, plus:**

### Focus Order (Product Detail Screen)

```
1. Back button
2. Search button
3. Share button
4. Image carousel (swipe or arrow keys)
5. Product name (focusable for screen readers)
6. Ratings (if tappable)
7. Price (focusable for screen readers)
8. Product details expander
9. Brand exploration CTA
10. Recommendation section products
11. Variant selector (if present)
12. Add to cart button
13. Floating cart button
```

**Keyboard Shortcuts (Product Detail):**
- `Left/Right Arrow` : Navigate image carousel
- `Enter/Space` : Tap focused button/CTA
- `Esc` : Navigate back (close screen)

---

### Screen Reader Announcements

**Product Card:**
```html
<div role="article" aria-label="Hikvision PTZ Camera, 4MP with 30m IR range, Price ₹2,800, MRP ₹3,200, 15% off, In Stock">
  <!-- Card content -->
</div>
```

**Out-of-Stock Card:**
```html
<div role="article" aria-label="Hikvision PTZ Camera, Out of Stock, Notify me when available">
  <!-- Card content -->
</div>
```

**Floating Cart Button:**
```html
<button aria-label="View cart, 8 items, total ₹45,230, tap to view details">
  <!-- Cart content -->
</button>
```

**Variant Selector:**
```html
<div role="radiogroup" aria-label="Select camera resolution">
  <button role="radio" aria-checked="false" aria-label="2MP variant, ₹2,000">2MP</button>
  <button role="radio" aria-checked="true" aria-label="4MP variant, ₹2,800, selected">4MP</button>
  <button role="radio" aria-checked="false" aria-label="8MP variant, ₹4,000">8MP</button>
</div>
```

---

## Performance Targets (Updated)

### Core Web Vitals

| Metric | Target | Notes |
|--------|--------|-------|
| LCP (Largest Contentful Paint) | <2.5s | Hero image on Product Detail |
| FID (First Input Delay) | <100ms | Add-to-cart button tap |
| CLS (Cumulative Layout Shift) | <0.1 | No layout jumps during scroll |
| **New: INP (Interaction to Next Paint)** | <200ms | Replacing FID in 2024+ |

### Bundle Size

| Asset | Target | Notes |
|-------|--------|-------|
| Initial JS | <150KB gzipped | Core app bundle |
| Initial CSS | <30KB gzipped | Tailwind + custom |
| Total page weight (Home) | <500KB | Including images |
| Product Detail page weight | <800KB | Hero images are larger |

### Image Optimization

**Product Thumbnails (Grid):**
- Dimensions: 300x300 (1x), 600x600 (2x)
- Format: WebP (fallback JPEG)
- Compression: 80% quality
- Lazy load: below fold

**Hero Images (Product Detail):**
- Dimensions: 800x800 (1x), 1600x1600 (2x)
- Format: WebP (fallback JPEG)
- Compression: 85% quality (higher for detail)
- Progressive JPEG: Enabled

### Offline Cache Size

| Data | Size Limit | Refresh Rate |
|------|-----------|--------------|
| Full catalog | <10MB compressed | 4x daily or on WiFi |
| Product images | <50MB total | On-demand, cached indefinitely |
| User cart | <100KB | Real-time sync when online |

---

## Implementation Checklist (v2.0)

### Phase 1: Core Experience (Weeks 1-3)

**Screens:**
- [ ] Home screen with sticky header + scroll behavior
- [ ] Product Detail screen (full spec)
- [ ] Cart screen
- [ ] Buy Again tab
- [ ] Categories tab
- [ ] Orders tab

**Components:**
- [ ] Product card (redesigned with overlays)
- [ ] Bottom sticky cart (with thumbnails)
- [ ] Search bar (rotating placeholders)
- [ ] Category filter chips
- [ ] Offline indicator banner
- [ ] Variant selector grid
- [ ] Recommendation sections (horizontal scroll)

**Behaviors:**
- [ ] Screen transitions (horizontal + vertical)
- [ ] Header collapse on scroll
- [ ] Tab show/hide on scroll
- [ ] Add-to-cart animation
- [ ] Offline queue logic

**Goal:** WineYard pilot with 10 integrators

---

### Phase 2: Polish & Configurability (Weeks 4-8)

**Enhancements:**
- [ ] Image carousel with zoom
- [ ] Ratings & reviews display
- [ ] Brand product listing screen
- [ ] Notification form (Out-of-stock alerts)
- [ ] Order detail screen
- [ ] Reorder confirmation flow

**Modules (Configurable):**
- [ ] Discount badges (promotions)
- [ ] Category grouping with "+X more"
- [ ] Multi-warehouse routing (basic)

**Goal:** Expand to 100+ WineYard integrators, onboard 1 new distributor

---

### Phase 3: Industry Expansion (Weeks 9-16)

**Advanced Features:**
- [ ] Batch/expiry tracking (pharma)
- [ ] Unit selector (kg, L, pcs)
- [ ] Custom attribute fields
- [ ] Credit balance display
- [ ] Loyalty tier badges

**Goal:** Onboard distributors in FMCG, pharma, industrial supplies

---

## Design System Governance

**Version Control:** Semantic versioning (MAJOR.MINOR.PATCH)

**Current Version:** 2.0.0

**Change Log:**
- **2.0.0 (March 2026):** Major redesign — Product Detail screen added, scroll behaviors defined, navigation restructured, product cards redesigned, Blinkit/Instamart patterns adopted
- **1.0.0 (March 2026):** Initial release

**Maintenance:**
- Design review: Bi-weekly
- Component updates: As needed
- Major versions: Quarterly

---

## Success Metrics (Post-Launch)

### Buyer Metrics
- Time to first quotation: <60 seconds (target)
- Repeat purchase rate: 60%+ from Buy Again tab
- Cart abandonment rate: <30%
- Product Detail → Add to Cart conversion: 40%+
- Average order value (AOV): Increase 15% YoY

### UX Metrics
- Scroll engagement: 80%+ users scroll past fold on Home
- Category expansion rate: 50%+ users expand "+X more"
- Recommendation clicks: 20%+ tap "People Also Bought"
- Offline usage: 40%+ of sessions include offline actions

### Platform Metrics
- Mobile-first usage: 90%+ on mobile devices
- Screen transition smoothness: <5% frame drops
- Add-to-cart animation completion: 98%+ (no lag)

---

**End of TraderOps Design System v2.0**

---

## Appendix: Figma Component Library Checklist

**Screens (Mobile 375px width):**
- [ ] Home (full header state)
- [ ] Home (collapsed header state)
- [ ] Product Detail (all sections)
- [ ] Cart
- [ ] Buy Again tab
- [ ] Categories tab
- [ ] Orders tab
- [ ] Account (user profile)

**Components:**
- [ ] Product card (default, in-cart, out-of-stock states)
- [ ] Bottom sticky cart (1 item, 3 items, 8+ items)
- [ ] Search bar (empty, active, with results)
- [ ] Category filter chips (active, inactive)
- [ ] Offline banner (offline, syncing, synced)
- [ ] Hero image carousel (with dots)
- [ ] Variant selector grid (2-4 variants)
- [ ] Recommendation section (horizontal scroll)
- [ ] Order card (delivered, pending)
- [ ] Sticky footer (no variant, with variants)

**States:**
- [ ] All interactive elements: default, hover, pressed, disabled, focus
- [ ] Dark mode (future consideration)

**Responsive Variants:**
- [ ] Mobile (375px)
- [ ] Tablet (768px)
- [ ] Desktop (1440px)

**Developer Handoff:**
- [ ] All spacing annotated (8px grid)
- [ ] All colors mapped to design tokens
- [ ] All typography mapped to type scale
- [ ] All interactions documented (tap targets, transitions)
- [ ] Accessibility notes per component

---

**For Quick Reference:** See `TraderOps_Quick_Reference_v2.md`
