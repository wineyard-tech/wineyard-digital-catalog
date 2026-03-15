# WineYard Technologies — Discovery Meeting Structure
**Duration:** 2 hours | **Format:** Paid discovery session (₹3,000)
**Goal:** Validate assumptions, co-design UX, agree Phase 1 scope + timeline

---

## Pre-Meeting Checklist
- [ ] Demo ready on phone: WhatsApp → catalog link → browse → submit → quotation back
- [ ] Zoho Creator pricing pulled up (Standard: ₹480/user/month)
- [ ] Phase 1 scope printed or on screen
- [ ] Notebook for capturing red flags

---

## Block 1 — 0:00 to 0:20 | Open + Demo (you talk)

**Goal:** Establish credibility immediately. Show, don't tell.

**Opening line:**
> "I've spent time since our last conversation understanding your Zoho setup and the integrator workflow. Before we get into questions, let me show you one direction I've already prototyped."

**Show the demo on your phone:**
WhatsApp message in → bot replies with link → catalog page → select quantities → submit → quotation received on WhatsApp.

**Then say:**
> "This is rough and uses test data — but the core experience is real. I want to use today to make sure what I build for you is grounded in how your integrators actually work. By the end of today, I want us to agree on exactly what we build and when it goes live."

**Why this works:** He's paid ₹3k. Seeing working code in the first 10 minutes tells him the money was well spent before you've asked a single question.

---

## Block 2 — 0:20 to 0:55 | Discovery Questions

> You talk 20%, he talks 80%. Take notes visibly — it signals you're listening.

### Theme A — Current Pain (Validate, Don't Assume)
*He's described this before — but getting him to say it again in his own words helps you scope correctly and reveals nuances.*

- Walk me through one full enquiry — from the moment an integrator contacts you to the moment you confirm availability. Who does what, step by step?
- On a busy day, how many such enquiries does each outlet handle? What's the longest part?
- Have you ever lost an order because response was too slow? What happened?
- What mistakes happen most often in manual handling — wrong price, wrong stock, wrong outlet?

### Theme B — Customer (Integrator) Behaviour
*Critical for UX design — don't assume smartphone fluency.*

- How tech-savvy are your integrators typically? Do they use apps like Swiggy or book cabs on their phone?
- When they WhatsApp today, what do they typically send — product names, SKUs, photos, or just descriptions?
- Do they enquire for one product at a time or send a full list?
- Do they expect an instant reply or are they okay waiting 15–30 minutes?
- Have any of your integrators used online ordering with another supplier? What was their reaction?
- What's the age range of your top 20 integrators? (Proxy for digital comfort)
- Do they use WhatsApp on phone or WhatsApp Web on desktop?

### Theme C — Zoho Setup (Technical Validation)
*He manages Zoho himself — use this time to understand exactly what's built.*

- Can you show me how custom pricing is set up right now? (Watch for: standard Pricebooks vs custom module)
- When you search a customer in Zoho, does their phone number appear with or without the country code?
- Is stock tracking happening in Zoho Books or do you also use Zoho Inventory?
- How often does inventory data get updated in Zoho — real-time as sales happen, or end of day?
- Are your products organized into categories in Zoho, or is it a flat list?
- How many active SKUs do you have in Zoho today?

### Theme D — Success Definition + Red Flag Detection
*Establish what "done" looks like AND surface what could derail this.*

**Success questions:**
- If I show you something in 3 weeks, what would you need to see to say "yes, this is ready for my integrators"?
- Imagine your best integrator uses this for the first time — walk me through what you want their experience to be, start to finish.
- Which 5 integrators would you trust to pilot this first? (People who will give honest feedback, not just be polite)

**Red flag detection questions:**
- Have you shown this idea to any of your integrators already? What was their reaction?
- What would make you NOT roll this out even if it works technically?
- If an integrator gets a wrong price or wrong stock info from the bot, what happens? Who is responsible?
- Are there any products you would NOT want shown in a self-service catalog? (Margins, exclusive deals, etc.)
- Do any of your integrators have exclusive pricing arrangements that others shouldn't see?
- What happens if the system is down during peak hours — do you have a fallback?
- Has anything like this been tried before with your integrators and failed? What happened?

> **Watch for:** Hesitation on the "wrong price" question — means pricing accuracy is a trust issue. Any "yes but..." on rollout — means internal resistance from staff whose job changes.

---

## Block 3 — 0:55 to 1:20 | Co-Design the UX

**Say:**
> "Based on what you've told me, let me sketch what I think the experience should be. Tell me where I'm wrong."

**Walk through the flow visually** (show the Excalidraw diagram on your screen/phone):

1. Integrator sends any WhatsApp message to WineYard's number
2. Bot replies in <5 seconds with a personalized link
3. They open a mobile page — their catalog, their prices, live stock
4. They select quantities, submit
5. Quotation arrives on WhatsApp in <5 seconds
6. They reply CONFIRM → (Phase 2) order created in Zoho

**Questions to ask at each step:**
- Step 2: "Should the link expire? If they share the link with someone else, that person would see this integrator's pricing. Is that a problem?"
- Step 3: "Do you want them to see exact stock numbers or just 'Available / Not Available'?"
- Step 4: "Should they be able to enquire for products that are out of stock? Or hide them?"
- Step 5: "The quotation on WhatsApp — should it come from WineYard's number or yours personally?"
- Step 6: "When they say CONFIRM, what do you need to happen in Zoho?"

**Note everything they want in Phase 2/3 without committing:** "Great — that goes in Phase 2, I've noted it."

---

## Block 4 — 1:20 to 1:45 | Agree Scope + Timeline

**Propose Phase 1 explicitly:**

> "Here's what I want to build in 3 weeks. I'm keeping scope tight deliberately — I want something real in your customers' hands fast, get feedback, and build Phase 2 on that foundation."

### Phase 1 — 3 Weeks (Commit to this)
**Week 1:** Zoho Creator app with product catalog — browsable, filterable, showing live stock from Zoho. Customer identified by phone number, sees their pricing.

**Week 2:** WhatsApp bot integration — any message triggers the catalog link. Form submission sends WhatsApp quotation back. End-to-end flow working.

**Week 3:** Pilot with 5–10 integrators. Capture feedback. Fix issues. Handover.

**Explicitly OUT of Phase 1:**
- Payment gateway
- Order creation in Zoho
- Field sales reports and staff performance tracking
- WhatsApp automation beyond enquiry/quotation

### Indicative Future Phases (don't price yet)
**Phase 2:** Self-service ordering — integrator confirms order from WhatsApp, order auto-created in Zoho, staff notified for dispatch. Staff portal to manage orders.

**Phase 3:** Payment gateway integration. Field sales rep app — capture orders on the road, routed to nearest outlet. Performance dashboards.

**Phase 4 (longer horizon):** Full B2B commerce — extend to Warangal, Karimnagar, eventually other cities. Multi-outlet inventory visibility. Integrator onboarding self-service.

---

## Block 5 — 1:45 to 2:00 | Close + Next Steps

**Three concrete next steps, agreed in the room:**

1. You send proposal by tomorrow EOD
2. He purchases Zoho Creator (Standard plan, minimum 2 users) and adds you as a developer user — by end of this week
3. He gives you a list of 5 pilot integrators with names and phone numbers — by end of this week
4. Engagement start date: agree a specific Monday

**Before leaving — one important question:**
> "For the system to show the right price to each integrator, I'll need to understand exactly how pricing is stored in Zoho. Can we spend 10 minutes right now with your Zoho open so I can see the setup?"

This single conversation saves you a week of debugging assumptions. Do it in the room if possible.

---

## What NOT to Do in This Meeting
- Don't say yes to scope additions — note them for Phase 2
- Don't mention the tech stack (Zoho Creator, Deluge, WhatsApp API) unless he asks
- Don't commit to a lower price — ₹30k is already below market
- Don't promise specific uptime or performance SLAs
- Don't ask for referenceability yet — earn it first

---

## Red Flags to Watch For
| Signal | What It Means | How to Handle |
|--------|--------------|---------------|
| "Can my staff also use this?" | Scope creep starting | "Phase 2 — noted" |
| Hesitation on wrong pricing liability | Trust issue — needs clear disclaimer in proposal | Address in proposal terms |
| "Previous consultant said this is hard" | Validate your technical path before committing | "I've already tested the API — I know where the complexity is" |
| Can't name 5 pilot integrators | Rollout will be slow | Push for at least 3 before starting |
| "Let's skip the pilot and go live directly" | Risk of bad first impression at scale | Hold firm on pilot |
| Vague answer on Zoho pricing setup | Could be a custom module, not standard Pricebooks | Must see it in Zoho before committing |
