# Experiment #003: Winner

## The mandatory question

> You are in Israel with ₪100, no audience, 48 hours, and must convince one unrelated Israeli business to pay real money. Which ONE do you choose?

**Choice: #13, WhatsApp order intake → ERP for B2B distributors ("Pkidat Hazmanot AI").**

This is a winner with conditions. It is the only candidate that clears all four bars at once:

1. **Paid human labour that can be found today.** 127 concurrent Drushim listings for "קליטת הזמנות" and 39 for "הקלדת הזמנות". Clerks cost ₪8–9.5k/month gross. Each listing names, or nearly names, a company that is paying for exactly this job.
2. **The agent performs the valuable step.** It writes a correct sales order into an Israeli ERP and verifies it by reading it back. This was shown on a live API, not taken from documentation: in the Rivhit demo company, 13 of 16 messages were fully executed and verified, with 0 failures.
3. **The Israeli constraint creates the gap.**
   - Hebrew voice notes, slang and handwritten photos.
   - Hashavshevet, Rivhit and Priority-IL as the systems of record.
   - Small buyers refuse portals.
   - Global AI order-entry tools don't connect to these ERPs or handle Hebrew.
4. **A buyer list exists before any outreach:** job listings, the duns100 wholesale list, b144 categories, and the B2B portals' customer references.

**Why the runners-up lost:**
- **Store ops agent (#46):** no hands-on proof was possible, and global AI customer-service tools are close to adding Hebrew.
- **Subcontractor compliance (#36):** the pain is latent and the job-ad evidence is thin.
- **Bedek desk (#37):** no dry run was possible.
- **Safety-officer back office (#27):** incumbent fleet software, and access gaps.

## What it does

A distributor's customers keep sending WhatsApp exactly as they do today. The agent then:
1. Identifies the customer by phone.
2. Transcribes voice and reads photos.
3. Maps the lines to SKUs using that customer's own history and aliases.
4. Creates the sales order through the ERP API and reads it back.
5. Sends a Hebrew confirmation.
6. Asks the *customer*, not the owner, one question when something is ambiguous.
7. Handles "add", "cancel" and "same as last time".

The clerk's queue shrinks to the low-confidence remainder.

## Dry-run evidence (what was actually done)

**Setup:**
- Rivhit public demo company: vendor-published token, production API, 1,634 real catalog items, 3,699 customers. I created no account.
- 16 Hebrew WhatsApp-style messages, synthetic and written in contractor and kiosk style, against the building-supply part of that catalog.

**Results:**

| Result | Count | Detail |
|---|---|---|
| Completed | 13 | 10 new orders (docs 1578–1587). Each line was re-read with `Document.Details` and matched 10/10. One amend (cancel #1588 and recreate as #1590), verified `is_cancelled=true`. One cancel, verified. One price question, answered from the catalog. |
| Partial | 1 | "כמו בפעם הקודמת" was handled from session memory instead of an ERP history query. The ERP does expose `Customer.OpenDocuments`. |
| Failed | 0 | – |
| Clarification | 2 | A non-existent "פאנל קיר 10" and an "איסכורית" order without a thickness. Both correctly became a question to the customer. |

**Side finding:** a document number was skipped (#1589) because another user wrote to the shared demo concurrently. Production needs idempotency and read-back verification, which the loop already does.

**Not yet tested, and the real risk:**
- Real customer messages, voice audio and handwritten photos.
- Customer-specific price lists.
- Priority and Hashavshevet write paths. Their APIs are documented and verified on paper only.

## 48-hour first-dollar experiment (≤₪100)

Nothing in this experiment was executed by me: no contact, no accounts, no spend. It is the plan for the founder.

**Hours 0–6: build the list (₪0)**
- Pull 20 distributors from current Drushim and AllJobs listings for order-intake jobs ("קליטת/הקלדת הזמנות", "פקיד/ת הזמנות", "מתאם/ת הזמנות"). Skip anonymous recruiter listings.
- Add names from the duns100 food and drink wholesale ranking.
- For each, note the ERP named in the listing (Priority, Hashavshevet or Rivhit) and any public catalog or price list on their website.

**Hours 6–20: build the personalised proof (₪0–50)**
- For the 3 best targets, take their *public* catalog and write 10 orders in their customers' style. Record 3 as voice notes in Hebrew.
- Run them through the same loop as the dry run, into the Rivhit demo or an ERP-format CSV import file for Priority or Hashavshevet.
- Record a 90-second screen video: voice note in, order in the ERP, Hebrew confirmation out.
- Cost is LLM and transcription API usage, about ₪20–50.

**Hours 20–40: the offer (₪0)**
- Reach the operations manager or owner through the contact on the job listing or the company website.
- Offer:

  > "You're hiring someone to type WhatsApp orders. Send us yesterday's WhatsApp orders: a chat export plus voice notes, with customer numbers redacted if you prefer. Within 4 hours we return them as ready-to-import orders for your ERP, with an accuracy report. If it's 95%+ correct, start a 30-day pilot: ₪750, paid up front by Bit or bank transfer, and refunded if accuracy drops below 95%."

- **The first payment is the ₪750 pilot.** The pilot first runs in shadow mode, producing an import file the clerk approves, then switches to direct API writes.

**Hours 40–48: deliver and collect**
- Run the free accuracy test for anyone who sends data.
- Ask for the ₪750 the same day the accuracy report lands.

**Budget:** ₪20–50 of API usage, plus ₪50 for an optional prepaid SIM for a dedicated WhatsApp test number. Total ≤ ₪100.

**Success criterion:** one distributor pays ₪750 within 7 days.

**Kill criteria:**
- Fewer than 3 of 20 distributors agree to the free accuracy test.
- Accuracy below 90% on their real data.
- Their ERP dealer quotes more than ₪3,000 to enable API write access.

**Privacy note:** a chat export contains the distributor's customers' personal data. Use a simple data-processing letter, delete the data after the test, and accept redacted exports.

## Biggest risk

**Accuracy on real, messy Hebrew orders.** Examples: "the usual + 2 of the white one", voice notes recorded in a truck, and photos of handwritten lists. A wrong SKU means wrong goods on a truck, and trust goes with it.

**Second risk:** onboarding friction in the ERP and WhatsApp layer:
- Priority screen and API enablement, and API-call packs.
- Hashavshevet H-Connect installation by a dealer.
- Moving the ordering number to the WhatsApp Cloud API. Meta's "coexistence" mode might avoid this, but it is unverified.

**Strategic risk:** a local AI agency productises this, or Priority ships native AI order intake. The moat is per-customer alias memory plus Hashavshevet and Rivhit connectors, which is real but thin.

## Overall score: 6.5 / 10

- **Strong:** existing spend, a last step the agent completes and verifies, frequency, retention, and buyer reachability.
- **Weak:** the distributor count is unverified (an estimate of about 500–1,000), the moat is moderate, and the work on real data is unproven.
- It earns "winner" only because it is the one candidate with both paid-labour evidence and a hands-on act-and-verify loop. It should be killed quickly if the 48-hour accuracy test on real orders fails.
