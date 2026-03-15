# Project Proposal
## WhatsApp-Integrated Customer Catalog — Phase 1
**Prepared for:** WineYard Technologies, Hyderabad
**Prepared by:** [Your Name]
**Date:** [Date]
**Valid until:** [Date + 7 days]

---

## 1. Background

WineYard Technologies is one of the largest CCTV distributors in Andhra Pradesh and Telangana, operating 7 outlets across Hyderabad with plans to expand to Warangal and Karimnagar. The business serves approximately 1,000 CCTV integrators, of whom ~300 are active weekly buyers.

Today, integrators call or WhatsApp outlet staff to check stock availability and pricing before placing orders. This manual process creates delays, consumes significant staff time, and limits the speed at which WineYard can grow its order volume.

The goal of this engagement is to eliminate the manual enquiry bottleneck by giving integrators a self-service way to check stock, see their negotiated pricing, and receive instant quotations — all through WhatsApp, the channel they already use.

---

## 2. Proposed Solution — Phase 1

**Experience from the integrator's perspective:**

An integrator sends any message to WineYard's WhatsApp number. Within 5 seconds, they receive a personalized link. They open it on their phone and see WineYard's full product catalog — with live stock availability and their specific negotiated pricing. They select the products and quantities they need, submit the form, and receive a formatted quotation on WhatsApp within 5 seconds. No phone calls. No waiting. No staff involvement for routine enquiries.

**What this replaces:**
The current process of calling/WhatsApping outlets, waiting for a staff member to check stock and pricing manually, and receiving an informal verbal or WhatsApp quote.

**What this does NOT include** (Phase 1 scope boundary):
- Payment collection
- Automatic order creation in Zoho
- Field sales staff features
- WhatsApp automation beyond enquiry and quotation
- Integration with WineYard's accounting workflow

---

## 3. Scope of Work

### Included in Phase 1

**Zoho Creator Application**
- Product catalog built within Zoho Creator (stays entirely in the Zoho ecosystem)
- Live stock availability pulled directly from WineYard's Zoho account
- Customer-specific pricing — integrators see their negotiated rates, unregistered visitors see MRP
- Mobile-optimized browsing and quantity selection
- Catalog link generated per session, tied to the integrator's phone number

**WhatsApp Bot Integration**
- Any inbound message to WineYard's WhatsApp number triggers the catalog link
- Personalized greeting using integrator's name from Zoho
- Quotation message sent back to integrator's WhatsApp on form submission
- Formatted quotation includes itemized list, quantities, prices, and total

**Pilot & Stabilization**
- Internal testing with [Your Name]'s test numbers
- Pilot rollout to 5–10 nominated integrators
- Bug fixes and adjustments based on pilot feedback
- Handover documentation for WineYard's Zoho admin

### Explicitly Not Included
- Payment gateway or payment collection
- Order creation or modification in Zoho Books/Inventory
- Staff-facing dashboards or reports
- Changes to WineYard's existing Zoho Books/Inventory setup
- Ongoing feature development beyond Phase 1 scope
- Training sessions beyond one handover call

---

## 4. Timeline

| Week | Focus | Milestone |
|------|-------|-----------|
| Week 1 | Zoho Creator app — catalog, stock, customer pricing | Internal demo ready by Friday |
| Week 2 | WhatsApp integration — link delivery, quotation reply | End-to-end flow working by Friday |
| Week 3 | Pilot with 5–10 integrators, feedback, fixes, handover | Signed off and handed over by Friday |

**Start date:** [Agreed date — specific Monday]
**Delivery date:** [Start date + 21 days]

> Timeline assumes Zoho Creator subscription is active and developer access is granted by the start date. Delays in access will extend the timeline accordingly.

---

## 5. Investment

### Phase 1 — Fixed Fee

| Milestone | Deliverable | Amount | Due |
|-----------|-------------|--------|-----|
| Kickoff | Zoho developer access confirmed, start | ₹10,000 | Day 1 (start date) |
| Week 1 | Internal catalog demo working | ₹10,000 | Friday, Week 1 |
| Week 3 | Pilot complete, handover done | ₹10,000 | Friday, Week 3 |
| **Total** | | **₹30,000** | |

**Payment method:** Bank transfer / UPI to [Your UPI/Account details]
**GST:** [Include or exclude based on your registration status]

### What's Included in the Fee
- All development and testing work for the scope defined in Section 3
- One handover call (max 1 hour) with WineYard's Zoho admin
- Bug fixes for issues within the agreed scope for 30 days post-delivery

### What's Not Included
- Zoho Creator subscription cost (purchased directly by WineYard)
- WhatsApp Business API costs (Meta charges per conversation — estimated ₹0–500/month at current volume)
- Any feature additions or changes beyond the agreed scope
- Support beyond 30 days post-delivery

### Post-Delivery Support
After the 30-day warranty period, support and changes will be handled as separate engagements, quoted per request. There is no ongoing retainer obligation on either side.

---

## 6. What WineYard Needs to Provide

For this engagement to start and complete on time:

| Item | Required By |
|------|-------------|
| Zoho Creator subscription purchased (Standard plan, min 2 users) | Before start date |
| Developer/admin access to Zoho for [Your Name] | Before start date |
| List of 5–10 integrators for pilot (name + phone number) | End of Week 2 |
| One point of contact for feedback during the 3 weeks | Before start date |
| Timely responses to technical questions (within 1 business day) | Ongoing |

---

## 7. Terms

### Change Requests
Any feature, change, or addition beyond the scope defined in Section 3 will be discussed, scoped, and quoted separately before work begins. Minor bug fixes within the delivered scope are included for 30 days post-delivery at no additional charge.

### Withdrawal by Client
If WineYard Technologies chooses to discontinue the engagement:
- Before Week 1 milestone: ₹10,000 (kickoff payment) is non-refundable as it covers discovery and setup work already completed
- After Week 1 milestone: Payments made for completed milestones are non-refundable. Work in progress for the current milestone will be delivered in its current state
- No further payments are owed for uncompleted milestones

### Withdrawal by Consultant
If [Your Name] is unable to continue the engagement due to unforeseen circumstances:
- All completed milestone payments are retained for work delivered
- A pro-rated refund will be issued for any milestone payment received but not yet delivered
- All work completed to date will be handed over to WineYard in a usable state

### Scope Creep
If during development it becomes clear that the agreed scope requires significantly more work than estimated (more than 20% overrun in effort), [Your Name] will flag this within 48 hours and both parties will agree on either scope reduction or additional compensation before proceeding.

### Confidentiality
[Your Name] will not share WineYard's business data, pricing structures, customer information, or internal processes with any third party. Work product built within WineYard's Zoho account remains the property of WineYard Technologies upon full payment.

### Intellectual Property
The application built within Zoho Creator is hosted in WineYard's Zoho account and is owned by WineYard Technologies upon full payment of all milestones. [Your Name] retains the right to reuse general technical approaches and patterns (not WineYard-specific data or designs) in future engagements.

---

## 8. Indicative Future Phases

*These are directional only — not committed scope or pricing.*

**Phase 2 — Self-Service Ordering**
Integrators confirm orders directly from WhatsApp. Orders auto-created in Zoho. Staff notified for dispatch. Estimated: 3–4 weeks after Phase 1 completion.

**Phase 3 — Payments + Field Sales**
Payment gateway integration for online collection. Field sales rep app for capturing orders on the road. Performance dashboards for staff. Estimated: 4–6 weeks after Phase 2.

**Phase 4 — Scale**
Multi-city expansion support. Integrator self-registration. Advanced analytics. To be scoped based on business growth.

---

## Acceptance

By proceeding with the kickoff payment, WineYard Technologies agrees to the scope, timeline, investment, and terms described in this proposal.

| | |
|---|---|
| **Client:** | WineYard Technologies |
| **Authorized by:** | [Client Name + Signature] |
| **Date:** | |
| | |
| **Consultant:** | [Your Name] |
| **Date:** | |

---

*Questions? Contact [Your Name] at [email / phone]*
