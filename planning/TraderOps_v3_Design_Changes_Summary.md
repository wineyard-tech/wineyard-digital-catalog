# TraderOps Design System v3 - Change Summary
**March 2026 | Final Version**

This document summarizes the key changes from v2 to v3 based on user feedback and prototype refinements.

---

## Key Changes from v2 to v3

### 1. **View Cart Button** - Improved Spacing
**Change:** Increased thumbnail overlap to prevent "View Cart" label wrapping to 2 lines
- **Before:** Thumbnails overlap at -8px
- **After:** Thumbnails overlap at -12px (3 thumbnails now -space-x-3 in Tailwind)
- **Min width:** 200px for View Cart button to ensure single-line label
- **Border radius:** Consistent 12px rounded-xl (same as other cards)

### 2. **Product Card Add Buttons** - Visual Consistency
**Change:** Replaced circular + button with rounded rectangular outline button
- **Empty state:** 32px × 32px rounded-md button with outline border
  - Border: 2px solid #059669 (emerald green)
  - Background: transparent
  - Icon: + in #059669
- **Selected state:** Filled rounded-md button with - [qty] +
  - Background: #059669
  - Text: white
  - Same 32px height, auto width
- **Position:** Moved further into thumbnail (bottom-2 right-2) to avoid text overlap
- **Border radius:** 8px (rounded-md) for buttons — consistent with cart button

### 3. **Badges (Discount / Out of Stock)** - Top Alignment
**Change:** Badges are now top-aligned to product thumbnail with contextual backgrounds
- **Position:** top-0, centered horizontally on thumbnail
- **Shape:** Rounded bottom corners only (rounded-b-md)
- **Discount badge:**
  - Background: #059669 (emerald green)
  - Text: white, bold, "15% OFF" format
- **Out of Stock badge:**
  - Background: #64748B (slate gray)
  - Text: white, bold, "Out of Stock"

### 4. **Status Banners** - Conditional Display
**Change:** Only show status banner when app is offline
- **Online state:** No banner displayed
- **Offline state:** Show amber banner with wifi-off icon
  - Background: #FFFBEB (pale amber)
  - Border: #FDE68A
  - Icon: lucide wifi-off
  - Text: "Offline • Changes will sync when online"

### 5. **Cart Item Cards** - Simplified Layout
**Changes:**
1. **Removed "Subtotal:" label** — just show amount (₹5,600)
2. **Quantity selector moved top-right** — aligned with product name row
3. **Removed unit price** — only show final subtotal
4. **Trash icon moved up** — top-right corner next to quantity
5. **Layout:** Name/detail on left, quantity + trash on right, subtotal bottom-right

### 6. **Cart Footer** - Comprehensive Bill Summary
**New sections added:**
1. **Bill Details** section (pale blue background #F8FAFB):
   - Item total (X items): ₹56,680
   - Transport charges: ₹150
   - Divider line
   - To Pay: ₹56,830 (bold, larger)

2. **Delivery Location** section:
   - Icon: map-pin (lucide)
   - Primary text: "Delivery to [Location]"
   - Secondary text: "From WineYard Outlet, [Area] • Est. 45 mins"

3. **Dual CTAs:**
   - **Secondary (outline):** WhatsApp Quote
     - Border: 2px solid #059669
     - Background: white
     - Text/icon: #059669
     - Icon: message-circle (lucide)
   - **Primary (filled):** Place Order
     - Background: #059669
     - Text/icon: white
     - Icon: arrow-right (lucide)

4. **Footer note:** "X items • Share quote or place order directly"

### 7. **Lucide Icons** - Complete Migration
**Change:** Replace all emoji/text icons with Lucide icons
- **Icons library:** `https://unpkg.com/lucide@latest`
- **Implementation:** Call `lucide.createIcons()` after each React render

**Icon mapping:**
- Home: `home`
- Buy Again: `refresh-cw`
- Categories: `package`
- Orders: `clipboard-list`
- Search: `search`
- User/Account: `user`
- Location: `map-pin`
- Back arrow: `arrow-left`
- Right arrow / Next: `chevron-right` or `arrow-right`
- Share: `share-2`
- Star (rating): `star` (with fill-current class)
- Notification: `bell`
- Trash/Delete: `trash-2`
- WhatsApp: `message-circle`
- Offline: `wifi-off`
- Building/Brand: `building-2`
- Plus: `plus`
- Chevron down/up: `chevron-down`, `chevron-up`

---

## Updated Component Specifications

### Product Card (Catalog View)
```
┌─────────────────────────┐
│   [15% OFF]            │ ← Top-aligned badge (rounded-b-md)
│                         │
│      🎥 Image          │
│    (120px height)      │ ← 40% smaller than v2
│                    [+] │ ← Rounded-md outline button
└─────────────────────────┘   (bottom-2 right-2, moved into thumbnail)
  Product Name (truncate)
  2MP • 20m IR
  ₹1,200  ₹1,500
```

### View Cart Button (Floating)
```
┌────────────────────────────┐
│ 🎥📹🔗  View Cart      →  │ ← min-w-[200px], -space-x-3 thumbnails
│         3 items           │   rounded-xl (12px)
└────────────────────────────┘
```

### Cart Item Card (v3)
```
┌─────────────────────────────────────┐
│ 🎥  Product Name    [- 2 +]  🗑️    │ ← Quantity + trash top-right
│     2MP • 20m IR                    │
│                          ₹5,600     │ ← Subtotal bottom-right (no label)
└─────────────────────────────────────┘
```

### Cart Footer (v3)
```
┌─────────────────────────────────────┐
│ Bill Details                         │
│ Item total (49 items)    ₹56,680    │
│ Transport charges            ₹150    │
│ ──────────────────────────────────   │
│ To Pay                    ₹56,830    │ ← Bold, larger
├─────────────────────────────────────┤
│ 📍 Delivery to Himayatnagar         │
│    From WineYard Outlet • Est. 45m  │
├─────────────────────────────────────┤
│ [💬 WhatsApp Quote] [Place Order →] │ ← Dual CTAs
│                                      │
│ 49 items • Share or place directly  │
└─────────────────────────────────────┘
```

---

## Color Palette (v3 - No Changes from v2)

**Primary Colors:**
- Trust blue: `#0066CC` (navigation, links)
- CTA green: `#059669` (Add to Cart, Place Order)
- Background: `#F8FAFB` (near-white, warm)
- Surface: `#FFFFFF` (cards)

**Text Hierarchy:**
- Primary: `#0F172A` (headings)
- Secondary: `#334155` (body)
- Tertiary: `#64748B` (labels)

**Semantic Colors:**
- Success green: `#059669` / bg `#ECFDF5`
- Warning amber: `#D97706` / bg `#FFFBEB`
- Error red: `#DC2626`
- Disabled gray: `#64748B`

**Borders & Dividers:**
- Default: `#E2E8F0`
- Subtle: `#F1F5F9`

---

## Typography (v3 - No Changes from v2)

**Font Stack:**
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif;
```

**Size Scale:**
- H1 (Page title): 18-20px, bold
- H2 (Section): 16px, semi-bold
- Body text: 14px, regular
- Small text: 12px, regular
- Tiny/labels: 10-11px, medium

---

## Spacing (8px Grid - No Changes from v2)

- Card padding: 12-16px
- Between cards: 12px
- Section margins: 24px
- Button height: 40-44px (10-11px = 40px, 11-12px = 44px)
- Touch targets: min 44px × 44px

---

## Border Radius (v3 - Standardized)

- Cards: 12px (rounded-xl)
- Buttons: 8px (rounded-md for rect) or 9999px (rounded-full for pills)
- Images in cards: 12px (rounded-xl for top, rounded-t-xl)
- Badges: rounded-b-md (bottom corners only)
- Input fields: 9999px (rounded-full for search)

---

## Shadows (v3 - No Changes from v2)

**Card Shadow (default):**
```css
box-shadow: 0 2px 8px rgba(0,0,0,0.08);
```

**Card Shadow (hover):**
```css
box-shadow: 0 4px 12px rgba(0,0,0,0.12);
```

**Floating elements (cart button, sticky footer):**
```css
box-shadow: 0 -4px 12px rgba(0,0,0,0.08);
```

---

## Implementation Notes

### React + Tailwind
- Use Lucide React: `npm install lucide-react`
- Call `lucide.createIcons()` in `useEffect` after state changes
- Use CSS variables for theme tokens

### React Native
- Use `react-native-lucide` for icons
- Implement color tokens via StyleSheet or theme provider
- Border radius uses px values (not dp)

### Flutter
- Use `lucide_icons_flutter` package
- Define theme in MaterialApp
- Border radius uses `BorderRadius.circular()`

---

## Breaking Changes from v2

1. **Icon system:** Emoji → Lucide icons (requires package installation)
2. **Cart footer:** Simple total bar → comprehensive bill details section
3. **Product card buttons:** Circular → rounded rectangle (visual only, no behavior change)
4. **Status banner:** Always visible → conditional (offline only)
5. **Cart item layout:** Unit price removed, quantity repositioned

---

## Next Steps

1. **Test v3 prototypes** in browser (375px/390px mobile view)
2. **Review Design System v3** document for completeness
3. **Begin React Native implementation** using v3 specs
4. **Pilot with 10 WineYard integrators** for validation

---

**Document Status:** Draft v3 Changes Summary  
**Approval Required:** User to review before full Design System v3 update  
**Next:** Update full TraderOps_Design_System_v3.md and TraderOps_Quick_Reference_v3.md

