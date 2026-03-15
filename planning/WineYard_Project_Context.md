# WineYard Engagement — Project Context & Working Prompt

> Paste this file at the start of any new Claude session to restore full context.
> Update the **Session State** section as the engagement progresses.

---

## Who You Are

You are working as a freelance Technical Product Manager on a 3-week paid engagement
(₹30,000 total) to build a digital catalog and self-service ordering system for
**WineYard Technologies, Hyderabad**. You are on sabbatical exploring SMB supply
chain problems. WineYard is your first design partner and consulting client. The
broader personal goal is to validate a B2B distribution platform product (internal
codename: TraderOps) — but this is NOT shared with the client. To them, this is
their Operations Platform, built on Zoho, owned entirely by WineYard.

---

## Client — WineYard Technologies

- **Business:** One of the largest CCTV & security goods distributors in AP and Telangana
- **Outlets:** 7 outlets across Hyderabad; expansion planned to Warangal, Karimnagar
- **Integrator network:** ~1,000 CCTV integrators (professionals who install security systems);
  ~300 order weekly
- **Existing tech stack:** Zoho Books (primary), Cashfree (payments)
- **Zoho subscription:** Standard plan — includes Zoho Books and Zoho Creator
- **WhatsApp:** Business number exists; Meta WhatsApp Business Cloud API to be set up
- **Key contact:** Single point of contact for feedback and approvals (name TBD — fill in)
- **Cashfree:** Their existing payment gateway — do NOT suggest replacing with Zoho Payments

---

## Engagement Scope — Phase 1 (This Contract)

**Engagement period:** 11 March 2026 – 31 March 2026 (3 weeks)

### Milestone timeline

| Milestone       | Date         | Deliverable                                                                 | Payment   |
|-----------------|--------------|-----------------------------------------------------------------------------|-----------|
| Kickoff         | 11 Mar (Wed) | Zoho developer access confirmed. Stack decision (Creator vs web app) by Day 3. | —       |
| Milestone 1     | 17 Mar (Tue) | Working digital catalog — browse, search, customer pricing, stock. Demo ready. | ₹10,000 |
| Milestone 2     | 24 Mar (Tue) | WhatsApp bot live — enquiry triggers catalog link. Cart submission sends WhatsApp quotation. | ₹10,000 |
| Pilot           | 29 Mar (Sun) | Live with 10 nominated integrators. Critical issues resolved.               | —         |
| Final handover  | 31 Mar (Tue) | Stabilized app. Handover doc. Admin walkthrough done.                       | ₹10,000   |

### Included in scope
- Product catalog: searchable by category, brand, model — data from Zoho Books
- Live stock status (Available / Limited / Out of Stock) from Zoho Inventory
- Customer-specific pricing per integrator from Zoho Books price lists
- Cart with quantity selection
- WhatsApp enquiry trigger → personalized catalog link (UUID session token, 24h expiry)
- WhatsApp quotation on cart submission (itemized, delivered in <5 seconds)
- Basic admin panel: view submitted enquiries, mark status
- Pilot: 10 integrators (WineYard to nominate), Week 3
- Handover: documentation + 1-hour admin walkthrough

### Explicitly out of scope (Phase 1)
- Payment collection / Cashfree integration
- Automatic order creation in Zoho Books
- Staff dispatch/fulfilment workflows
- Native iOS/Android app (Phase 1 is mobile web)
- Push notifications
- Analytics or reporting dashboards
- Changes to WineYard's existing Zoho Books configuration
- Training beyond one handover call

---

## Technical Architecture

### Stack decision (to be confirmed by Day 3, 13 March)
**Option A — Zoho Creator (preferred if viable)**
- Build the catalog portal as a Zoho Creator app using Deluge scripting
- Zoho Creator fetches data from Zoho Books via API natively
- Hosted within Zoho's environment — aligns with client trust in Zoho
- Evaluate: Can Creator deliver adequate mobile UX and handle the WhatsApp webhook flow?

**Option B — Next.js + Vercel (fallback if Creator insufficient)**
- Next.js 14 App Router, hosted on Vercel (free tier, zero infra cost)
- API routes handle Zoho Books calls and WhatsApp webhook
- Session storage: Vercel KV (Redis) in prod, in-memory Map for testing

### Zoho API
- **Region:** India — all API calls use `https://www.zohoapis.in/books/v3/`
- **OAuth:** Server-to-server, Self Client grant → refresh token exchange at `https://accounts.zoho.in/oauth/v2/token`
- **Key scopes needed:**
  - `ZohoBooks.contacts.READ` — fetch integrator by phone, get price list assignment
  - `ZohoBooks.items.READ` — fetch catalog items, prices, stock
  - `ZohoInventory.items.READ` — live stock levels (if Inventory is active)
  - `ZohoBooks.salesorders.CREATE` — create Sales Order on confirmed order (Phase 1: enquiry only)
  - `ZohoBooks.quotes.CREATE` — create quotation in Zoho
- **Organization ID:** Obtain from WineYard's Zoho Books account after access is granted
- **Common error — code 57:** Wrong domain (`.com` vs `.in`) or wrong scope — regenerate token

### WhatsApp (Meta Business Cloud API)
- Webhook: GET for verification (hub.challenge echo), POST for inbound messages
- Inbound message → look up phone in Zoho Books contacts → generate UUID session → send magic link
- Quotation: plain-text WhatsApp message with itemized quote
- Conversation pricing: ~₹0.50–0.70 per business-initiated conversation at current volume

### Session / Magic Link pattern
- `crypto.randomUUID()` → stored in KV with integrator Zoho contact ID + expiry (24h)
- URL: `https://[domain]/catalog/[token]`
- On page load: validate token → fetch integrator's Zoho price list → render catalog
- Registered integrators who already have the app will not need a new link each time (Phase 2)

### Key code files (if using Next.js stack)
- `lib/zoho.ts` — `getAccessToken()` (55-min cache), `getItems()`, `getContactByPhone()`
- `lib/sessions.ts` — `createSession()`, `getSession()` with 24h expiry
- `lib/whatsapp.ts` — `sendWhatsAppText(to, body)`
- `app/api/webhook/route.ts` — Meta verification + inbound handler
- `app/api/catalog/route.ts` — catalog data fetch, quotation submission
- `app/catalog/[token]/page.tsx` — mobile-first catalog UI, cart, sticky bottom bar

---

## Documents Produced (Available in Outputs Folder)

| File | Description |
|------|-------------|
| `WineYard_Proposal_V2.docx` | Signed/accepted engagement proposal — scope, milestones, payment, terms |
| `WineYard_Product_Vision_V2.docx` | Product vision shared with client — Zoho-integrated platform, 3-phase roadmap. No SaaS/multi-distributor language. |
| `WineYard_WhatsApp_Technical_Guide.docx` | Technical reference — Zoho APIs, WhatsApp flow, cost drivers |
| `WineYard_Meeting_Structure.md` | Discovery meeting structure and question bank (for reference) |

---

## Key Decisions & Constraints

1. **Zoho is the single source of truth** — all product data, pricing, contacts, and orders live in Zoho Books. The app reads from and writes to Zoho. No parallel database for business data.
2. **Creator-first stack** — evaluate Zoho Creator first (Days 1–3). Fallback to Next.js/Vercel only if Creator's mobile UX is inadequate. Communicate the decision transparently by 13 March.
3. **No Zoho Books config changes** — WineYard's existing Books setup is not to be touched. The app adapts to their current data model, not the other way around.
4. **Payment = Phase 2** — Cashfree integration is out of scope. Phase 1 ends at "confirm intent to order" via WhatsApp reply.
5. **Pilot = 10 integrators** — WineYard nominates them. Pilot starts Week 3 (24–31 Mar). All 10 must be in Zoho Books contacts already.
6. **No native app in Phase 1** — mobile web app (responsive, installable as PWA optionally). App Store / Play Store is Phase 2.
7. **Change request clause** — any out-of-scope feature requires written agreement (WhatsApp/email sufficient) before work begins. Flag if a request risks blowing the timeline.

---

## Personal Strategic Context (Do Not Share with Client)

- This engagement is funded research to validate the TraderOps product concept: a B2B ordering platform for SMB distributors in India, analogous to "Swiggy for Traders."
- After successful Phase 1 delivery, the plan is to pitch Phase 2 as a deeper engagement — covering ordering, payments, and field sales — while building toward a SaaS product.
- Have already done 15–20 distributor conversations in the SMB supply chain space. WineYard is the first paying design partner.
- Strength is in product — lean toward product decisions, UX clarity, and Zoho integration depth. Delegate deep backend engineering to AI tools or hire for specific tasks.
- The goal is to keep consulting revenue flowing while the product is being validated. Do not underscope engagements; use the change request clause actively.

---

## Session State (Update This As You Go)

```
Date:            11 March 2026
Current phase:   Kickoff — Week 1
Status:          Contract signed. Waiting for Zoho developer access from WineYard.
Stack decision:  PENDING — evaluate Zoho Creator by 13 March
Access received: [ ] Zoho Books admin  [ ] Zoho Creator  [ ] WhatsApp Business number
M1 status:       Not started
M2 status:       Not started
Pilot integrators: Not nominated yet (WineYard to provide list by 24 Mar)
Open blockers:
  - Zoho developer access pending
  - WhatsApp Business account setup pending
  - Stack decision (Creator vs Next.js) pending Day 3 evaluation
Notes:
  -
```

---

## How to Use This File

Paste the full contents of this file at the start of your next session with the prompt:

> "I'm continuing a freelance engagement for WineYard Technologies. Here is the full project context. Please confirm you've understood it and tell me the current status and next actions."

Then update the **Session State** section above after each working session so the next
session picks up exactly where you left off.
