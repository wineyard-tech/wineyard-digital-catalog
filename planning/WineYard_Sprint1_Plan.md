# Sprint Plan: WineYard Digital Catalog — Milestones 1 & 2
**Dates:** 13 Mar – 24 Mar 2026 (2 weeks)
**Initiative:** [CCTV Digital Catalog](https://linear.app/unboundstudio/initiative/cctv-digital-catalog-5dd57f944b56)
**Sprint Goal:** Ship a working digital catalog with customer-specific pricing + WhatsApp bot that triggers a catalog link and delivers itemized quotations end-to-end — with no manual intervention.

---

## Week 1 — Digital Catalog (Milestone 1, due 20 Mar)
**Project:** [Digital Catalog](https://linear.app/unboundstudio/project/digital-catalog-c6cd6efc8bd6)

| # | Issue | ID | Priority |
|---|-------|----|----------|
| 1 | Stack decision: Evaluate and confirm Zoho Creator vs custom web app for catalog | [UNB-71](https://linear.app/unboundstudio/issue/UNB-71) | 🔴 Urgent |
| 2 | Zoho Books API: Fetch and sync product catalog (Items) | [UNB-72](https://linear.app/unboundstudio/issue/UNB-72) | 🔴 Urgent |
| 3 | Zoho Books API: Fetch registered integrators (Contacts) | [UNB-73](https://linear.app/unboundstudio/issue/UNB-73) | 🔴 Urgent |
| 4 | Zoho Books API: Load customer-specific pricing (Price Lists) | [UNB-74](https://linear.app/unboundstudio/issue/UNB-74) | 🔴 Urgent |
| 5 | Catalog UI: Build browse, search, and filter interface | [UNB-75](https://linear.app/unboundstudio/issue/UNB-75) | 🟠 High |
| 6 | Catalog UI: Display live stock availability per product | [UNB-76](https://linear.app/unboundstudio/issue/UNB-76) | 🟠 High |
| 7 | Catalog UI: Show customer-specific pricing per integrator session | [UNB-77](https://linear.app/unboundstudio/issue/UNB-77) | 🟠 High |
| 8 | Cart: Add products with quantities and manage cart state | [UNB-78](https://linear.app/unboundstudio/issue/UNB-78) | 🟠 High |
| 9 | Cart: Submit enquiry action and confirmation screen | [UNB-79](https://linear.app/unboundstudio/issue/UNB-79) | 🟠 High |
| 10 | Internal demo: End-to-end browse → cart → submit working on mobile | [UNB-80](https://linear.app/unboundstudio/issue/UNB-80) | 🟠 High |

### Milestone 1 Definition of Done
- [ ] Full catalog browse → cart → submit flow works on mobile (Chrome Android + Safari iOS)
- [ ] Zoho Books data is live (not mocked)
- [ ] Two integrators with different price lists see different prices
- [ ] Stock badges reflect live Zoho Books stock levels
- [ ] Demo walkthrough conducted or recorded with WineYard

---

## Week 2 — WhatsApp Integration (Milestone 2, due 24 Mar)
**Project:** [WhatsApp Integration](https://linear.app/unboundstudio/project/whatsapp-integration-244c4b2a60ae)

| # | Issue | ID | Priority |
|---|-------|----|----------|
| 11 | WhatsApp API: Set up Meta Business Cloud API credentials and webhook | [UNB-81](https://linear.app/unboundstudio/issue/UNB-81) | 🔴 Urgent |
| 12 | WhatsApp inbound: Identify integrator by phone number from incoming message | [UNB-82](https://linear.app/unboundstudio/issue/UNB-82) | 🔴 Urgent |
| 13 | WhatsApp outbound: Generate personalized catalog link and send to integrator | [UNB-83](https://linear.app/unboundstudio/issue/UNB-83) | 🔴 Urgent |
| 14 | Quotation engine: Format itemized quotation from cart submission data | [UNB-84](https://linear.app/unboundstudio/issue/UNB-84) | 🔴 Urgent |
| 15 | WhatsApp outbound: Deliver quotation to integrator on cart submit (under 5 sec) | [UNB-85](https://linear.app/unboundstudio/issue/UNB-85) | 🔴 Urgent |
| 16 | WhatsApp inbound: Handle CONFIRM reply to log order intent | [UNB-86](https://linear.app/unboundstudio/issue/UNB-86) | 🟠 High |
| 17 | End-to-end test: WhatsApp message → catalog → cart → quotation back on WhatsApp | [UNB-87](https://linear.app/unboundstudio/issue/UNB-87) | 🟠 High |

### Milestone 2 Definition of Done
- [ ] Inbound WhatsApp message triggers personalized catalog link within 5 seconds
- [ ] Cart submission delivers itemized WhatsApp quotation within 5 seconds
- [ ] CONFIRM reply is captured and acknowledged
- [ ] Full end-to-end flow tested on real devices with real WhatsApp numbers
- [ ] No manual steps required in the flow
- [ ] Demo conducted or recorded with WineYard

---

## Key Dates
| Date | Event |
|------|-------|
| 13 Mar (Fri) | Sprint start — stack decision by EOD |
| 17 Mar (Tue) | Mid-sprint check-in — Milestone 1 internal demo |
| 20 Mar (Thu) | Milestone 1 sign-off target |
| 24 Mar (Mon) | Milestone 2 sign-off + pilot prep begins |
| 25–31 Mar | Week 3 — Pilot rollout with 10 integrators |

---

## Prerequisites (WineYard's responsibility — must be ready by 13 Mar)
- Zoho Books API access granted (OAuth credentials shared)
- Zoho Creator Standard plan active (min 2 users)
- WhatsApp Business Account verified and Phone Number ID shared
- Meta permanent access token provided
- 10 pilot integrators nominated for Week 3 rollout

---

## Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Zoho Creator can't support required features | Blocks Week 1 entirely | UNB-71 resolves this by Day 2; alternate stack agreed if needed |
| WineYard WhatsApp credentials not ready | Blocks Week 2 | Flag immediately if not received by 16 Mar |
| Integrator phone numbers not in Zoho Books | Breaks identity lookup | Validate a sample of 10 records early in Week 2 |
| Meta API rate limits during testing | Slows quotation delivery | Use test phone numbers in Meta sandbox to avoid prod rate limits |

---

## Assumptions
1. Single developer working this sprint
2. Zoho Books already has live item, contact, and price list data
3. WineYard has an active WhatsApp Business Account (not just a personal number)
4. No design/branding work required beyond a functional mobile UI
