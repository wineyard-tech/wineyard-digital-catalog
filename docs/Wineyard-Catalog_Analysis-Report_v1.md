# Wine Yard Technologies — Product Association & Recommendation Analysis

**Date:** 2026-03-23  
**Data Sources:** Invoice.csv (6,672 invoices, 19,169 line items) + Estimate.csv (1,772 estimates, 15,246 line items)  
**Period:** February 2026 (1 month)  
**Unique Products:** ~306 SKUs across 22 categories, 9 brands  
**Unique Customers:** 1,837 (invoiced) | 861 repeat buyers (47%)

---

## 1. Executive Summary

Your data reveals strong, actionable purchasing patterns across CCTV installation kits. Customers overwhelmingly buy in **project bundles** — cameras + DVR/NVR + storage + cabling + mounting accessories. This creates a massive opportunity to move from a flat catalog to an intelligent, context-aware shopping experience.

**Key findings:**

- **55% of invoices are multi-item** (avg 2.9 items/invoice), and **95% of estimates are multi-item** (avg 8.6 items/estimate) — strong co-purchase signal.
- **3 clear system archetypes** dominate purchases: HD Analog (Camera + DVR + HDD + BNC/DC wires), IP Network (IP Camera + NVR + PoE Switch + CAT cable), and WiFi standalone (WiFi Camera + Memory Card).
- **47% of customers are repeat buyers** — strong signal for "Buy Again" and personalized recommendations.
- **Accessories (PVC boxes, wires, connectors, nail clips) appear in nearly every order** — these are prime candidates for auto-suggest and bundle upsells.

---

## 2. Frequently Bought Together (Co-Purchase Pairs)

These are the strongest item pairs that appear together in the same invoice/estimate. Ranked by **lift** (how much more likely they are to co-occur vs. random chance). Only pairs with 50+ co-occurrences shown for reliability.

### SKU-Level — Top 30 Pairs

| Rank | Item A | Item B | Co-occurrences | Lift | Confidence A→B | Confidence B→A |
|------|--------|--------|---------------|------|---------------|----------------|
| 1 | Installation Charges | NVR / DVR Configuration with Mobile App Integration | 114 | 59.9 | 81% | 100% |
| 2 | BNC Wire CP Plus | DC Wire CP Plus | 150 | 41.4 | 79% | 94% |
| 3 | 5mp iLLUMAX Bullet Camera CP Plus | 5mp iLLUMAX Dome Camera CP Plus | 82 | 41.2 | 51% | 78% |
| 4 | 2mp IP Bullet STQC CP Plus IR 30m | 2mp IP Dome STQC CP Plus IR 30m | 51 | 37.3 | 65% | 34% |
| 5 | 5mp iLLUMAX Bullet Camera CP Plus | 8 Ch DVR – 5mp CP Plus | 66 | 34.5 | 41% | 65% |
| 6 | 2.4mp Guard +  Audio Dome Camera CP Plus | 2.4mp Guard + Audio Bullet Camera CP PLUS | 95 | 26.3 | 67% | 44% |
| 7 | DC Wire CP Plus | LAN Cable 2m | 58 | 22.3 | 36% | 42% |
| 8 | 32-Ch NVR 2-SATA CP Plus | 8TB Hard Disk | 76 | 21.0 | 35% | 54% |
| 9 | 5X5 PVC Box Premium | NVR / DVR Configuration with Mobile App Integration | 65 | 20.7 | 28% | 57% |
| 10 | 2.4mp V3 Bullet Camera CP Plus | 2.4mp V3 Dome Camera CP Plus | 83 | 20.6 | 39% | 52% |
| 11 | Monitor 19 inch HDMI & VGA | Monitor wall mount adjustable Mini | 112 | 19.6 | 46% | 56% |
| 12 | BNC Wire CP Plus | LAN Cable 2m | 60 | 19.4 | 31% | 44% |
| 13 | 5X5 PVC Box Premium | Installation Charges | 72 | 18.5 | 31% | 51% |
| 14 | 4mp IP iLLUMAX Bullet STQC CP Plus | 4mp IP iLLUMAX Dome STQC CP Plus | 188 | 17.4 | 48% | 80% |
| 15 | 4 Port PoE Switch 10/100 CP Plus | 4-Ch NVR CP Plus | 161 | 17.2 | 42% | 77% |
| 16 | 10mm Nail Clips | 12mm Nail Clips | 67 | 16.0 | 36% | 35% |
| 17 | NVR / DVR Configuration with Mobile App Integration | RJ45 Clips Loose | 104 | 15.6 | 91% | 21% |
| 18 | 10mm Nail Clips | 6mm Nail Clips | 155 | 15.0 | 84% | 33% |
| 19 | 6mm Nail Clips | 8mm Nail Clips | 63 | 14.4 | 13% | 81% |
| 20 | 16 PORT POE SWITCH TWO GIGA UPLINKS CP PLUS | 16-Ch NVR 1-SATA CP Plus | 51 | 14.2 | 56% | 15% |
| 21 | 12mm Nail Clips | 6mm Nail Clips | 152 | 14.1 | 79% | 32% |
| 22 | Installation Charges | RJ45 Clips Loose | 114 | 13.8 | 81% | 23% |
| 23 | BNC Wire Ultra Premium | DC Wire Ultra Premium | 373 | 13.3 | 78% | 75% |
| 24 | 5X5 PVC Box Premium | RJ45 Clips Loose | 169 | 12.4 | 73% | 34% |
| 25 | 2-Pin Power Cord | 5A SMPS Metal Body CP Plus | 146 | 12.2 | 28% | 74% |
| 26 | 2mp IP Bullet iLLUMAX STQC CP Plus | 2mp IP iLLUMAX Dome STQC CP Plus | 264 | 12.1 | 52% | 72% |
| 27 | 2-Pin Power Cord | 5A SMPS CP Plus | 79 | 11.6 | 15% | 71% |
| 28 | 2-Pin Power Cord | DC Wire CP Plus | 110 | 11.3 | 21% | 69% |
| 29 | 10A SMPS Metal Body CP Plus | 2-Pin Power Cord | 214 | 10.8 | 65% | 42% |
| 30 | 2-Pin Power Cord | LAN Cable 2m | 86 | 10.3 | 17% | 63% |

**How to read this:** Lift > 1 means items are bought together more than chance. Lift of 41.2 for BNC Wire CP Plus → DC Wire CP Plus means customers are **41x more likely** to buy these together than separately.

**Implementation note:** For the "Frequently Bought Together" widget, use pairs with lift > 3 AND co-occurrences > 50. This gives ~30 high-confidence pairs. For lower-volume items, fall back to category-level rules.

### Category-Level — All Significant Pairs

| Category A | Category B | Co-occurrences | Lift | Confidence A→B | Confidence B→A |
|------------|------------|---------------|------|---------------|----------------|
| Fiber Optic Products | Metal Racks | 11 | 19.53 | 9% | 27% |
| Memory Card | Solar Camera | 139 | 7.05 | 20% | 58% |
| Memory Card | WiFi Camera | 323 | 6.50 | 47% | 53% |
| 4G SIM Camera | Memory Card | 60 | 5.73 | 47% | 9% |
| Fiber Optic Products | Routers & Network Switch | 20 | 5.39 | 17% | 7% |
| NVR | PoE Switch | 1025 | 5.11 | 84% | 74% |
| IP Camera | NVR | 1039 | 5.07 | 73% | 85% |
| IP Camera | PoE Switch | 1045 | 4.51 | 74% | 76% |
| Metal Racks | PoE Switch | 26 | 3.87 | 63% | 2% |
| DVR | HD Camera | 1214 | 3.59 | 85% | 60% |
| DVR | SMPS | 998 | 3.58 | 70% | 60% |
| Metal Racks | NVR | 21 | 3.53 | 51% | 2% |
| Fiber Optic Products | PoE Switch | 63 | 3.32 | 54% | 5% |
| IP Camera | Metal Racks | 22 | 3.20 | 2% | 54% |
| Fiber Optic Products | NVR | 51 | 3.03 | 44% | 4% |
| Fiber Optic Products | IP Camera | 55 | 2.83 | 47% | 4% |
| HD Camera | SMPS | 1092 | 2.77 | 54% | 66% |
| Hard Disk | NVR | 885 | 2.75 | 40% | 72% |
| Metal Stands & Fixtures | Monitors | 221 | 2.62 | 10% | 72% |
| DVR | Hard Disk | 902 | 2.42 | 64% | 41% |
| General | Tools | 63 | 2.41 | 5% | 34% |
| Hard Disk | PoE Switch | 854 | 2.35 | 39% | 62% |
| Metal Stands & Fixtures | NVR | 789 | 2.34 | 34% | 64% |
| Metal Racks | Routers & Network Switch | 3 | 2.29 | 7% | 1% |
| Hard Disk | IP Camera | 848 | 2.28 | 38% | 60% |

**Key category bundles (lift > 3):**

- **IP System:** IP Camera ↔ NVR ↔ PoE Switch (lift 4.5–5.1) — near-certain co-purchase
- **WiFi System:** WiFi Camera ↔ Memory Card (lift 6.5) — standalone bundle
- **Solar System:** Solar Camera ↔ Memory Card (lift 7.1)
- **HD Analog System:** DVR ↔ HD Camera ↔ SMPS (lift 3.6)
- **Fiber Optic:** all fiber items cluster tightly (lift 5–20)

---

## 3. System Bundles (Multi-Item Archetypes)

Based on the association data, here are the **3 dominant system bundles** that should be surfaced as curated kits or "Complete System" suggestions:

### Bundle 1: HD Analog CCTV System (most popular)

| Component Role | Typical Product | Category |
|---------------|-----------------|----------|
| Cameras | 2.4mp ILLUMAX Bullet/Dome CP Plus | HD Camera |
| Recorder | 4-Ch / 8-Ch DVR IC 2.4mp CP Plus | DVR |
| Storage | 500GB / 1TB Hard Disk | Hard Disk |
| Cabling | BNC Wire Premium + DC Wire Premium | Connectors |
| Cable (alt) | 3+1 CCTV Cable GENERIC / CP Plus | Cables |
| Mounting | 4X4 PVC Box + 6mm Nail Clips | PVC Accessories |
| Rack | 2U Mini Rack | Metal Stands & Fixtures |
| Power | 4-Ch / 8-Ch SMPS Generic | SMPS |
| Power Cord | 2-Pin Power Cord | Connectors |
| Misc | Insulation Tape | General |

### Bundle 2: IP Network CCTV System

| Component Role | Typical Product | Category |
|---------------|-----------------|----------|
| Cameras | 2mp/4mp IP Bullet/Dome STQC CP Plus | IP Camera |
| Recorder | 8-Ch NVR CP Plus | NVR |
| Network | 8 Port PoE Switch CP Plus | PoE Switch |
| Storage | 1TB / 2TB Hard Disk | Hard Disk |
| Cabling | CAT6 Cable 305m + RJ45 Connectors | Cables + Connectors |
| Mounting | 5X5 PVC Box | PVC Accessories |
| Rack | 4U Mini Rack | Metal Stands & Fixtures |

### Bundle 3: WiFi / Solar Standalone

| Component Role | Typical Product | Category |
|---------------|-----------------|----------|
| Camera | CP-Z45Q 4mp WiFi PT Camera / Solar Camera | WiFi Camera / Solar Camera |
| Storage | 64GB Memory Card CP Plus | Memory Card |

---

## 4. Bestsellers

### By Order Frequency (appears in most invoices)

| Rank | Product | Category | Orders | Qty Sold | Revenue (₹) |
|------|---------|----------|--------|----------|-------------|
| 1 | 5X5 PVC Box | PVC Accessories | 738 | 5840 | 126,359 |
| 2 | BNC Wire Premium | Connectors | 650 | 8523 | 105,327 |
| 3 | 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 630 | 1715 | 1,703,924 |
| 4 | 4X4 PVC Box | PVC Accessories | 624 | 3092 | 47,189 |
| 5 | DC Wire Premium | Connectors | 613 | 4573 | 39,200 |
| 6 | 4U Mini Rack | Metal Stands & Fixtures | 516 | 637 | 297,073 |
| 7 | 64GB Memory Card CP Plus CP-NM64 / UM64C | Memory Card | 443 | 722 | 484,593 |
| 8 | Insulation Tape | General | 414 | 893 | 8,684 |
| 9 | 500GB Hard Disk | Hard Disk | 392 | 522 | 893,184 |
| 10 | 2.4mp illumax Dome Camera CP Plus | HD Camera | 379 | 1006 | 952,342 |
| 11 | 4-Ch DVR - IC 2.4mp CP Plus | DVR | 351 | 383 | 754,458 |
| 12 | 6mm Nail Clips | PVC Accessories | 344 | 541 | 14,095 |
| 13 | BNC Wire Ultra Premium | Connectors | 338 | 4030 | 65,349 |
| 14 | 3+1 CCTV Cable GENERIC | Cables | 336 | 498 | 323,169 |
| 15 | DC Wire Ultra Premium | Connectors | 325 | 2350 | 25,192 |
| 16 | 8 Port PoE Switch CP Plus | PoE Switch | 308 | 426 | 536,997 |
| 17 | 2U Mini Rack | Metal Stands & Fixtures | 295 | 368 | 138,046 |
| 18 | 1TB Hard Disk | Hard Disk | 283 | 340 | 1,491,429 |
| 19 | 4-Ch SMPS Generic | SMPS | 282 | 312 | 88,583 |
| 20 | 8-Ch DVR - IC 2.4mp CP Plus | DVR | 275 | 302 | 868,262 |
| 21 | 8-Ch SMPS Generic | SMPS | 258 | 301 | 110,247 |
| 22 | 3+1 Cable 90m CP Plus | Cables | 251 | 320 | 340,142 |
| 23 | 2-Pin Power Cord | Connectors | 233 | 247 | 7,930 |
| 24 | Video BALUN 5mp | Connectors | 209 | 1091 | 63,904 |
| 25 | RJ45 Connectors Box D-LINK | Connectors | 207 | 279 | 88,987 |

### By Revenue

| Rank | Product | Category | Revenue (₹) | Orders |
|------|---------|----------|-------------|--------|
| 1 | 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 1,703,924 | 630 |
| 2 | 4G Solar Linkage camera ( DEFENDER DUO SOLARIS) Secureye | Solar Camera | 1,568,399 | 158 |
| 3 | 1TB Hard Disk | Hard Disk | 1,491,429 | 283 |
| 4 | 2mp IP Bullet iLLUMAX STQC CP Plus | IP Camera | 1,283,633 | 143 |
| 5 | 4mp IP iLLUMAX Bullet STQC CP Plus | IP Camera | 1,206,307 | 92 |
| 6 | 2TB Hard Disk | Hard Disk | 1,181,028 | 198 |
| 7 | 2.4mp illumax Dome Camera CP Plus | HD Camera | 952,342 | 379 |
| 8 | 2mp IP iLLUMAX Dome STQC CP Plus | IP Camera | 930,892 | 113 |
| 9 | 500GB Hard Disk | Hard Disk | 893,184 | 392 |
| 10 | 4TB Hard Disk | Hard Disk | 876,951 | 85 |
| 11 | 4mp IP iLLUMAX Dome STQC CP Plus | IP Camera | 874,114 | 59 |
| 12 | 8-Ch DVR - IC 2.4mp CP Plus | DVR | 868,262 | 275 |
| 13 | 4mp IP Dome Camera Audio iLLUMAX CP Plus STQC | IP Camera | 822,907 | 38 |
| 14 | 4mp IP Dome STQC CP Plus IR 30m | IP Camera | 798,177 | 17 |
| 15 | 8TB Hard Disk | Hard Disk | 797,765 | 25 |

**Implementation:** Surface top-20 bestsellers on the homepage. For logged-in users, filter out items they've already bought recently and show the next-best.

---

## 5. Buy Again (Repeat Purchase Items)

Items that the same customer purchases across multiple orders. These are consumables and project staples.

| Rank | Product | Category | Repeat Purchases | Unique Customers Repeating | Repeat Rate |
|------|---------|----------|-----------------|---------------------------|-------------|
| 1 | 5X5 PVC Box | PVC Accessories | 337 | 123 | 31% |
| 2 | 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 304 | 118 | 36% |
| 3 | BNC Wire Premium | Connectors | 294 | 120 | 34% |
| 4 | 4X4 PVC Box | PVC Accessories | 262 | 118 | 33% |
| 5 | DC Wire Premium | Connectors | 260 | 116 | 33% |
| 6 | 4U Mini Rack | Metal Stands & Fixtures | 179 | 83 | 25% |
| 7 | 2.4mp illumax Dome Camera CP Plus | HD Camera | 156 | 77 | 35% |
| 8 | Insulation Tape | General | 153 | 78 | 30% |
| 9 | 500GB Hard Disk | Hard Disk | 142 | 70 | 28% |
| 10 | BNC Wire Ultra Premium | Connectors | 140 | 57 | 29% |
| 11 | 3+1 CCTV Cable GENERIC | Cables | 132 | 63 | 31% |
| 12 | 64GB Memory Card CP Plus CP-NM64 / UM64C | Memory Card | 124 | 65 | 20% |
| 13 | DC Wire Ultra Premium | Connectors | 120 | 51 | 25% |
| 14 | 6mm Nail Clips | PVC Accessories | 115 | 58 | 25% |
| 15 | 4-Ch DVR - IC 2.4mp CP Plus | DVR | 110 | 65 | 27% |
| 16 | 8 Port PoE Switch CP Plus | PoE Switch | 97 | 60 | 28% |
| 17 | 2U Mini Rack | Metal Stands & Fixtures | 94 | 58 | 29% |
| 18 | 1TB Hard Disk | Hard Disk | 87 | 43 | 22% |
| 19 | 3+1 Cable 90m CP Plus | Cables | 80 | 39 | 23% |
| 20 | 8-Ch DVR - IC 2.4mp CP Plus | DVR | 79 | 54 | 28% |

**Implementation:** For logged-in users, show "Buy Again" carousel with items they've purchased before, sorted by recency of last purchase. Prioritize items with high repeat rates (>25%) as they're likely consumables needed for every project.

---

## 6. People Also Buy (Customer-Level Cross-Selling)

For each top product, what else do customers who bought it also purchase (across all their orders, not just the same order). This powers the "People who bought X also bought..." widget.

### 5X5 PVC Box (PVC Accessories)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| 4U Mini Rack | Metal Stands & Fixtures | 175 |
| 8 Port PoE Switch CP Plus | PoE Switch | 144 |
| DC Wire Premium | Connectors | 143 |
| BNC Wire Premium | Connectors | 122 |
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 119 |
| 4X4 PVC Box | PVC Accessories | 117 |
| 6mm Nail Clips | PVC Accessories | 103 |
| 64GB Memory Card CP Plus CP-NM64 / UM64C | Memory Card | 101 |

### BNC Wire Premium (Connectors)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| DC Wire Premium | Connectors | 279 |
| 4X4 PVC Box | PVC Accessories | 181 |
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 160 |
| Insulation Tape | General | 129 |
| 500GB Hard Disk | Hard Disk | 127 |
| 4U Mini Rack | Metal Stands & Fixtures | 124 |
| 4-Ch DVR - IC 2.4mp CP Plus | DVR | 123 |
| 5X5 PVC Box | PVC Accessories | 122 |

### 2.4mp ILLUMAX Bullet Camera CP Plus (HD Camera)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| 4X4 PVC Box | PVC Accessories | 200 |
| 2.4mp illumax Dome Camera CP Plus | HD Camera | 181 |
| DC Wire Premium | Connectors | 170 |
| 4-Ch DVR - IC 2.4mp CP Plus | DVR | 168 |
| BNC Wire Premium | Connectors | 160 |
| 500GB Hard Disk | Hard Disk | 146 |
| 4U Mini Rack | Metal Stands & Fixtures | 142 |
| 8-Ch DVR - IC 2.4mp CP Plus | DVR | 134 |

### 4X4 PVC Box (PVC Accessories)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 200 |
| DC Wire Premium | Connectors | 192 |
| BNC Wire Premium | Connectors | 181 |
| 4U Mini Rack | Metal Stands & Fixtures | 147 |
| 2.4mp illumax Dome Camera CP Plus | HD Camera | 141 |
| 4-Ch DVR - IC 2.4mp CP Plus | DVR | 141 |
| 500GB Hard Disk | Hard Disk | 134 |
| 2U Mini Rack | Metal Stands & Fixtures | 126 |

### DC Wire Premium (Connectors)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| BNC Wire Premium | Connectors | 279 |
| 4X4 PVC Box | PVC Accessories | 192 |
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 170 |
| 5X5 PVC Box | PVC Accessories | 143 |
| Insulation Tape | General | 137 |
| 4U Mini Rack | Metal Stands & Fixtures | 136 |
| 4-Ch DVR - IC 2.4mp CP Plus | DVR | 130 |
| 2.4mp illumax Dome Camera CP Plus | HD Camera | 127 |

### 4U Mini Rack (Metal Stands & Fixtures)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| 5X5 PVC Box | PVC Accessories | 175 |
| 4X4 PVC Box | PVC Accessories | 147 |
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 142 |
| DC Wire Premium | Connectors | 136 |
| 8 Port PoE Switch CP Plus | PoE Switch | 126 |
| BNC Wire Premium | Connectors | 124 |
| 6mm Nail Clips | PVC Accessories | 114 |
| 8-Ch DVR - IC 2.4mp CP Plus | DVR | 112 |

### 64GB Memory Card CP Plus CP-NM64 / UM64C (Memory Card)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| 5X5 PVC Box | PVC Accessories | 101 |
| 4X4 PVC Box | PVC Accessories | 95 |
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 94 |
| DC Wire Premium | Connectors | 93 |
| BNC Wire Premium | Connectors | 88 |
| 4U Mini Rack | Metal Stands & Fixtures | 82 |
| 4-Ch DVR - IC 2.4mp CP Plus | DVR | 78 |
| 2.4mp illumax Dome Camera CP Plus | HD Camera | 70 |

### Insulation Tape (General)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| DC Wire Premium | Connectors | 137 |
| BNC Wire Premium | Connectors | 129 |
| 6mm Nail Clips | PVC Accessories | 126 |
| 4X4 PVC Box | PVC Accessories | 122 |
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 117 |
| 4U Mini Rack | Metal Stands & Fixtures | 107 |
| 5X5 PVC Box | PVC Accessories | 99 |
| 4-Ch DVR - IC 2.4mp CP Plus | DVR | 89 |

### 500GB Hard Disk (Hard Disk)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| 4-Ch DVR - IC 2.4mp CP Plus | DVR | 147 |
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 146 |
| 4X4 PVC Box | PVC Accessories | 134 |
| BNC Wire Premium | Connectors | 127 |
| DC Wire Premium | Connectors | 123 |
| 2U Mini Rack | Metal Stands & Fixtures | 113 |
| 4-Ch SMPS Generic | SMPS | 108 |
| 4U Mini Rack | Metal Stands & Fixtures | 108 |

### 2.4mp illumax Dome Camera CP Plus (HD Camera)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 181 |
| 4X4 PVC Box | PVC Accessories | 141 |
| 4-Ch DVR - IC 2.4mp CP Plus | DVR | 133 |
| DC Wire Premium | Connectors | 127 |
| BNC Wire Premium | Connectors | 119 |
| 500GB Hard Disk | Hard Disk | 107 |
| 8-Ch DVR - IC 2.4mp CP Plus | DVR | 105 |
| 4-Ch SMPS Generic | SMPS | 104 |

### 4-Ch DVR - IC 2.4mp CP Plus (DVR)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 168 |
| 500GB Hard Disk | Hard Disk | 147 |
| 4X4 PVC Box | PVC Accessories | 141 |
| 2.4mp illumax Dome Camera CP Plus | HD Camera | 133 |
| 4-Ch SMPS Generic | SMPS | 130 |
| DC Wire Premium | Connectors | 130 |
| 2U Mini Rack | Metal Stands & Fixtures | 125 |
| BNC Wire Premium | Connectors | 123 |

### 6mm Nail Clips (PVC Accessories)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| Insulation Tape | General | 126 |
| 4U Mini Rack | Metal Stands & Fixtures | 114 |
| 4X4 PVC Box | PVC Accessories | 113 |
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 113 |
| DC Wire Premium | Connectors | 113 |
| BNC Wire Premium | Connectors | 112 |
| 5X5 PVC Box | PVC Accessories | 103 |
| 500GB Hard Disk | Hard Disk | 96 |

### BNC Wire Ultra Premium (Connectors)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| DC Wire Ultra Premium | Connectors | 158 |
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 99 |
| 4X4 PVC Box | PVC Accessories | 90 |
| 4U Mini Rack | Metal Stands & Fixtures | 78 |
| Insulation Tape | General | 75 |
| 2.4mp illumax Dome Camera CP Plus | HD Camera | 74 |
| 4-Ch DVR - IC 2.4mp CP Plus | DVR | 70 |
| 500GB Hard Disk | Hard Disk | 68 |

### 3+1 CCTV Cable GENERIC (Cables)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| 4X4 PVC Box | PVC Accessories | 123 |
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 119 |
| BNC Wire Premium | Connectors | 111 |
| DC Wire Premium | Connectors | 110 |
| 2.4mp illumax Dome Camera CP Plus | HD Camera | 92 |
| 4-Ch DVR - IC 2.4mp CP Plus | DVR | 87 |
| 500GB Hard Disk | Hard Disk | 85 |
| 4U Mini Rack | Metal Stands & Fixtures | 84 |

### DC Wire Ultra Premium (Connectors)

| Also Bought | Category | Customers |
|-------------|----------|-----------|
| BNC Wire Ultra Premium | Connectors | 158 |
| 2.4mp ILLUMAX Bullet Camera CP Plus | HD Camera | 108 |
| 4X4 PVC Box | PVC Accessories | 94 |
| 4U Mini Rack | Metal Stands & Fixtures | 83 |
| Insulation Tape | General | 80 |
| 500GB Hard Disk | Hard Disk | 79 |
| 4X4 PVC Box Premium | PVC Accessories | 77 |
| 2-Pin Power Cord | Connectors | 76 |

---

## 7. Same Category Recommendations

Within each category, these are the top items by order frequency. Use these to power "More from this category" or "Similar items" widgets.

### Connectors (3634 total orders)

| Product | Orders |
|---------|--------|
| BNC Wire Premium | 650 |
| DC Wire Premium | 613 |
| BNC Wire Ultra Premium | 338 |
| DC Wire Ultra Premium | 325 |
| 2-Pin Power Cord | 233 |
| Video BALUN 5mp | 209 |
| RJ45 Connectors Box D-LINK | 207 |
| RJ45 Clips Loose | 153 |

### PVC Accessories (2633 total orders)

| Product | Orders |
|---------|--------|
| 5X5 PVC Box | 738 |
| 4X4 PVC Box | 624 |
| 6mm Nail Clips | 344 |
| 4X4 PVC Box Premium | 197 |
| 12mm Nail Clips | 128 |
| 10mm Nail Clips | 127 |
| PoE PVC Box Premium | 115 |
| Nylon Tags 250X3.6 | 68 |

### HD Camera (1787 total orders)

| Product | Orders |
|---------|--------|
| 2.4mp ILLUMAX Bullet Camera CP Plus | 630 |
| 2.4mp illumax Dome Camera CP Plus | 379 |
| 2.4mp V3 Bullet Camera CP Plus | 161 |
| 2.4mp Guard + Audio Bullet Camera CP PLUS | 133 |
| 2.4mp V3 Dome Camera CP Plus | 122 |
| 2.4mp Guard +  Audio Dome Camera CP Plus | 85 |
| 2.4mp Audio Dome Camera CP Plus | 65 |
| 5mp iLLUMAX Bullet Camera CP Plus | 65 |

### Cables (1371 total orders)

| Product | Orders |
|---------|--------|
| 3+1 CCTV Cable GENERIC | 336 |
| 3+1 Cable 90m CP Plus | 251 |
| CAT6 Cable 100m CP Plus | 184 |
| CAT6 Cable 305m Eco CP Plus | 105 |
| CAT6 Outdoor 100m Generic | 63 |
| 3+1 CCTV Cable GENERIC Premium | 61 |
| 3+1 Cable Nazar | 57 |
| 3+1 CCTV Cable Outdoor CP PLUS | 45 |

### Metal Stands & Fixtures (1369 total orders)

| Product | Orders |
|---------|--------|
| 4U Mini Rack | 516 |
| 2U Mini Rack | 295 |
| Monitor wall mount adjustable Mini | 142 |
| 4U Wide Rack | 123 |
| Pole / Wall Stand for Camera Regular | 101 |
| Pole Rings SS 300mm | 73 |
| Pole / Wall Stand Adjustable | 30 |
| Monitor wall mount fixed 32" to 42" | 25 |

### SMPS (1081 total orders)

| Product | Orders |
|---------|--------|
| 4-Ch SMPS Generic | 282 |
| 8-Ch SMPS Generic | 258 |
| 10A SMPS Metal Body CP Plus | 170 |
| 5A SMPS Metal Body CP Plus | 95 |
| 20A SMPS Metal Body CP PLUS | 80 |
| SMPS 16-Ch CP PLUS | 54 |
| 5A SMPS CP Plus | 46 |
| SMPS 4-Ch SMPS CP Plus | 39 |

### Hard Disk (997 total orders)

| Product | Orders |
|---------|--------|
| 500GB Hard Disk | 392 |
| 1TB Hard Disk | 283 |
| 2TB Hard Disk | 198 |
| 4TB Hard Disk | 85 |
| 8TB Hard Disk | 25 |
| 3TB Hard Disk | 5 |
| 12TB Hard Disk | 4 |
| Skyhawk Hard Disk 4TB | 2 |

### General (983 total orders)

| Product | Orders |
|---------|--------|
| Insulation Tape | 414 |
| CMOS Battery for DVR CR1220 | 204 |
| Electrical Spike Box Regular | 185 |
| Electrical Spike Box Premium 2mtr | 45 |
| 9V Battery | 40 |
| Wireless Mouse Regular | 34 |
| Electrical Spike Box Premium 5mtr | 26 |
| Wireless Mouse Premium | 14 |

### IP Camera (810 total orders)

| Product | Orders |
|---------|--------|
| 2mp IP Bullet iLLUMAX STQC CP Plus | 143 |
| 2mp IP iLLUMAX Dome STQC CP Plus | 113 |
| 4mp IP iLLUMAX Bullet STQC CP Plus | 92 |
| 4mp IP iLLUMAX Dome STQC CP Plus | 59 |
| 2mp IP Audio Bullet Camera (Y) CP Plus | 58 |
| 2mp IP Dome STQC CP Plus IR 30m | 54 |
| 4mp IP Bullet Camera Audio iLLUMAX CP Plus STQC | 46 |
| 4mp IP Dome Camera Audio iLLUMAX CP Plus STQC | 38 |

### DVR (776 total orders)

| Product | Orders |
|---------|--------|
| 4-Ch DVR - IC 2.4mp CP Plus | 351 |
| 8-Ch DVR - IC 2.4mp CP Plus | 275 |
| 16-Ch DVR 2.4mp CP Plus | 76 |
| 8 Ch DVR – 5mp CP Plus | 40 |
| 4 Ch DVR – 5mp CP Plus | 18 |
| 16 Ch DVR – 5mp CP Plus | 8 |
| 32- Ch DVR 5mp 2-SATA CP Plus | 4 |
| 4-Ch DVR 2-way talk 2.4mp CP-UVR-0404E1-I | 3 |

### Memory Card (639 total orders)

| Product | Orders |
|---------|--------|
| 64GB Memory Card CP Plus CP-NM64 / UM64C | 443 |
| 128GB Memory Card CP PLUS CP-NM128 / UM128C | 167 |
| 128GB SD Card Generic | 12 |
| 64GB SD Card Generic | 11 |
| 256GB Memory card CP Plus | 6 |

### PoE Switch (630 total orders)

| Product | Orders |
|---------|--------|
| 8 Port PoE Switch CP Plus | 308 |
| 4 Port PoE Switch 10/100 CP Plus | 185 |
| 8 Port PoE Switch Full Giga with SFP Port CP Plus | 45 |
| 4 Port PoE Switch Full Giga 10/100/1000 CP Plus | 25 |
| 8 Port PoE Switch Full Giga CP Plus | 25 |
| 8-Port PoE with Giga uplinks CP PLUS | 17 |
| 16 PORT POE SWITCH TWO GIGA UPLINKS CP PLUS | 8 |
| 16 Port Full Giga PoE Switch CP PLUS | 5 |

### WiFi Camera (569 total orders)

| Product | Orders |
|---------|--------|
| EZ-P34Q 3mp WiFi PT Camera Ezykam CP Plus | 147 |
| CP-E28Q 2mp WiFi PT Camera  Ezykam CP Plus | 122 |
| CP-Z43Q 4mp WiFi Full Colour Outdoor Camera CP PLUS | 110 |
| CP-Z45Q 4mp WiFi PT Camera Ezykam CP Plus | 71 |
| 4mp WiFi PT Camera CP-E41Q Ezykam CP Plus | 27 |
| CP-V31A CP PLUS 3mp WiFi Bullet Camera | 24 |
| Bulb type WiFi Camera 3mp CP-T31A CP Plus | 24 |
| CP-V41A CP PLUS 4mp WiFi Bullet Camera | 17 |

### NVR (419 total orders)

| Product | Orders |
|---------|--------|
| 8-Ch NVR CP Plus | 178 |
| 16-Ch NVR 1-SATA CP Plus | 100 |
| 4-Ch NVR CP Plus | 73 |
| 32-Ch NVR 2-SATA CP Plus | 49 |
| 16-Ch NVR 2-SATA 4K2 Series CP Plus | 11 |
| 32-Ch NVR 4-SATA CP Plus | 5 |
| 64-Ch NVR 4-SATA CP Plus | 3 |

### Adaptor (404 total orders)

| Product | Orders |
|---------|--------|
| Fyber Adaptor 12V 5A | 142 |
| Fyber Adaptor 12V 2A | 111 |
| 12V Adaptor 2A | 79 |
| 12V Adaptor 5A | 54 |
| 5V 1A Adaptor | 18 |

### Solar Camera (204 total orders)

| Product | Orders |
|---------|--------|
| 4G Solar Linkage camera ( DEFENDER DUO SOLARIS) Secureye | 158 |
| 4G Solar Linkage camera 4mp G5 / W4 Active Pixel | 45 |
| Solar PT 4G Camera Secureye | 1 |

### Tools (193 total orders)

| Product | Orders |
|---------|--------|
| Wire Stripper | 60 |
| Screw Driver 6 inch | 30 |
| LAN Tester | 30 |
| Crimping Tool Regular | 24 |
| Crimping Tool Passthrough | 19 |
| Screw Driver 4 inch | 15 |
| Hammer 1 Pound | 8 |
| Screw Driver set for multiple screw types | 3 |

### Monitors (182 total orders)

| Product | Orders |
|---------|--------|
| Monitor 19 inch HDMI & VGA | 153 |
| Monitor 17 inch HDMI & VGA | 13 |
| 32 inch LED Monitor / TV | 9 |
| 24 inch LED Monitor / TV | 7 |

### Routers & Network Switch (177 total orders)

| Product | Orders |
|---------|--------|
| 4G SIM Router Secureye | 78 |
| WiFi USB Dongle Generic | 32 |
| 5 Port Network Switch 10/100 | 16 |
| Gigabit Network 5 Port Switch Generic | 15 |
| Gigabit Network 8 Port Switch Generic | 15 |
| 8 Port Network Switch 10/100 | 7 |
| 4G/5G SIM Router 4-Antennas Multybyte | 7 |
| WiFi Router D-Link N300 DIR615 | 4 |

### 4G SIM Camera (112 total orders)

| Product | Orders |
|---------|--------|
| 4G SIM Pan & Tilt Camera EZ-S35T CP PLUS EZYKAM | 94 |
| 4G SIM Linkage Camera 4mp+4mp Active Pixel G8/J2 | 12 |
| 3mp 4G Dome Camera CP-D31G CP Plus Ezykam | 5 |
| 4G Bullet Camera CP-V32G CP Plus | 1 |

### Fiber Optic Products (88 total orders)

| Product | Orders |
|---------|--------|
| Media Converter Pair 10/100 | 32 |
| Fiber Optic Termination Box / Splicing Tray | 18 |
| Fiber Optic Patch Cord for M/C | 12 |
| Media Converter Pair Giga | 9 |
| Fiber Optic Patch Cord for SFP | 5 |
| Fiber Optic Cable 4F Black | 5 |
| SFP Module Pair | 4 |
| Fiber Optic Cable 6F Black | 3 |

### Metal Racks (22 total orders)

| Product | Orders |
|---------|--------|
| Metal Pole Box Regular | 14 |
| Metal Pole Box Medium Size | 4 |
| Metal Pole Box Heavy Premium | 4 |

---

## 8. Implementation Recommendations

### Feature Priority (by impact)

| Priority | Feature | Signal Source | Expected Impact |
|----------|---------|--------------|-----------------|
| P0 | **Frequently Bought Together** | SKU co-occurrence (lift > 3, count > 50) | High — drives accessory attach rate on every order |
| P0 | **System Bundles / Complete Kits** | Multi-item archetype analysis | High — simplifies buying for installers, increases AOV |
| P1 | **Buy Again** | Customer repeat purchase history | High — 47% repeat customers, reduces friction for regulars |
| P1 | **Bestsellers** | Order frequency + revenue | Medium — social proof for new visitors |
| P2 | **People Also Buy** | Customer-level cross-purchase | Medium — works well for logged-in users with history |
| P2 | **Same Category** | Category grouping + frequency rank | Low-Medium — basic but necessary fallback |

### Data Model Suggestions

To power these features, store the following in your database:

**Table: `product_associations`**

| Column | Type | Description |
|--------|------|-------------|
| product_id_a | FK | First product |
| product_id_b | FK | Second product |
| association_type | enum | `frequently_bought_together`, `people_also_buy` |
| co_occurrence_count | int | Number of baskets containing both |
| lift | float | Statistical lift score |
| confidence_a_to_b | float | P(B|A) |
| confidence_b_to_a | float | P(A|B) |
| last_computed | timestamp | When this was last refreshed |

**Table: `product_popularity`**

| Column | Type | Description |
|--------|------|-------------|
| product_id | FK | Product |
| order_count_30d | int | Orders in last 30 days |
| revenue_30d | decimal | Revenue in last 30 days |
| repeat_purchase_rate | float | % of buyers who re-buy |
| category_rank | int | Rank within category |

**Table: `category_associations`**

| Column | Type | Description |
|--------|------|-------------|
| category_a | FK | First category |
| category_b | FK | Second category |
| lift | float | Statistical lift |
| co_occurrence_count | int | Basket co-occurrence |

### Refresh Strategy

- Re-compute associations **weekly** from the last 90 days of invoice data (rolling window)
- For "Buy Again", query **live** from the customer's purchase history
- For "Bestsellers", compute **daily** from last 30 days

### Fallback Logic

When a product has insufficient co-purchase data (new or low-volume items):

1. Fall back to **category-level** associations (use the category lift table above)
2. Then fall back to **bestsellers within the same category**
3. Then fall back to **global bestsellers**

---

## 9. Red Flags & Caveats

- **1-month window is narrow.** These patterns are strong but should be validated against 3–6 months of data for seasonal effects and stability.
- **Estimates inflate co-occurrence.** Estimates average 8.6 items vs. 2.9 for invoices. They represent intent, not purchase. If recommendations feel too aggressive, re-run with invoices only.
- **No product hierarchy in current catalog.** The flat listing means you're missing upsell paths (e.g., 2.4mp → 5mp upgrade). Consider adding a `system_type` tag (Analog/IP/WiFi) to products.
- **"Unknown" category items** (Installation Charges, Cabling/Wiring Charges, etc.) — these are service line items, not products. Exclude them from product recommendations but consider as bundle add-ons.
- **B2B context matters.** Your customers are mostly CCTV installers/resellers, not end consumers. "Buy Again" and "Bestsellers" carry more weight than "People Also Buy" in this context, since installers have predictable, repeating needs.
