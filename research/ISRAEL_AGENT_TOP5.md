# Experiment #003: Top 5 Israel-native agent businesses

These five survived the red team in `ISRAEL_AGENT_TOP10_RED_TEAM.md`, and each runs a different workflow.

They are ranked by evidence plus dry-run strength, not by score alone. The ranking would change if new hands-on tests are run.

---

## 1. "Pkidat Hazmanot AI": WhatsApp order intake → ERP for B2B distributors

**ONE-SENTENCE BUSINESS:** We take the WhatsApp orders (text, voice and photos) that a distributor's customers already send, and enter them as correct sales orders in the distributor's Priority, Hashavshevet or Rivhit. The customer gets a Hebrew confirmation, and we replace most of an order clerk's day.

**CUSTOMER:** Distributors and wholesalers with 50–1,500 business customers: food and drinks, disposables, cleaning supplies, building supplies. Their customers are kiosks, minimarkets, restaurants and contractors who refuse to use ordering portals.

**ISRAEL-SPECIFIC EDGE:**
- WhatsApp is the default B2B ordering channel. Orders arrive as Hebrew slang, voice notes and photos of handwritten lists.
- The back office runs on Israeli ERPs (Hashavshevet, Rivhit, Priority-IL). Global AI order-entry tools (Galo, Plato, Darwin, Conexiom) integrate with SAP, Odoo and NetSuite, not these.
- Israeli portals (MagicNet, WideCommerce, Wizcloud shop) try to move the *customer* to a portal and fail with small buyers.

**EXISTING HUMAN LABOR:**
- The order clerk ("קלדנית / פקיד/ת הזמנות / מתאם/ת הזמנות") is paid ₪8,000–9,500/month gross, which is about ₪11–13k loaded.
- Drushim shows 127 open "קליטת הזמנות" listings and 39 "הקלדת הזמנות" listings (2026-10-05).

**FULL AGENT LOOP:**
1. **Trigger:** an inbound WhatsApp message (Cloud API webhook) on the distributor's ordering number.
2. **Observe:** identify the customer by phone number from the ERP customer list. Transcribe the voice note or OCR the photo. Load the catalog, the customer's price list, and the customer's last N orders.
3. **Reason:** map each line to a SKU, quantity and unit, using customer-specific aliases learned from history. Detect ambiguity: a missing variant, an unknown item, or an unusual quantity relative to that customer's history.
4. **Act:**
   - If unambiguous: create the sales order through the ERP API (Rivhit `Document.New` type 7, Priority `ORDERS`, Hashavshevet `IMOVEIN`).
   - If ambiguous: ask the *customer* one clarifying question on WhatsApp, with options.
5. **Verify:** read the order back (`Document.Details` or GET), compare the lines, then send the customer a Hebrew summary. The customer's "👍/אישור" marks it confirmed. Amend or cancel requests are handled by cancel-and-recreate.
6. **Record:** order number, raw message, mapping, confidence and confirmation go to an audit log. New aliases go into the customer memory.
7. **Wait:** for the next message. Before the delivery cutoff, remind unconfirmed customers.

**LAST VALUABLE STEP:** a correct, customer-confirmed sales order in the ERP, ready for picking.

**WHY THE AGENT CAN COMPLETE IT:**
- The ERPs expose write APIs. Rivhit was exercised live: create, read back, amend (cancel and recreate) and cancel, all verified.
- Ambiguity is resolved with the ordering customer, who is already in the conversation. It never goes to the owner.

**MARKET SIZE IN ISRAEL:**
- About 500–1,000 distributors that take a meaningful share of orders by WhatsApp and run an API-capable ERP. This is my estimate from about 1,700 food factories, hundreds of importers that self-distribute, and the drinks, disposables, cleaning and building-supply sectors.
- The distributor count is not verified.
- 30 customers would be about ₪45k MRR.

**PRICE:** ₪1,500/month for up to about 1,500 orders/month, plus ₪0.5/order above that. Setup is ₪1,500 one-time, refundable if accuracy is below 95% in month one.

**COST TO SERVE:**
- LLM, transcription and OCR: about ₪0.05–0.20 per order, so about ₪100–300/month at 1,500 orders.
- WhatsApp: replies to customer-initiated messages fall inside the service window. Proactive reminders use paid templates, a few agorot each (Meta per-message pricing).
- Hosting under ₪100.
- Gross margin about 80–90%.
- Priority API call packs are paid by the customer.

**HUMAN TIME:**
- Onboarding: 4–8 hours (catalog, aliases, ERP/API access, WhatsApp number).
- After that: about 20–30 minutes/month reviewing the low-confidence queue and alias drift.

**FIRST 100 CUSTOMERS (exact source):**
1. Drushim and AllJobs listings for "קליטת הזמנות", "הקלדת הזמנות", "פקיד/ת הזמנות", "מתאם/ת הזמנות". Each listing is a company that pays a human for this exact job right now (127 + 39 concurrent).
2. duns100 "סיטונאות מזון ומשקאות": https://www.duns100.co.il/rating/מזון/סיטונאות_מזון_ומשקאות
3. b144 / easy.co.il categories for food, disposables and cleaning-supply wholesalers.
4. Customer-reference lists of the B2B portals (MagicNet, WideCommerce). Those are distributors that already admit the pain.

**FIRST CUSTOMER EXPERIMENT (48 h, ≤₪100):** see `ISRAEL_AGENT_WINNER.md`.

**DRY RUN:**
- Setup: Rivhit public demo company (live production API), 1,634-item real catalog, 16 synthetic Hebrew WhatsApp-style messages.
- Attempted 16. Completed 13: 10 orders created and verified line-for-line, 1 amend, 1 cancel, 1 price answer.
- Partial 1: "repeat last order" used session memory instead of ERP history.
- Failed 0. Human judgment 2: correctly routed to the customer as clarifications.
- Not tested: real messages, voice, photos, customer price lists, Priority, Hashavshevet.

**CURRENT COMPETITION:**
- Israeli portals: MagicNet, WideCommerce, Wizcloud shop, Priority Zoom.
- Sales-agent apps: SMB, Comax2Go, SoftSolutions, Rivhit agents app, Pepperi.
- Custom AI agencies: Automaziot and others.
- Global AI order entry: Galo, Plato, Darwin AI, Conexiom, WizCommerce, WayloAI.
- I found no productised Hebrew WhatsApp-to-Hashavshevet/Rivhit/Priority agent.

**BIGGEST RISK:**
- Accuracy on real, messy orders: one wrong SKU means wrong goods on a truck.
- Second risk: ERP-dealer and API friction (Priority screens and API packs, the Hashavshevet H-Connect plugin) and the WhatsApp number migration.

**KILL CRITERIA:**
- Fewer than 3 of 20 identified distributors agree to a shadow-mode trial.
- Shadow-mode line accuracy below 90% after alias learning on 200 real orders.
- More than 15% of messages need a human beyond customer clarification.
- ERP write access costs the customer more than ₪3,000 in dealer fees.

---

## 2. "Store Ops Agent IL": Hebrew WhatsApp agent that executes order actions for Israeli online stores

**ONE-SENTENCE BUSINESS:** An agent answers a store's customers on WhatsApp in Hebrew and actually performs the action. It updates the address before dispatch, cancels and refunds through Grow/HYP/Cardcom with the legally correct fee, issues the credit invoice in Morning/iCount, and re-creates stuck shipments with Israeli couriers.

**CUSTOMER:** Shopify and WooCommerce stores in fashion, home and cosmetics with 300–3,000 orders/month and at least one CS rep.

**ISRAEL-SPECIFIC EDGE:**
- Consumer Protection Law distance-sale cancellation rules (fee of the lower of 5% or ₪100; refund within 14 days).
- Israeli payment gateways, with a credit invoice (חשבונית זיכוי) required alongside each refund.
- Local couriers (Chita/Baldar, HFD, Israel Post) and pickup points.
- WhatsApp-first customers.
- Global AI CS agents (for example Supportify) don't support Hebrew or these rails.

**EXISTING HUMAN LABOR:** "נציג/ת שירות דיגיטלי" at ₪8–10k/month (AllJobs 8753546, 8747067, 8729702, 8731778).

**FULL AGENT LOOP:**
1. **Trigger:** a WhatsApp message, or a courier status poll.
2. **Observe:** the Shopify order, payment transaction and courier status.
3. **Reason:** the intent, plus eligibility under the store policy and the cancellation law.
4. **Act:** refund via gateway API, credit note via Morning, address change or shipment recreation via courier API.
5. **Verify:** refund ID, credit-note number, new tracking number.
6. **Record:** order note.
7. **Wait:** for the customer's reply or the next poll.

**LAST VALUABLE STEP:** money returned with a legal credit document, or a parcel re-dispatched.

**WHY THE AGENT CAN COMPLETE IT:** Grow `refundTransaction` (sandbox), HYP `refundDeal`, the Shopify Admin API and WhatsApp Cloud API are all documented write APIs.

**MARKET SIZE:** 7,963 Israeli Shopify stores (StoreCensus, Oct 2026). About 1,500–3,000 have dedicated CS staff.

**PRICE:** ₪900/month, or ₪6 per resolved case.

**COST TO SERVE:** about ₪100–200/month. Margin about 80%.

**HUMAN TIME:** about 30 minutes/month, plus policy tuning.

**FIRST 100 CUSTOMERS:** the StoreCensus Israel store list (https://api.storecensus.com/stores/country/israel), filtered by category and traffic, cross-checked with AllJobs/Drushim e-commerce CS listings.

**FIRST CUSTOMER EXPERIMENT:**
- Pick 10 Israeli Shopify stores with public WhatsApp CS numbers.
- Record a demo of their real returns policy encoded as rules, run against 10 realistic customer messages.
- Offer a 2-week paid pilot in "draft + one-tap approve" mode at ₪300.

**DRY RUN:**
- Attempted 0 executions. Every action requires a merchant or sandbox account, which the rules forbid creating.
- Only the API documentation was verified.
- **Unproven hands-on.**

**CURRENT COMPETITION:**
- Glassix (inbox + GPT, $49–65/user)
- Datalogics ReturnoAI ($200/month)
- BOA courier apps
- Supportify (no Hebrew)
- Gorgias and Siena-class global AI CS, which could localise

**BIGGEST RISK:** merchants won't delegate refund authority, and a global AI CS player adds Hebrew and Israeli gateway support.

**KILL CRITERIA:**
- Fewer than 2 of 10 stores accept a paid pilot.
- More than 30% of cases need merchant approval after 2 weeks.
- Courier redelivery cannot be triggered by API for the store's main courier.

---

## 3. "Sub-Compliance Clerk": subcontractor insurance-certificate and registry file for main contractors

**ONE-SENTENCE BUSINESS:** For each subcontractor on each project, the agent parses the Israeli standard "אישור קיום ביטוחים" against the contract's insurance appendix and checks the contractor registry. It requests the exact missing codes, limits or dates from the subcontractor's insurance agent, and sets the ERP payment hold until a compliant certificate is on file.

**CUSTOMER:** Main contractors and developers with 20–200 active subcontractors (registry classification ג2–ג5).

**ISRAEL-SPECIFIC EDGE:**
- The Capital Market Authority standard insurance-confirmation form uses closed-list codes (302, 304, 307, 309, 315, 319, 328, 332…), which global certificate-of-insurance tools don't parse.
- The Israeli contractor registry is public through data.gov.il.
- Tender and contract appendices make certificates mandatory.

**EXISTING HUMAN LABOR:** project or office administrators and contract controllers. The work is spread across roles rather than a dedicated job (thin evidence).

**FULL AGENT LOOP:**
1. **Trigger:** a new subcontractor, a nightly expiry scan, or a payment request.
2. **Observe:** parse the certificate (insured party, company ID, coverages, codes, limits, period) and query the registry (branch, group, classification).
3. **Reason:** compare against the contract appendix and the contract value versus the classification.
4. **Act:** send the insurance agent a precise request by email or WhatsApp, and set the ERP vendor hold flag.
5. **Verify:** re-parse the new certificate; confirm the hold was released.
6. **Record:** audit log per subcontractor per project.
7. **Wait:** until 30 or 14 days before expiry.

**LAST VALUABLE STEP:** a compliant certificate on file, and payment released or held correctly.

**WHY THE AGENT CAN COMPLETE IT:**
- Parsing, the registry lookup and the ERP flag are all machine actions.
- The only external dependency is the insurance agent re-issuing the certificate. That is a routine, deterministic request.

**MARKET SIZE:** 1,372 building contractors at ג3–ג5, and 2,851 contractors with any classification ≥2 (data.gov.il registry, live-counted). Realistic buyers: 200–500.

**PRICE:** ₪20/subcontractor/month, minimum ₪600/month.

**COST TO SERVE:** under ₪100/month.

**HUMAN TIME:** about 20 minutes/month.

**FIRST 100 CUSTOMERS:** the registry dataset `4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8`, filtered to classification ≥3. It includes 17,200 contractor emails.

**FIRST CUSTOMER EXPERIMENT:**
- Pick 10 ג4–ג5 contractors from the registry.
- Pull the insurance appendix from one of their public tenders.
- Build a one-page "gap report" template showing what we'd check.
- Offer a one-off audit of their current subcontractor certificates for ₪500.

**DRY RUN:**
- Registry: 15/15 lookups by contractor number succeeded. 0/15 had a company ID (ח.פ.), so matching must use contractor number or name. There is no suspended or frozen status field.
- Certificate: from the IUCC 2026 standard form, extracted 13 coverage codes and 4 limits. Hebrew visual-order extraction broke keyword matching, so a layout-aware LLM pass is needed. The form was a blank template.
- Attempted 16, completed 15, partial 1.

**CURRENT COMPETITION:** insurance brokers (informal, free), construction ERP modules, and global certificate-of-insurance tools that don't fit the Israeli form. No Israeli parser found.

**BIGGEST RISK:**
- Latent pain: nobody feels it until a claim happens.
- Forged certificates can't be verified with insurers.
- The thin job-ad evidence does not meet our "≥5 distinct employers paying for this task" bar for a dedicated role.

**KILL CRITERIA:** none of 10 contractors will pay ₪500 for a one-off audit, or fewer than 30% of the certificates audited have gaps.

---

## 4. "Bedek Desk": warranty-call coordination for residential developers

**ONE-SENTENCE BUSINESS:** Apartment buyers report defects on WhatsApp with photos. The agent checks the warranty period for that item, dispatches the right subcontractor, books the visit with the tenant, and closes the call with a closure photo and tenant confirmation. Every apartment gets a litigation-ready defect log.

**CUSTOMER:** Mid-size residential developers and contractors in the 1–7-year post-handover warranty period.

**ISRAEL-SPECIFIC EDGE:**
- The Sale (Apartments) Law sets statutory warranty periods by item.
- WhatsApp-native buyers.
- Back-to-back subcontractor warranties.
- Mid-size developers run this on Excel and WhatsApp.

**EXISTING HUMAN LABOR:** "רכז/ת בדק", "מזכיר/ת בדק" and "רכז/ת שירות דיירים" (Drushim 37561673, 37967532, 37581965; AllJobs 8708786), at about ₪9–12k/month.

**FULL AGENT LOOP:**
1. **Trigger:** a tenant's WhatsApp message with a photo.
2. **Observe:** identify the apartment, item and handover date.
3. **Reason:** whether the item is within its warranty period; urgency; which subcontractor.
4. **Act:** open the call; WhatsApp the subcontractor; offer the tenant time slots; book.
5. **Verify:** the subcontractor's closure photo plus the tenant's "תוקן" reply.
6. **Record:** the per-apartment log.
7. **Wait:** SLA timers, with escalation.

**LAST VALUABLE STEP:** a visit booked and closure confirmed by the tenant.

**WHY THE AGENT CAN COMPLETE IT:**
- Booking and confirmation are messaging plus calendar writes.
- Only disputed defects go to the developer's engineer.

**MARKET SIZE:** 200–500 developers or contractors with active handovers (from the 1,372 contractors at ג3–ג5).

**PRICE:** ₪1,500/month per developer, or ₪8/apartment/month during the warranty period.

**COST TO SERVE:** about ₪150/month.

**HUMAN TIME:** about 30 minutes/month.

**FIRST 100 CUSTOMERS:** the registry ג3–ג5 list cross-referenced with Drushim/AllJobs bedek listings and with developers' project pages.

**FIRST CUSTOMER EXPERIMENT:**
- Take the 4 employers currently hiring bedek coordinators.
- Prepare a WhatsApp demo flow: tenant photo → booked visit → closure confirmation.
- Offer a 30-day paid pilot on one building at ₪750.

**DRY RUN:** none possible (no data, no system). Attempted 0. **Unproven.**

**CURRENT COMPETITION:** Priority and Salesforce implementations at large developers; construction QA tools (not verified).

**BIGGEST RISK:** large developers have IT departments; mis-triaging an urgent leak; spiky demand.

**KILL CRITERIA:** none of the 4 hiring employers will discuss a pilot, or tenants refuse to talk to an agent (more than 30% ask for a human).

---

## 5. "Safety-Officer Back Office": document operations for traffic-safety officers (Regulation 585)

**ONE-SENTENCE BUSINESS:** For certified transport-safety officers who serve 10–40 trucking or bus clients, the agent keeps every vehicle and driver file complete and ready for a Ministry audit. It chases drivers and garages on WhatsApp for documents, validates them, and tracks registry licence dates through the data.gov.il API. The officer only signs.

**CUSTOMER:** Independent or outsourced safety-officer practices, and trucking firms that employ an officer part-time.

**ISRAEL-SPECIFIC EDGE:**
- Regulation 585 and the Fifteenth Schedule mandate a safety officer for N2+ vehicles.
- The vehicle registry API exposes `tokef_dt` daily.
- Drivers communicate on WhatsApp in Hebrew, Arabic and Russian.

**EXISTING HUMAN LABOR:**
- Safety officers and their admins.
- Part-time listings ("3 days a week"), plus government tenders for external officers (State Comptroller 16/2023) and outsourced firms such as K-Betihut.

**FULL AGENT LOOP:**
1. **Trigger:** calendar dates plus a nightly registry pull.
2. **Observe:** expiring driver and vehicle items.
3. **Reason:** build the task list per client.
4. **Act:** WhatsApp the drivers and garages; collect photos and documents; validate dates and fields; update the file.
5. **Verify:** document fields are valid, and the registry `tokef_dt` has advanced.
6. **Record:** an audit-ready file and a monthly report draft.
7. **Wait:** until the next expiry.

**LAST VALUABLE STEP:** a complete compliance file. The officer's legal sign-off stays human, by design.

**WHY THE AGENT CAN COMPLETE IT:** document collection and validation are messaging plus parsing, and the registry check is a free API.

**MARKET SIZE:**
- About 123k heavy cargo vehicles and 15k buses (data.gov.il). That implies about 3,000+ officer-equivalents at 35 vehicles each.
- Officer firms are uncounted. Realistic buyers: 200–600.

**PRICE:** ₪800/month per officer practice.

**COST TO SERVE:** about ₪100/month.

**HUMAN TIME:** about 30 minutes/month.

**FIRST 100 CUSTOMERS:** Drushim and AllJobs safety-officer listings, plus outsourced safety-officer firms. The Ministry list of certified officers would also help, but its availability is unverified.

**FIRST CUSTOMER EXPERIMENT:**
- Pick 10 safety-officer firms.
- Generate a free registry status report for the publicly visible fleet plates of one of their clients (licence validity, open recalls).
- Offer a paid month at ₪400.

**DRY RUN:**
- 20 company-owned vehicles pulled from the registry. Licence validity read 20/20 and recall lookups ran 20/20.
- Detection and verification completed 20/20. The valuable act (document chasing) was not attempted.

**CURRENT COMPETITION:** Rakavim (app-cars.co.il), Carpro, Netzer by Cello, K-Betihut.

**BIGGEST RISK:** incumbent fleet-compliance software; officers protecting billable admin; driver-licence status access is unverified.

**KILL CRITERIA:** Rakavim or Carpro already does WhatsApp document collection at under ₪300/month, or fewer than 2 of 10 officers will pay ₪400.
