# Experiment #003: Top 10 red team

**Scoring.** Scores come from `ISRAEL_AGENT_LONG_LIST.md`. Each candidate is attacked with the 10 mandatory questions, and I tried to kill each one. "Survives" means no question produced a fatal answer; it does not mean "good".

**Evidence rule.** At least 5 independent pieces of evidence that Israeli businesses pay for this work, listed with URLs. "(snippet)" means the page had expired (410) or was blocked, and the content was seen only in search results.

**Dry-run legend.**
- **A** = attempted
- **C** = completed: action performed and verified
- **P** = partial
- **F** = failed
- **J** = needs human judgment

Raw logs for the dry runs are in the scratchpad and are summarised here.

---

## 1. #13: WhatsApp order intake → ERP for distributors (score 126)

**Evidence of spend (7):**
1. Drushim search "קליטת הזמנות": 127 open listings on 2026-10-05. They include an order clerk in Ariel (shipment documents), an order coordinator in Kfar Masaryk (Priority, price lists), an orders and customer-service rep at JOB SPACE in Lod, and a back-office coordinator at Pro Amkim. https://www.drushim.co.il/jobs/search/קליטת%20הזמנות/
2. Drushim "הקלדת הזמנות": 39 listings. https://www.drushim.co.il/jobs/search/הקלדת%20הזמנות/
3. AllJobs order clerk, Kadima-Zoran: enters orders from agents and customers, creates delivery notes. https://www.alljobs.co.il/m/p/jobs/8832458
4. Drushim order coordinator, Kfar Masaryk (Priority). https://www.drushim.co.il/job/38370978/ed125a84/
5. Drushim order clerk, Ariel (Priority an advantage). https://www.drushim.co.il/job/38496093/7a4f147a/
6. MagicNet sells a B2B ordering portal for Hashavshevet, explicitly as a replacement for WhatsApp and phone order entry. https://www.magicnet.co.il/general-8
7. AllJobs order-entry clerk listings show ₪8,000–9,500/month salaries (snippet). https://www.alljobs.co.il/m/p/jobs/8738146

**Red team:**

| # | Question | Answer |
|---|---|---|
| 1 | Israeli SaaS already doing it? | B2B portals exist: MagicNet, WideCommerce, Wizcloud shop, Priority Zoom. All of them require the *customer* to change behaviour, and kiosk and restaurant owners keep sending WhatsApp. Israeli AI agencies (Automaziot, https://automaziot.ai/en/blog/2026-06-ai-order-taking-whatsapp) build custom WhatsApp→ERP flows in a 2–4 week project. That is agency work, not a product, with no price published and no Israeli ERP named. **Real but not fatal.** |
| 2 | Does Priority or Hashavshevet already do it? | No. Both expose APIs (Priority REST/OData; Hashavshevet H-Connect `IMOVEIN`) but ship no WhatsApp or voice intake. **Risk:** Priority could add an "AI order intake" module. |
| 3 | Cheap international product? | Galo (LatAm, WhatsApp→SAP/Odoo), Darwin AI, Plato (Berlin), Conexiom, WizCommerce, WayloAI. None of them shows Hebrew voice support or connectors to Hashavshevet or Rivhit. They cost far more than ₪150/month. **Not fatal today; the moat is thin.** |
| 4 | Feature, not business? | It is the core job of a paid employee. As a product it could become a feature of an ERP, so retention depends on accuracy and alias learning per distributor. |
| 5 | Is the valuable step human? | No. The valuable step is a correct order in the ERP, and the dry run shows the agent can write and verify it. Clarification goes to the *ordering customer*, not to the owner. |
| 6 | Market too small? | About 500–1,000 realistic targets (estimate, unverified count of distributors). 127 concurrent "order intake" listings show a live paid labour pool. 30 customers × ₪1,500 = ₪45k/month. **Passes.** |
| 7 | Regulation kills it? | No licence needed. The privacy law applies to customer phone numbers (Amendment 13). Proactive messages fall under the anti-spam law, but #13 replies to inbound messages. |
| 8 | API access fake or impractical? | Rivhit was **live-tested**. Priority REST is real, but the customer's admin must enable each screen and API calls are sold in 10k packs (vendor cost). Hashavshevet desktop needs the H-Connect plugin installed by a dealer (support ₪400/hr). WhatsApp: the distributor's number must move to the Cloud API, or use Meta "coexistence" mode (to verify), or a second number. **Real friction; this is the biggest onboarding risk.** |
| 9 | Does the customer pay for this? | Yes. They pay a ₪11–13k/month loaded clerk salary today. |
| 10 | Can we identify and reach buyers? | Yes. Every listing for an order-clerk job is a company that pays for exactly this work, and it is publicly named or nearly so. Other sources: duns100 food wholesale list and the b144 "סיטונאות" categories. |

**Dry run (Rivhit public demo company, live API, doc type 7 = הזמנה):** 16 Hebrew WhatsApp-style messages, synthetic, written against the real 1,634-item demo catalog (building panels and roofing).

| Attempted | Completed (written + read back) | Partial | Failed | Needed judgment |
|---|---|---|---|---|
| 16 | 13 | 1 | 0 | 2 |

- **13 completed:**
  - 10 new orders (documents 1578–1587) were created with `Document.New`, re-read with `Document.Details`, and their lines matched 10/10.
  - Amend: the agent cancelled 1588 and recreated it as 1590 with the extra line; verified `is_cancelled=true` plus the new document.
  - Cancel: verified.
  - Price question: answered from the catalog price list.
- **1 partial:** "כמו בפעם הקודמת" (repeat last order) used session memory rather than an ERP history query. `Customer.OpenDocuments` works and returns the customer's documents and balance, but I did not wire it in.
- **2 needed judgment:** "פאנל קיר 10" doesn't exist in the catalog, and "איסכורית" without a thickness is ambiguous. Both were correctly routed to a clarification question to the *customer*. That is the right behaviour, not a failure.
- **Not tested:**
  - Real messy messages
  - Voice audio
  - Photos of handwritten lists
  - Customer-specific price lists
  - Priority and Hashavshevet writes
- **Unplanned finding:** document number 1589 was skipped because another user wrote to the shared demo at the same time. In production, idempotency keys and read-back are required.

**Verdict: SURVIVES.** Biggest risk: SKU mapping on real data, and ERP-dealer friction.

---

## 2. #46 (+#45): Hebrew WhatsApp operations agent for Israeli online stores: refunds, cancellations, address changes, delivery exceptions (score 116 / 110)

**Evidence (6):**
- E-commerce CS listings:
  - https://www.alljobs.co.il/m/p/jobs/8753546 (fashion; WhatsApp, returns)
  - https://www.alljobs.co.il/m/p/jobs/8747067 (exchanges, returns, shipment tracking)
  - https://www.alljobs.co.il/m/p/jobs/8729702 (credits, cancellations)
  - https://www.alljobs.co.il/m/p/jobs/8731778 (Yavne)
- Glassix (Israeli inbox) at $49–65 per user per month: https://glassix.com/pricing
- Courier integration apps sold to Israeli stores (HFD, Cheetah): https://apps.shopify.com/hfd-integration

**Red team:**
1. **Israeli SaaS?** Glassix offers an inbox plus GPT, without Israeli gateway refund actions. Datalogics sells returns (ReturnoAI, $200/month), and BOA sells shipment creation. Nobody resolves the case end to end in Hebrew.
2. **Shopify/Morning?** Morning issues the credit note but does not handle the conversation.
3. **International?** Supportify does cancellations and refunds but supports no Hebrew. Gorgias and Siena AI could add Hebrew quickly. **This is the most serious threat.**
4. **Feature?** Borderline. Global AI CS platforms will localise.
5. **Human step?** Refund authority. Merchants may insist on one-tap approval, which lowers autonomy to around 60%.
6. **Market?** 7,963 Israeli Shopify stores (StoreCensus, Oct 2026). About 1,500–3,000 have a CS person. OK.
7. **Regulation?** The Consumer Protection Law cancellation rules can be encoded, but a wrong fee calculation creates liability. Privacy law applies.
8. **API?** Grow `refundTransaction` (sandbox) and HYP `refundDeal` docs are verified. Courier APIs (Chita Baldar endpoint, HFD web service) are partly undocumented and need merchant credentials. **Delivery-exception redelivery is sometimes phone-only.**
9. **Pay?** Yes; CS reps cost ₪8–10k/month.
10. **Reach?** Yes, through the StoreCensus Israeli store list.

**Dry run:** not executable. Every write needs a merchant or sandbox account, which the rules forbid creating.
- Attempted 0 actions; documentation verified only.
- Human judgment needed: refund policy edge cases.

**Verdict: SURVIVES, weaker.** No hands-on proof, and global AI CS players are a credible threat.

---

## 3. #2: Allocation numbers for foreign or non-integrated billing stacks (score 114)

**Evidence (4, below the bar):**
- Sovos ITA connector docs: https://docs.sovos.com/indirect-tax/indirect-tax-products/einvoicing/compliance-network/country-setup-guides/israel
- vatit guide: https://vatit.com/fr/e-invoicing-guide/israel/
- e-invoice.app: https://www.e-invoice.app/country/IL
- Priority SOP on cross-system allocation: https://cdn.priority-software.com/docs/SOP_Tax_Authorities_IL_25_0_H.pdf

**Red team:**
1. **Israeli SaaS?** Yes, indirectly. A startup billing from Stripe can simply issue its tax invoice through Morning, iCount or Grow, which request allocation numbers automatically (https://grow.business/israel-invoice/), for about ₪50–100/month. **This cheap workaround performs the loop.**
2. **Enterprise?** Sovos and Avalara-class vendors bundle it.
3. –
4. **Feature?** Yes.
5. –
6. **Market?** Hundreds of entities. Small.
7. **Regulation?** Whether the ITA requires "registered software" for third-party requests is unverified.
8. **API?** Needs ITA developer registration, which we cannot test.
9–10. Weak reach.

**Dry run:** not possible without ITA registration. 0 attempted.

**Verdict: KILLED.** It is a feature, and cheap Israeli invoicing tools already do the loop.

---

## 4. #45: Delivery-exception desk (score 110)

Merged into #2 above as a module. Standalone it fails question 8: redelivery often requires phoning the courier, and courier APIs are undocumented. **Verdict: MERGED** into #46.

---

## 5. #49: Zap.co.il feed and repricing operations (score 104)

**Evidence:**
- Zap lists about 1,500 stores: https://www.zap.co.il/joinzap.aspx
- Zap Feed Generator app: https://apps.shopify.com/zap-feed-generator
- AdTribes Zap feeds: https://adtribes.io/?p=25892
- **Zap's own dynamic pricing service:** https://www.zap.co.il/news.aspx?nid=2363

**Red team:**
- Question 1 is fatal: the platform owner sells the product.
- Question 8: the Zap side is scrape-only, which is ToS risk.

**Verdict: KILLED.**

---

## 6. #27: Back office for traffic-safety officers (Regulation 585) (score 102)

**Evidence (7):**
- Drushim https://www.drushim.co.il/job/38011954/10a50217/ and https://www.drushim.co.il/job/37883039/f844a9aa/ (snippets)
- AllJobs https://www.alljobs.co.il/m/p/jobs/8753351 ("3 days a week"), https://www.alljobs.co.il/m/p/jobs/8813603 and https://www.alljobs.co.il/m/p/jobs/8734629 (snippets)
- State Comptroller tender for an external safety officer: https://www.mevaker.gov.il/he/jobTenders/Tender_621/Michraz-16-2023.pdf
- Outsourced provider K-Betihut

**Red team:**
1. **Israeli SaaS?** Rakavim (https://app-cars.co.il/), Carpro (https://carpro.co.il/) and Netzer target fleets and officers. **Material competition.**
5. **Human step?** The officer's legal sign-off stays human. The agent does the document chasing.
8. **Access?** Driver-licence validity checks need driver consent or the driver's own login (unverified). The vehicle registry API was verified.
9. **Pay?** Officer practices bill clients and may resist tools that shrink billable admin.
10. **Reach?** The Ministry list of certified officers was not verified.

**Dry run:** vehicle registry. I pulled 20 company-owned vehicles from `053cea08-…`.
- `tokef_dt` (licence validity) read 20/20. The lookup by plate was re-verified, and recall-table lookups ran 20/20 (0 open recalls).
- Attempted 20; completed 20 for detection and verification.
- Nothing was attempted for the valuable act (document collection or sign-off).

**Verdict: SURVIVES, marginal.**

---

## 7. #36: Subcontractor compliance file (insurance certificate + contractor registry) (score 102)

**Evidence (5, partly indirect):**
- Tender insurance appendices:
  - Bank of Israel: https://boi.org.il/media/z1yn3udy/נספח-ג2-אישור-ביטוחים.pdf
  - IUCC 2026: https://www.iucc.ac.il/wp-content/uploads/2026/08/אישור-ביטוח-מעודכן-אספקה-ותחזוקה-של-קווי-תקשורת.pdf
  - Haifa University: https://tender.haifa.ac.il/images/havharot_camputers_bituah_2021.pdf
- Construction admin listings: https://www.alljobs.co.il/m/p/jobs/8737580 and https://www.alljobs.co.il/m/p/jobs/8756655
- Note: the job-ad evidence for a *dedicated* role is thin.

**Red team:**
1. **Competition?** No Israeli insurance-certificate parser was found. Insurance brokers do the check informally and free.
3. **International?** Global certificate-of-insurance trackers (myCOI, TrustLayer) cannot parse the Israeli standard form.
4. **Feature?** It is plausibly a feature of construction ERPs (Priority construction verticals).
5. **Human step?** Renewal depends on the subcontractor's insurance agent sending a new certificate. That is a human dependency, although the request itself is deterministic.
6. **Market?** 1,372–2,851 contractors at classification ≥2 (data.gov.il). Realistic buyers: a few hundred.
8. **Access?** The registry API was live-tested. Insurance certificates arrive as PDF only, so authenticity cannot be verified with the insurer (forgery risk).
9. **Pay?** Pain is latent until a claim happens.
10. **Reach?** Excellent: the registry lists 17,200 contractor emails.

**ChatGPT test:** a single certificate check fails the test, because ChatGPT can read one PDF. Ongoing tracking across 100 subcontractors passes.

**Dry run:**
- Registry: 15 subcontractors re-looked-up by contractor number, 15/15 found. All 15 had no company ID (ח.פ.) in the registry, so matching must use contractor number or name. The registry has no suspended or frozen status field.
- Certificate: parsed the IUCC 2026 standard form PDF. It extracted 13 coverage codes (301–347) and 4 limits (₪8M/₪20M). But the Hebrew text comes out in reversed visual order, so plain keyword matching missed "אחריות מעבידים". An LLM pass on the layout is needed. The form was a blank template, not a filled certificate.
- Attempted 16; completed 15; partial 1.

**Verdict: SURVIVES, marginal.** Pain is latent, and the job-ad evidence is thin.

---

## 8. #15: Supplier price-list updater (score 101)

**Evidence (4, below the bar):**
- Drushim 38370978 (price-list maintenance in Priority)
- Konimbo Excel re-import help: https://konimbo.freshdesk.com/support/solutions/articles/4000213163
- Priority forum thread
- No dedicated listings found

**Red team:**
- **ChatGPT test fails:** an owner can upload one Excel file and get the mapping.
- Frequency is weekly or monthly.
- The evidence bar is not met.

**Verdict: KILLED** (as a business; it remains an add-on for #13).

---

## 9. #35: WhatsApp dispatch desk for service companies (score 100)

**Evidence (8):**
- AllJobs https://www.alljobs.co.il/m/p/jobs/8756211, https://www.alljobs.co.il/m/p/jobs/8720662 and https://www.alljobs.co.il/m/p/jobs/8726956
- Drushim https://www.drushim.co.il/job/37466274/474585a2/, https://www.drushim.co.il/job/38185025/a7f6ee87/ and https://www.drushim.co.il/job/37615272/d6025d99/
- Fireberry pricing: https://www.fireberry.com/pricing
- Israeli WhatsApp bot vendors at ₪179–645/month: https://achiya-automation.com/en/blog/whatsapp-bot-providers-israel-2026/

**Red team:**
1. **Competition?** Fireberry plus Gambot, Automatix and similar can be assembled cheaply. "Book a slot" is commoditised.
4. **Feature?** Largely, yes.
5. **Human step?** Technician assignment trade-offs, such as an urgent customer versus route efficiency, often need the owner.
8. **Access?** Many firms run on Excel or paper, so there is no system to write to.
- Spend is real.

**Dry run:** no field-service sandbox available. The booking write is analogous to #13. 0 attempted.

**Verdict: SURVIVES, weak.** It is the runner-up to #37 for the field-service slot.

---

## 10. #37: Developer bedek (warranty) coordination (score 100)

**Evidence (5):**
- Drushim https://www.drushim.co.il/job/37561673/572513f0/ (Ramat Gan real-estate company), https://www.drushim.co.il/job/37967532/0065ff10/ (Netanya contractor) and https://www.drushim.co.il/job/37581965/672e64ce/ (Raanana developer) (snippets)
- AllJobs https://www.alljobs.co.il/m/p/jobs/8708786
- Amidar's government equivalent: https://www.gov.il/he/service/amidar_apartment_maintenance_request

**Red team:**
1. **Israeli SaaS?** Construction QA and handover tools were not verified (search cap). Large developers run Priority or Salesforce implementations.
4. **Feature?** Possibly a CRM module.
5. **Human step?** Disputed "is this a defect?" calls need an engineer. Routine calls do not.
6. **Market?** 200–500 developers or contractors handing over buildings. Small but concentrated, with high ARPU.
7. **Regulation?** Warranty periods under the Sale (Apartments) Law. Applying the statutory period table is administrative; disputes need a lawyer or engineer.
8. **Access?** WhatsApp plus the developer's CRM, often Excel.
9. **Pay?** Yes, they pay coordinator salaries.
10. **Reach?** Registry classifications ג3–ג5 (1,372) plus listings.

**Dry run:** none possible (no data). 0 attempted.

**Verdict: SURVIVES, unproven.**

---

## Red-team summary

| # | Candidate | Verdict | Why |
|---|---|---|---|
| 13 | WhatsApp order intake → ERP | **Survives (strongest)** | Paid clerk pool; agent wrote and verified orders on a live Israeli ERP API |
| 46+45 | Store ops agent (refund, cancel, exceptions) | Survives | Verified gateway refund APIs; no hands-on test; global AI CS threat |
| 36 | Subcontractor compliance | Survives, marginal | Strong Israel edge and reach; latent pain |
| 37 | Bedek coordination | Survives, unproven | Real roles; no dry run |
| 27 | Safety-officer back office | Survives, marginal | Mandated work; competitors; access gaps |
| 35 | Service dispatch | Survives, weak | Commoditised |
| 2 | Allocation numbers for foreign stacks | Killed | Morning, iCount and Grow already do it cheaply |
| 49 | Zap repricing | Killed | Platform sells it |
| 15 | Price-list updater | Killed | ChatGPT test; evidence bar |
| 45 | Delivery exceptions | Merged into 46 | Phone-only last step |
