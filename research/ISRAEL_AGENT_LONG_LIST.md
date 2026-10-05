# Experiment #003: Israel agent-native business long list (55 candidates)

Date: 2026-10-05. Research method: five parallel research passes, one per industry cluster, then a consolidation and live dry runs.

- **Clusters:** accounting/payments; distributors/food/import; fleet/government/municipal; construction/property/trades; e-commerce/clinics/professional offices.

- **Search:** about 200 WebSearch calls (the session cap, which was reached), roughly 120 page fetches, and direct API tests against data.gov.il and the Rivhit demo API.

- **Rules followed:** we contacted no one, spent no money and created no accounts. The Rivhit demo is a public, vendor-provided test company.

- **Caveat:** Drushim and AllJobs job pages expire fast (HTTP 410), so some job evidence was seen only in search snippets.

- **Blocked sources:** gov.il blocks automated clients (Cloudflare 403), so official gov.il service pages are cited by URL but were not read in full.

## Scoring

Positive dimensions score 1–10, where 10 is best. Penalty dimensions also score 1–10, but there **10 is worst**.

```
SCORE = 2·PAIN + 2·EXISTING_SPEND + 2·ISRAEL_ADV + 3·LAST_MILE + 2·VERIFIABILITY
      + FREQUENCY + REACHABILITY + WTP + MARGIN + RETENTION + BUILD_SPEED
      − COMPETITION − LEGAL_RISK − PLATFORM_RISK − HUMAN_DEP
```

Score range: 17 → 170 before penalties; at most −40 from penalties.

Hard kills are applied on top of the score:

- A product costing ₪50–150/month that already performs the entire loop.

- The valuable step requires a licensed professional or a physical act.

## Ranking

| Rank | # | Candidate | Score | Status |
|---|---|---|---|---|
| 1 | 13 | WhatsApp order intake → ERP for distributors | 126 | → TOP 10 |
| 2 | 46 | Hebrew WhatsApp CS agent executing order actions (refund/cancel/address) | 116 | → TOP 10 |
| 3 | 2 | Allocation numbers for foreign/non-integrated billing (NetSuite/Stripe/Xero) | 114 | → TOP 10 |
| 4 | 45 | Delivery-exception desk for Israeli online stores | 110 | → TOP 10 |
| 5 | 14 | Missed-order reorder nudges (module on #13) | 108 | MERGED into #13 |
| 6 | 48 | Multi-courier shipment creation | 105 | KILLED: ₪30–150 apps already do the whole loop |
| 7 | 49 | Zap.co.il feed & repricing ops | 104 | KILLED in red team: Zap sells repricing, scrape-only |
| 8 | 27 | Back office for traffic-safety officers (Reg. 585) | 102 | → TOP 10 |
| 9 | 36 | Subcontractor compliance file (insurance cert + registry) | 102 | → TOP 10 |
| 10 | 15 | Supplier price-list updater | 101 | → TOP 10 |
| 11 | 6 | Supplier-invoice intake/OCR into Hashavshevet/Rivhit | 100 |  |
| 12 | 10 | Section-46 donation receipts with allocation | 100 |  |
| 13 | 35 | WhatsApp dispatch desk for service companies | 100 | → TOP 10 |
| 14 | 37 | Developer bedek (warranty) call coordination | 100 | → TOP 10 |
| 15 | 47 | Returns & exchanges ops | 99 |  |
| 16 | 1 | Supplier allocation-number guard (AP side) | 95 |  |
| 17 | 9 | Failed standing-order / card-debit recovery | 95 |  |
| 18 | 18 | Distributor WhatsApp collections | 94 |  |
| 19 | 50 | Insurance agency renewals back office | 94 |  |
| 20 | 38 | Building-management resident dispatch | 93 |  |
| 21 | 3 | Bank-transfer → receipt matcher | 92 |  |
| 22 | 17 | Distributor consolidated invoicing / delivery-note closer | 91 |  |
| 23 | 21 | Import shipment document & ETA chaser | 91 |  |
| 24 | 4 | B2B WhatsApp dunning + payment link + receipt | 90 | KILLED: iCount נודניק / Morning / Gaviti |
| 25 | 16 | Restaurant invoice audit + credit-note claims | 90 |  |
| 26 | 7 | Month-end missing-documents chaser for bookkeeping offices | 87 |  |
| 27 | 11 | Outsourced bank reconciliation | 86 |  |
| 28 | 28 | Toll-road invoice reconciliation & driver charge-back | 86 |  |
| 29 | 12 | Seller-side delayed/refused allocation handler | 85 |  |
| 30 | 42 | Cleaning-company shift replacement & hours | 85 |  |
| 31 | 24 | Fleet ticket transfer (הסבת דוחות) for owned fleets | 83 |  |
| 32 | 41 | Rent collection for small property managers | 83 |  |
| 33 | 39 | Building periodic-inspection calendar | 82 |  |
| 34 | 43 | Trades quote-to-cash follow-up | 82 |  |
| 35 | 5 | Credit-card clearing reconciliation & fee audit | 81 | KILLED: 6+ Israeli vendors |
| 36 | 8 | Withholding-tax & ניהול ספרים certificate management | 81 | KILLED: free ITA מערכת 1000 + built-in ERP |
| 37 | 26 | Fleet compliance (license/test/recalls) on registry API | 81 |  |
| 38 | 29 | Construction-equipment (צמ"ה) license compliance | 81 |  |
| 39 | 23 | Kitchen reorder agent (buyer side) | 80 |  |
| 40 | 55 | Studio renewals & failed payments | 78 | KILLED: Arbox/Boostapp |
| 41 | 20 | Delivery-platform payout reconciliation | 77 |  |
| 42 | 25 | Ticket back office for small rental/subscription fleets | 75 |  |
| 43 | 31 | Arnona admin for multi-branch chains | 75 |  |
| 44 | 52 | Execution Office (הוצל"פ) file operations | 74 | KILLED: lawyer smart card |
| 45 | 53 | Net HaMishpat decision/deadline monitor | 74 |  |
| 46 | 22 | Import regulatory paperwork (SII / European route) | 73 |  |
| 47 | 33 | Public-tender monitoring + bid pack | 73 |  |
| 48 | 51 | Har HaBituach / Mislaka data pulls | 72 |  |
| 49 | 30 | Parking-ticket dispute agent | 71 |  |
| 50 | 34 | Public-vehicle (taxi/minibus) compliance | 71 |  |
| 51 | 44 | Garage WhatsApp front desk | 71 |  |
| 52 | 32 | Business-licensing renewal tracker | 70 |  |
| 53 | 54 | Paramedical clinic kupot-commitment tracking | 68 |  |
| 54 | 40 | Tenant-change holder admin (arnona/water) | 67 |  |
| 55 | 19 | Wolt/10bis/Cibus/Mishloha menu & stock sync | 64 | KILLED: closed partner APIs |

Note on the Top-10 cut: by raw score, #48 (multi-courier shipment creation) and #14 (missed-order nudges) were above the cut. #48 was removed by the hard-kill rule. #14 is a module of #13, so it was merged into it. Their places went to #15 and #35/#37. #6 and #10 tie with #35 and #37; #6 lost the tie because OCR competition is heavy, and #10 because nonprofits show low willingness to pay.


---

## Candidate details

### #1 — Supplier allocation-number guard (AP side)  (score 95)

- **CUSTOMER:** Bookkeeping offices; mid-size B2B buyers with 50–500 supplier invoices/mo
- **CURRENT HUMAN JOB:** AP clerk / bookkeeper checks each invoice >₪5k for a valid מספר הקצאה, chases supplier, excludes from VAT input if missing
- **EXISTING SPEND:** AP/bookkeeper listings (Drushim 37432739, 37766265; AllJobs 8756685, 8832062); Midrag bookkeeping ₪600–4,000/mo; FinBot sells allocation-number checking to CPAs; Sovos sells ITA compliance
- **ISRAEL-SPECIFIC REASON:** Unique ITA regime; threshold fell ₪25k→₪20k→₪10k→₪5k (1 Jun 2026); missing number = lost 18% input VAT
- **TRIGGER:** Purchase invoice arrives (email/WhatsApp/ERP)
- **AGENT LOOP:** Extract VAT ID/amount/number → threshold check → verify via ITA service/ERP → if invalid, templated Hebrew request to supplier → re-verify corrected invoice → write number into ERP → chase every 2–3 days
- **LAST VALUABLE STEP:** Valid number recorded before VAT filing
- **CAN AGENT COMPLETE IT?:** Partly: verification yes; correction depends on supplier issuing a new number
- **VERIFICATION:** ITA 'הותר' status
- **FREQUENCY:** Daily
- **AUTONOMY %:** 60%
- **HUMAN TIME / customer / month:** 20 min
- **ACCESS METHOD:** ITA developer API (registration, 90-day token) / Hashavshevet & Priority built-in right-click verify; gov.il verify service needs business login
- **COMPETITION:** Hashavshevet & Priority built-in verify/retrieve; FinBot (fin-bot.co.il); invoicing vendors
- **MARKET SIZE:** Tens of thousands of buyers, but bought via ~7–10k bookkeeping offices
- **CUSTOMER SOURCE:** Bookkeeping office directories; Midrag; ICPAS lists
- **EXPECTED PRICE:** ₪400–1,500/office
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No (ongoing), but ERP already does verify
- **DRY-RUN RESULT:** Docs only: ITA sandbox needs registration (not allowed); Rivhit API exposes Document.InvoiceApproval (seller side)
- **BIGGEST RISK:** ERP vendors close the gap free; supplier dependency
- **SCORES:** PAIN 7, EXISTING_SPEND 5, ISRAEL_ADV 10, LAST_MILE 5, VERIFIABILITY 9, FREQUENCY 9, REACHABILITY 6, WTP 5, MARGIN 8, RETENTION 6, BUILD_SPEED 6, COMPETITION(−) 7, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 6

### #2 — Allocation numbers for foreign/non-integrated billing (NetSuite/Stripe/Xero)  (score 114)

- **CUSTOMER:** Israeli subsidiaries & startups invoicing Israeli B2B customers from global tools
- **CURRENT HUMAN JOB:** Finance clerk requests number on ITA portal per invoice, pastes, re-sends
- **EXISTING SPEND:** Sovos ITA connector docs; vatit & e-invoice.app guides; Priority SOP notes cross-system allocation gap
- **ISRAEL-SPECIFIC REASON:** Global billing tools have no ITA connector
- **TRIGGER:** Invoice finalised in NetSuite/Stripe
- **AGENT LOOP:** Read buyer VAT ID/amount → request number via ITA API → write to custom field, regenerate PDF → handle delay path
- **LAST VALUABLE STEP:** Number on invoice
- **CAN AGENT COMPLETE IT?:** Yes, if ITA permits third-party software for the customer
- **VERIFICATION:** ITA approval response
- **FREQUENCY:** Per invoice
- **AUTONOMY %:** 90%
- **HUMAN TIME / customer / month:** 10 min
- **ACCESS METHOD:** ITA API (requires registered developer/software — unverified for a service provider)
- **COMPETITION:** Sovos, Avalara-class, Israeli integrators
- **MARKET SIZE:** Hundreds–low thousands of entities
- **CUSTOMER SOURCE:** LinkedIn finance roles at Israeli subsidiaries
- **EXPECTED PRICE:** ₪800–2,000
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not testable without ITA registration
- **BIGGEST RISK:** Software-registration requirement; enterprise vendors bundle it
- **SCORES:** PAIN 8, EXISTING_SPEND 5, ISRAEL_ADV 10, LAST_MILE 8, VERIFIABILITY 10, FREQUENCY 7, REACHABILITY 4, WTP 8, MARGIN 8, RETENTION 9, BUILD_SPEED 5, COMPETITION(−) 5, LEGAL_RISK(−) 5, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 2

### #3 — Bank-transfer → receipt matcher  (score 92)

- **CUSTOMER:** Service SMBs on Morning/iCount/Rivhit with 30–300 transfers/mo
- **CURRENT HUMAN JOB:** Owner/bookkeeper reads statement, guesses payer, issues קבלה
- **EXISTING SPEND:** Bookkeeper listings with 'התאמות בנקים'; SUMIT bank sync; Morning digital payments
- **ISRAEL-SPECIFIC REASON:** Hebrew bank descriptors; Bit/PayBox poor payer data; receipt is a legal doc in local systems
- **TRIGGER:** New bank credit
- **AGENT LOOP:** Fuzzy-match to open invoice → issue receipt via API → confirm doc number
- **LAST VALUABLE STEP:** Receipt issued
- **CAN AGENT COMPLETE IT?:** Yes (accounting APIs verified)
- **VERIFICATION:** Doc number + invoice closed
- **FREQUENCY:** Daily
- **AUTONOMY %:** 80%
- **HUMAN TIME / customer / month:** 15 min
- **ACCESS METHOD:** Morning/iCount/Rivhit APIs; bank data needs ISA-licensed aggregator (FeezBack/Finanda) or uploads
- **COMPETITION:** SUMIT sync, payment links remove need
- **MARKET SIZE:** Low thousands paying
- **CUSTOMER SOURCE:** Morning/iCount user base
- **EXPECTED PRICE:** ₪150–400
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** Partly
- **DRY-RUN RESULT:** Not run (no bank feed)
- **BIGGEST RISK:** Bank-data licensing; platforms build natively
- **SCORES:** PAIN 6, EXISTING_SPEND 5, ISRAEL_ADV 6, LAST_MILE 8, VERIFIABILITY 8, FREQUENCY 9, REACHABILITY 6, WTP 4, MARGIN 6, RETENTION 7, BUILD_SPEED 7, COMPETITION(−) 7, LEGAL_RISK(−) 5, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 3

### #4 — B2B WhatsApp dunning + payment link + receipt  (score 90)

- **CUSTOMER:** B2B SMBs with 20–200 open invoices
- **CURRENT HUMAN JOB:** Collections clerk (פקיד/ת גבייה)
- **EXISTING SPEND:** AllJobs 8762477, 8752920, 8744884; Drushim 37243404
- **ISRAEL-SPECIFIC REASON:** WhatsApp norm; Hebrew tone
- **TRIGGER:** Invoice overdue
- **AGENT LOOP:** Reminder + link → payment webhook → receipt → escalate
- **LAST VALUABLE STEP:** Money collected + receipt
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** Payment webhook
- **FREQUENCY:** Daily
- **AUTONOMY %:** 85%
- **HUMAN TIME / customer / month:** 15 min
- **ACCESS METHOD:** WhatsApp Cloud API, Morning/iCount, Grow/Cardcom
- **COMPETITION:** iCount נודניק, Morning reminders, Gaviti, Otomation, AUTOMATIX ₪500/mo
- **MARKET SIZE:** Thousands
- **CUSTOMER SOURCE:** Invoicing user bases
- **EXPECTED PRICE:** ₪200–600
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Whole loop already exists cheaply
- **SCORES:** PAIN 7, EXISTING_SPEND 6, ISRAEL_ADV 5, LAST_MILE 6, VERIFIABILITY 9, FREQUENCY 8, REACHABILITY 7, WTP 5, MARGIN 7, RETENTION 6, BUILD_SPEED 8, COMPETITION(−) 9, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 6
- **STATUS:** KILLED: iCount נודניק / Morning / Gaviti

### #5 — Credit-card clearing reconciliation & fee audit  (score 81)

- **CUSTOMER:** Retailers/restaurants
- **CURRENT HUMAN JOB:** Bookkeeper matches card deposits/fees
- **EXISTING SPEND:** Hyp, Pelecard, Tranzila Finance, Credit4Control, CreditMatch, SUMIT all sell it
- **ISRAEL-SPECIFIC REASON:** Isracard/Max/Cal specifics
- **TRIGGER:** Deposit file
- **AGENT LOOP:** Match → flag fee overcharge → dispute
- **LAST VALUABLE STEP:** Dispute with acquirer
- **CAN AGENT COMPLETE IT?:** Partly (browser)
- **VERIFICATION:** Deposit matches
- **FREQUENCY:** Daily
- **AUTONOMY %:** 50%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** Acquirer portals/files
- **COMPETITION:** 6+ Israeli vendors
- **MARKET SIZE:** Thousands
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪200–500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run — killed
- **BIGGEST RISK:** Crowded
- **SCORES:** PAIN 6, EXISTING_SPEND 8, ISRAEL_ADV 7, LAST_MILE 4, VERIFIABILITY 7, FREQUENCY 9, REACHABILITY 5, WTP 5, MARGIN 6, RETENTION 8, BUILD_SPEED 4, COMPETITION(−) 10, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 5
- **STATUS:** KILLED: 6+ Israeli vendors

### #6 — Supplier-invoice intake/OCR into Hashavshevet/Rivhit  (score 100)

- **CUSTOMER:** Bookkeeping offices
- **CURRENT HUMAN JOB:** הקלדת חשבוניות
- **EXISTING SPEND:** Bookkeeper listings; Midrag pricing
- **ISRAEL-SPECIFIC REASON:** Hebrew invoices; Hashavshevet desktop
- **TRIGGER:** Invoice photo
- **AGENT LOOP:** OCR → classify → post → allocation check
- **LAST VALUABLE STEP:** Posted entry
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** Read-back
- **FREQUENCY:** Daily
- **AUTONOMY %:** 80%
- **HUMAN TIME / customer / month:** 20 min
- **ACCESS METHOD:** H-Connect / Wizcloud / Rivhit APIs
- **COMPETITION:** Eshkol PrioriOcr, SPS, InvoiScan, Invoice4u, Menahel4U, TaskAutomation
- **MARKET SIZE:** Thousands of offices
- **CUSTOMER SOURCE:** Office directories
- **EXPECTED PRICE:** ₪300–1,000
- **COST TO SERVE:** Med
- **CHATGPT TEST (could one upload give 80%?):** Partly
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** OCR commoditised
- **SCORES:** PAIN 8, EXISTING_SPEND 7, ISRAEL_ADV 7, LAST_MILE 7, VERIFIABILITY 7, FREQUENCY 10, REACHABILITY 6, WTP 5, MARGIN 6, RETENTION 8, BUILD_SPEED 6, COMPETITION(−) 8, LEGAL_RISK(−) 2, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 5

### #7 — Month-end missing-documents chaser for bookkeeping offices  (score 87)

- **CUSTOMER:** Offices with 50–300 small clients
- **CURRENT HUMAN JOB:** Bookkeeper messages clients for statements/invoices before VAT
- **EXISTING SPEND:** Achiya Automation sells reminders; Midrag
- **ISRAEL-SPECIFIC REASON:** VAT cadence (15th/19th), WhatsApp
- **TRIGGER:** Calendar
- **AGENT LOOP:** Checklist → WhatsApp request → classify received files → completeness vs bank debits → file → chase
- **LAST VALUABLE STEP:** Complete document set
- **CAN AGENT COMPLETE IT?:** Only if client sends — human dependency
- **VERIFICATION:** File checklist
- **FREQUENCY:** Monthly
- **AUTONOMY %:** 50%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** WhatsApp API, Drive
- **COMPETITION:** Generic automation shops
- **MARKET SIZE:** Thousands
- **CUSTOMER SOURCE:** Office directories
- **EXPECTED PRICE:** ₪300–900
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Client responsiveness is the bottleneck
- **SCORES:** PAIN 8, EXISTING_SPEND 5, ISRAEL_ADV 6, LAST_MILE 4, VERIFIABILITY 6, FREQUENCY 8, REACHABILITY 7, WTP 5, MARGIN 8, RETENTION 8, BUILD_SPEED 8, COMPETITION(−) 5, LEGAL_RISK(−) 1, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 8

### #8 — Withholding-tax & ניהול ספרים certificate management  (score 81)

- **CUSTOMER:** Payers with many suppliers
- **CURRENT HUMAN JOB:** Update supplier withholding rates
- **EXISTING SPEND:** ITA מערכת 1000 free; built into Hashavshevet/Priority/Rivhit
- **ISRAEL-SPECIFIC REASON:** Israeli rules
- **TRIGGER:** Payment run
- **AGENT LOOP:** Query → update rate
- **LAST VALUABLE STEP:** Rate updated
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** —
- **FREQUENCY:** Monthly
- **AUTONOMY %:** 95%
- **HUMAN TIME / customer / month:** —
- **ACCESS METHOD:** System 1000 file
- **COMPETITION:** Free & built-in
- **MARKET SIZE:** —
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪0
- **COST TO SERVE:** —
- **CHATGPT TEST (could one upload give 80%?):** —
- **DRY-RUN RESULT:** Killed in research
- **BIGGEST RISK:** Free incumbent
- **SCORES:** PAIN 3, EXISTING_SPEND 3, ISRAEL_ADV 9, LAST_MILE 8, VERIFIABILITY 9, FREQUENCY 5, REACHABILITY 4, WTP 2, MARGIN 7, RETENTION 6, BUILD_SPEED 7, COMPETITION(−) 10, LEGAL_RISK(−) 2, PLATFORM_RISK(−) 7, HUMAN_DEP(−) 3
- **STATUS:** KILLED: free ITA מערכת 1000 + built-in ERP

### #9 — Failed standing-order / card-debit recovery  (score 95)

- **CUSTOMER:** Gyms, kindergartens, associations, subscriptions
- **CURRENT HUMAN JOB:** Clerk chases returned debits, re-charges, issues receipt
- **EXISTING SPEND:** AllJobs 8744884 (standing orders); SUMIT/Grow/Cardcom recurring
- **ISRAEL-SPECIFIC REASON:** מס"ב return codes; Hebrew WhatsApp
- **TRIGGER:** Failed-charge webhook / return file
- **AGENT LOOP:** Message payer with new link → payment → receipt
- **LAST VALUABLE STEP:** Money recovered
- **CAN AGENT COMPLETE IT?:** Yes for cards; bank returns need bank access
- **VERIFICATION:** Gateway webhook
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 75%
- **HUMAN TIME / customer / month:** 15 min
- **ACCESS METHOD:** Gateway APIs; bank return files hard
- **COMPETITION:** Gateways retry natively
- **MARKET SIZE:** Thousands
- **CUSTOMER SOURCE:** Studio/kindergarten directories
- **EXPECTED PRICE:** ₪300–800 or % recovered
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Payment platforms add it
- **SCORES:** PAIN 7, EXISTING_SPEND 5, ISRAEL_ADV 6, LAST_MILE 7, VERIFIABILITY 9, FREQUENCY 7, REACHABILITY 7, WTP 6, MARGIN 7, RETENTION 7, BUILD_SPEED 6, COMPETITION(−) 6, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 5

### #10 — Section-46 donation receipts with allocation  (score 100)

- **CUSTOMER:** Nonprofits
- **CURRENT HUMAN JOB:** Issue donation receipts, collect donor ID
- **EXISTING SPEND:** Priority SOP notes sec. 46 receipts; Rivhit returns donation receipt number
- **ISRAEL-SPECIFIC REASON:** Sec. 46 digital reporting
- **TRIGGER:** Donation credit
- **AGENT LOOP:** Identify donor → ask ID on WhatsApp → issue receipt → send
- **LAST VALUABLE STEP:** Valid receipt
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** Receipt number
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 80%
- **HUMAN TIME / customer / month:** 10 min
- **ACCESS METHOD:** Morning/iCount/Rivhit APIs
- **COMPETITION:** Donation platforms bundle receipts
- **MARKET SIZE:** Thousands
- **CUSTOMER SOURCE:** GuideStar Israel
- **EXPECTED PRICE:** ₪200–600
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Low WTP
- **SCORES:** PAIN 6, EXISTING_SPEND 4, ISRAEL_ADV 9, LAST_MILE 8, VERIFIABILITY 9, FREQUENCY 7, REACHABILITY 6, WTP 4, MARGIN 7, RETENTION 8, BUILD_SPEED 6, COMPETITION(−) 6, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 4

### #11 — Outsourced bank reconciliation  (score 86)

- **CUSTOMER:** Bookkeeping offices
- **CURRENT HUMAN JOB:** התאמות בנקים
- **EXISTING SPEND:** Nearly every bookkeeper listing
- **ISRAEL-SPECIFIC REASON:** Hebrew statements
- **TRIGGER:** Month end
- **AGENT LOOP:** Match → residual questions to client
- **LAST VALUABLE STEP:** Reconciled ledger
- **CAN AGENT COMPLETE IT?:** Partly
- **VERIFICATION:** Balanced
- **FREQUENCY:** Monthly
- **AUTONOMY %:** 60%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** Uploads; desktop ERP
- **COMPETITION:** Hashavshevet auto-match, SUMIT
- **MARKET SIZE:** Thousands
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪300–800
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Commoditised
- **SCORES:** PAIN 6, EXISTING_SPEND 6, ISRAEL_ADV 6, LAST_MILE 6, VERIFIABILITY 8, FREQUENCY 9, REACHABILITY 6, WTP 4, MARGIN 6, RETENTION 8, BUILD_SPEED 5, COMPETITION(−) 8, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 5

### #12 — Seller-side delayed/refused allocation handler  (score 85)

- **CUSTOMER:** SMB issuers
- **CURRENT HUMAN JOB:** Handle 'עיכוב' paths (cancel/self-invoice/hearing)
- **EXISTING SPEND:** Hashavshevet IsrInv PDF documents the 4 paths
- **ISRAEL-SPECIFIC REASON:** ITA control room
- **TRIGGER:** Delay event
- **AGENT LOOP:** Choose path → coordinate → re-request
- **LAST VALUABLE STEP:** Number obtained
- **CAN AGENT COMPLETE IT?:** Hearing may be representation
- **VERIFICATION:** ITA status
- **FREQUENCY:** Rare
- **AUTONOMY %:** 40%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** ITA API
- **COMPETITION:** None seen
- **MARKET SIZE:** Unknown
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪200–500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Frequency unknown; representation risk
- **SCORES:** PAIN 8, EXISTING_SPEND 3, ISRAEL_ADV 10, LAST_MILE 5, VERIFIABILITY 9, FREQUENCY 3, REACHABILITY 4, WTP 6, MARGIN 7, RETENTION 5, BUILD_SPEED 5, COMPETITION(−) 3, LEGAL_RISK(−) 7, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 5

### #13 — WhatsApp order intake → ERP for distributors  (score 126)

- **CUSTOMER:** Food/drink/disposables/cleaning/building-supply distributors with 50–1,500 B2B customers
- **CURRENT HUMAN JOB:** Order clerk (קלדנית/פקיד/ת הזמנות) reads WhatsApp/voice/photos, keys orders into Priority/Hashavshevet/Rivhit, confirms
- **EXISTING SPEND:** 127 Drushim 'קליטת הזמנות' listings + 39 'הקלדת הזמנות'; AllJobs 8832458 (Kadima), Drushim 38370978 (Kfar Masaryk, Priority), 38496093 (Ariel); clerk salaries ₪8–9.5k; MagicNet sells B2B portal 'instead of WhatsApp'; Pepperi ~$500/mo+
- **ISRAEL-SPECIFIC REASON:** Hebrew slang/voice notes/photos of handwritten lists; local ERPs (Hashavshevet, Rivhit, Priority-IL) unsupported by global tools (Galo, Plato, Conexiom, Darwin)
- **TRIGGER:** WhatsApp message (text/voice/photo)
- **AGENT LOOP:** Identify customer by phone → transcribe/OCR → map to SKUs using catalog + customer history → create order via ERP API → read back → send Hebrew summary → customer 'OK' → clarify ambiguities with customer, not owner
- **LAST VALUABLE STEP:** Correct sales order in ERP, confirmed by customer
- **CAN AGENT COMPLETE IT?:** YES — demonstrated on Rivhit demo (create, read-back, amend, cancel)
- **VERIFICATION:** Document.Details read-back matches lines; customer confirmation
- **FREQUENCY:** Many per day
- **AUTONOMY %:** 80–90%
- **HUMAN TIME / customer / month:** 20–30 min
- **ACCESS METHOD:** Priority REST/OData (verified docs), Hashavshevet H-Connect (verified PDF), Rivhit API (live-tested), WhatsApp Cloud API
- **COMPETITION:** Portals (MagicNet, WideCommerce, Wizcloud shop, Priority Zoom); sales-agent apps; custom agencies (Automaziot); global AI order-entry (Galo, Plato, Darwin, Conexiom) — no Hebrew productised loop into local ERPs found
- **MARKET SIZE:** ~500–1,000 realistic targets (est.)
- **CUSTOMER SOURCE:** Drushim/AllJobs order-clerk listings (each = a company paying a clerk); duns100 food wholesale; b144 categories
- **EXPECTED PRICE:** ₪1,200–2,000/mo
- **COST TO SERVE:** ~₪100–250/mo LLM+infra
- **CHATGPT TEST (could one upload give 80%?):** No — ongoing ownership of every order
- **DRY-RUN RESULT:** 16 messages: 12 orders created+verified, 2 correct clarifications, 1 cancel verified, 1 price reply
- **BIGGEST RISK:** SKU-matching errors on real messy data; ERP/VAR access cost
- **SCORES:** PAIN 8, EXISTING_SPEND 8, ISRAEL_ADV 7, LAST_MILE 9, VERIFIABILITY 9, FREQUENCY 10, REACHABILITY 7, WTP 7, MARGIN 8, RETENTION 9, BUILD_SPEED 7, COMPETITION(−) 5, LEGAL_RISK(−) 1, PLATFORM_RISK(−) 4, HUMAN_DEP(−) 3

### #14 — Missed-order reorder nudges (module on #13)  (score 108)

- **CUSTOMER:** Same distributors
- **CURRENT HUMAN JOB:** Telesales phones customers who forgot to order
- **EXISTING SPEND:** Order-clerk/telesales listings; Plato/WizCommerce sell it globally
- **ISRAEL-SPECIFIC REASON:** Same as #13
- **TRIGGER:** Customer's usual order day passes
- **AGENT LOOP:** Detect missing order → WhatsApp pre-filled basket → 'OK' → create order → verify
- **LAST VALUABLE STEP:** Extra order booked
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** ERP order exists
- **FREQUENCY:** Weekly per customer
- **AUTONOMY %:** 85%
- **HUMAN TIME / customer / month:** 10 min
- **ACCESS METHOD:** ERP API + WhatsApp templates (paid utility/marketing)
- **COMPETITION:** Global only
- **MARKET SIZE:** Same as #13
- **CUSTOMER SOURCE:** Same
- **EXPECTED PRICE:** +₪500–1,000
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Covered by #13 dry run (order create)
- **BIGGEST RISK:** Only works after #13 integration; anti-spam law on marketing
- **SCORES:** PAIN 6, EXISTING_SPEND 6, ISRAEL_ADV 7, LAST_MILE 8, VERIFIABILITY 9, FREQUENCY 9, REACHABILITY 6, WTP 7, MARGIN 8, RETENTION 8, BUILD_SPEED 7, COMPETITION(−) 4, LEGAL_RISK(−) 4, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 4
- **STATUS:** MERGED into #13

### #15 — Supplier price-list updater  (score 101)

- **CUSTOMER:** Retailers/online shops/secondary distributors with 10–60 suppliers
- **CURRENT HUMAN JOB:** Purchasing/back office maps Excel price lists to SKUs and updates ERP/store
- **EXISTING SPEND:** Drushim 38370978 includes price-list maintenance; Konimbo Excel re-import help page
- **ISRAEL-SPECIFIC REASON:** Hebrew Excel, no shared barcodes, multi-currency
- **TRIGGER:** Price list arrives
- **AGENT LOOP:** Parse → map SKUs → diff → apply margin rules → write ERP/store → read back
- **LAST VALUABLE STEP:** Prices live
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** Read-back
- **FREQUENCY:** Weekly–monthly
- **AUTONOMY %:** 85%
- **HUMAN TIME / customer / month:** 15 min
- **ACCESS METHOD:** ERP & Woo/Shopify APIs
- **COMPETITION:** Syncee-type PIM; ERP import screens
- **MARKET SIZE:** 500–1,500 (est.)
- **CUSTOMER SOURCE:** Store builder directories
- **EXPECTED PRICE:** ₪400–900
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** Partly (one file)
- **DRY-RUN RESULT:** Not run (would need real supplier file)
- **BIGGEST RISK:** Moderate frequency; wrong live price risk
- **SCORES:** PAIN 6, EXISTING_SPEND 4, ISRAEL_ADV 6, LAST_MILE 8, VERIFIABILITY 9, FREQUENCY 5, REACHABILITY 6, WTP 5, MARGIN 8, RETENTION 7, BUILD_SPEED 8, COMPETITION(−) 4, LEGAL_RISK(−) 1, PLATFORM_RISK(−) 3, HUMAN_DEP(−) 4

### #16 — Restaurant invoice audit + credit-note claims  (score 90)

- **CUSTOMER:** Restaurants & small chains
- **CURRENT HUMAN JOB:** Manager matches delivery notes to invoices/prices, chases credits
- **EXISTING SPEND:** Bookkeeper listings; Restigo 'hundreds of customers'; MarketMan $199–249/location
- **ISRAEL-SPECIFIC REASON:** Hebrew handwritten notes; חשבונית מרכזת
- **TRIGGER:** Invoice photo
- **AGENT LOOP:** OCR → compare to order/price → credit request → verify credit note
- **LAST VALUABLE STEP:** Credit note received
- **CAN AGENT COMPLETE IT?:** Depends on supplier
- **VERIFICATION:** Credit note
- **FREQUENCY:** Daily
- **AUTONOMY %:** 55%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** WhatsApp/email + accounting APIs
- **COMPETITION:** Restigo, MarketMan
- **MARKET SIZE:** Thousands of restaurants
- **CUSTOMER SOURCE:** Easy.co.il / Wolt listings
- **EXPECTED PRICE:** ₪400–800/branch
- **COST TO SERVE:** Med
- **CHATGPT TEST (could one upload give 80%?):** Partly
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Restigo owns space
- **SCORES:** PAIN 7, EXISTING_SPEND 8, ISRAEL_ADV 6, LAST_MILE 5, VERIFIABILITY 7, FREQUENCY 9, REACHABILITY 6, WTP 5, MARGIN 6, RETENTION 6, BUILD_SPEED 6, COMPETITION(−) 8, LEGAL_RISK(−) 1, PLATFORM_RISK(−) 4, HUMAN_DEP(−) 6

### #17 — Distributor consolidated invoicing / delivery-note closer  (score 91)

- **CUSTOMER:** Distributors billing monthly
- **CURRENT HUMAN JOB:** Match delivery notes/returns, issue חשבונית מרכזת, handle disputes
- **EXISTING SPEND:** Priority KB & forums; order-clerk listings
- **ISRAEL-SPECIFIC REASON:** Consolidated invoicing practice
- **TRIGGER:** Month end
- **AGENT LOOP:** Pull notes → find gaps → create invoice → send
- **LAST VALUABLE STEP:** Invoice issued & accepted
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** Doc created
- **FREQUENCY:** Monthly
- **AUTONOMY %:** 75%
- **HUMAN TIME / customer / month:** 20 min
- **ACCESS METHOD:** ERP APIs
- **COMPETITION:** Built into ERPs
- **MARKET SIZE:** Same as #13
- **CUSTOMER SOURCE:** Same
- **EXPECTED PRICE:** ₪300–600
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Overlaps ERP
- **SCORES:** PAIN 5, EXISTING_SPEND 5, ISRAEL_ADV 7, LAST_MILE 7, VERIFIABILITY 8, FREQUENCY 4, REACHABILITY 6, WTP 4, MARGIN 7, RETENTION 7, BUILD_SPEED 7, COMPETITION(−) 6, LEGAL_RISK(−) 1, PLATFORM_RISK(−) 4, HUMAN_DEP(−) 4

### #18 — Distributor WhatsApp collections  (score 94)

- **CUSTOMER:** Distributors/importers
- **CURRENT HUMAN JOB:** Collections clerk/agent chases debts, records receipts
- **EXISTING SPEND:** SoftSolutions & Rivhit agent apps sell collection
- **ISRAEL-SPECIFIC REASON:** Post-dated cheques, Bit
- **TRIGGER:** Due date
- **AGENT LOOP:** Reminder + link → receipt (KUPAIN/Rivhit) → verify
- **LAST VALUABLE STEP:** Payment recorded
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** Payment record
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 70%
- **HUMAN TIME / customer / month:** 20 min
- **ACCESS METHOD:** ERP + WhatsApp; bank feed hard
- **COMPETITION:** Agent apps, reminder tools
- **MARKET SIZE:** Same as #13
- **CUSTOMER SOURCE:** Same
- **EXPECTED PRICE:** ₪500–1,200
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Relationship sensitivity
- **SCORES:** PAIN 7, EXISTING_SPEND 5, ISRAEL_ADV 7, LAST_MILE 6, VERIFIABILITY 7, FREQUENCY 8, REACHABILITY 6, WTP 6, MARGIN 8, RETENTION 7, BUILD_SPEED 7, COMPETITION(−) 5, LEGAL_RISK(−) 4, PLATFORM_RISK(−) 4, HUMAN_DEP(−) 5

### #19 — Wolt/10bis/Cibus/Mishloha menu & stock sync  (score 64)

- **CUSTOMER:** Restaurants
- **CURRENT HUMAN JOB:** Update menus in each portal
- **EXISTING SPEND:** Wolt docs; Deliverect
- **ISRAEL-SPECIFIC REASON:** Local platforms
- **TRIGGER:** Menu change
- **AGENT LOOP:** Push to each portal
- **LAST VALUABLE STEP:** Menu updated
- **CAN AGENT COMPLETE IT?:** Browser only
- **VERIFICATION:** Portal
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 50%
- **HUMAN TIME / customer / month:** —
- **ACCESS METHOD:** Partner-only APIs (Wolt, Tabit)
- **COMPETITION:** POS vendors, Deliverect
- **MARKET SIZE:** Thousands
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪150–300
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run — rejected
- **BIGGEST RISK:** Closed APIs
- **SCORES:** PAIN 4, EXISTING_SPEND 4, ISRAEL_ADV 5, LAST_MILE 5, VERIFIABILITY 7, FREQUENCY 7, REACHABILITY 6, WTP 3, MARGIN 6, RETENTION 5, BUILD_SPEED 5, COMPETITION(−) 8, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 9, HUMAN_DEP(−) 3
- **STATUS:** KILLED: closed partner APIs

### #20 — Delivery-platform payout reconciliation  (score 77)

- **CUSTOMER:** Restaurants & bookkeepers
- **CURRENT HUMAN JOB:** Match platform payouts to POS & bank
- **EXISTING SPEND:** No evidence gathered
- **ISRAEL-SPECIFIC REASON:** 10bis/Cibus settlement cycles
- **TRIGGER:** Payout
- **AGENT LOOP:** Reconcile → dispute
- **LAST VALUABLE STEP:** Dispute filed
- **CAN AGENT COMPLETE IT?:** Browser
- **VERIFICATION:** Matched
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 50%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** Portal exports
- **COMPETITION:** Unknown
- **MARKET SIZE:** Thousands
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪200–400
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** No spend evidence
- **SCORES:** PAIN 5, EXISTING_SPEND 3, ISRAEL_ADV 8, LAST_MILE 5, VERIFIABILITY 8, FREQUENCY 6, REACHABILITY 5, WTP 4, MARGIN 7, RETENTION 7, BUILD_SPEED 5, COMPETITION(−) 5, LEGAL_RISK(−) 2, PLATFORM_RISK(−) 8, HUMAN_DEP(−) 5

### #21 — Import shipment document & ETA chaser  (score 91)

- **CUSTOMER:** Importers with 5–50 shipments/mo
- **CURRENT HUMAN JOB:** Import coordinator chases suppliers/forwarders for docs, updates ETA
- **EXISTING SPEND:** Matrix import coordinator listing; Drushim 'ייבוא ושיווק'; forwarder services
- **ISRAEL-SPECIFIC REASON:** Haifa/Ashdod processes, SII release
- **TRIGGER:** PO created
- **AGENT LOOP:** Request docs → collect → forward to broker → ETA into ERP
- **LAST VALUABLE STEP:** Complete doc set at broker + ERP ETA
- **CAN AGENT COMPLETE IT?:** Yes (customs filing excluded)
- **VERIFICATION:** Docs received; tracking
- **FREQUENCY:** Daily
- **AUTONOMY %:** 65%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** Email, carrier tracking, ERP API
- **COMPETITION:** Flexport/Freightos (bigger); forwarders do part free
- **MARKET SIZE:** 1,000–3,000 (est.)
- **CUSTOMER SOURCE:** Importer directories
- **EXPECTED PRICE:** ₪800–1,500
- **COST TO SERVE:** Med
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Supplier email responsiveness
- **SCORES:** PAIN 6, EXISTING_SPEND 6, ISRAEL_ADV 6, LAST_MILE 6, VERIFIABILITY 7, FREQUENCY 7, REACHABILITY 6, WTP 6, MARGIN 7, RETENTION 7, BUILD_SPEED 6, COMPETITION(−) 4, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 3, HUMAN_DEP(−) 6

### #22 — Import regulatory paperwork (SII / European route)  (score 73)

- **CUSTOMER:** Importers of regulated goods
- **CURRENT HUMAN JOB:** Prepare declarations, track approvals
- **EXISTING SPEND:** G.P.C., Seven Continents, Seko services
- **ISRAEL-SPECIFIC REASON:** Entirely local regulation
- **TRIGGER:** New SKU
- **AGENT LOOP:** Fill portal → track
- **LAST VALUABLE STEP:** Approval filed
- **CAN AGENT COMPLETE IT?:** Needs importer credentials & liability
- **VERIFICATION:** Portal status
- **FREQUENCY:** Low
- **AUTONOMY %:** 40%
- **HUMAN TIME / customer / month:** 45 min
- **ACCESS METHOD:** gov.il/SII portals, browser, login
- **COMPETITION:** Consultants & brokers
- **MARKET SIZE:** Hundreds–thousands
- **CUSTOMER SOURCE:** SII lists
- **EXPECTED PRICE:** ₪600–1,500
- **COST TO SERVE:** Med
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Liability, low frequency
- **SCORES:** PAIN 7, EXISTING_SPEND 6, ISRAEL_ADV 10, LAST_MILE 4, VERIFIABILITY 6, FREQUENCY 4, REACHABILITY 5, WTP 6, MARGIN 6, RETENTION 5, BUILD_SPEED 3, COMPETITION(−) 5, LEGAL_RISK(−) 8, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 7

### #23 — Kitchen reorder agent (buyer side)  (score 80)

- **CUSTOMER:** Restaurants
- **CURRENT HUMAN JOB:** Chef sends nightly WhatsApp orders to suppliers
- **EXISTING SPEND:** Restigo, MarketMan
- **ISRAEL-SPECIFIC REASON:** Suppliers only take WhatsApp
- **TRIGGER:** Stock count
- **AGENT LOOP:** Generate & send orders → confirm
- **LAST VALUABLE STEP:** Order confirmed
- **CAN AGENT COMPLETE IT?:** Needs stock count
- **VERIFICATION:** Supplier reply
- **FREQUENCY:** Daily
- **AUTONOMY %:** 50%
- **HUMAN TIME / customer / month:** 20 min
- **ACCESS METHOD:** WhatsApp; POS partner-only
- **COMPETITION:** Restigo, MarketMan
- **MARKET SIZE:** Thousands
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪300–600
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Churn; needs human count
- **SCORES:** PAIN 6, EXISTING_SPEND 6, ISRAEL_ADV 6, LAST_MILE 5, VERIFIABILITY 6, FREQUENCY 10, REACHABILITY 5, WTP 4, MARGIN 6, RETENTION 4, BUILD_SPEED 7, COMPETITION(−) 6, LEGAL_RISK(−) 1, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 7

### #24 — Fleet ticket transfer (הסבת דוחות) for owned fleets  (score 83)

- **CUSTOMER:** Companies with 10–300 owned vehicles
- **CURRENT HUMAN JOB:** Fleet admin matches ticket to driver, files transfer per municipality/police
- **EXISTING SPEND:** Fleet listings (AllJobs 8769262, 8758647, 8750565, 8711136); Netzer/BetterWay; rental ₪50/transfer fee
- **ISRAEL-SPECIFIC REASON:** 4× fine for corporate owners; ~250 municipal portals
- **TRIGGER:** Ticket received
- **AGENT LOOP:** OCR → match driver → driver e-sign → file transfer → re-check status
- **LAST VALUABLE STEP:** Transfer accepted
- **CAN AGENT COMPLETE IT?:** Partly: portals browser-only; police may need attorney-signed affidavit
- **VERIFICATION:** Ticket status
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 50%
- **HUMAN TIME / customer / month:** 45 min
- **ACCESS METHOD:** No API; municipal portals; Ri-Port exclusive B2B channel in TLV
- **COMPETITION:** RoadProtect, Netzer/BetterWay, Carpro, Rakavim
- **MARKET SIZE:** 187,985 company-owned vehicles (data.gov.il count)
- **CUSTOMER SOURCE:** Fleet manager job ads
- **EXPECTED PRICE:** ₪15–25/vehicle
- **COST TO SERVE:** Med
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run (no API)
- **BIGGEST RISK:** Crowded + blocked last step
- **SCORES:** PAIN 7, EXISTING_SPEND 8, ISRAEL_ADV 9, LAST_MILE 4, VERIFIABILITY 6, FREQUENCY 8, REACHABILITY 6, WTP 6, MARGIN 6, RETENTION 8, BUILD_SPEED 4, COMPETITION(−) 8, LEGAL_RISK(−) 5, PLATFORM_RISK(−) 8, HUMAN_DEP(−) 6

### #25 — Ticket back office for small rental/subscription fleets  (score 75)

- **CUSTOMER:** Small rental & subscription operators
- **CURRENT HUMAN JOB:** Clerk matches ticket to contract, files transfers
- **EXISTING SPEND:** Ri-Port TLV contract; Eldan/Ofran fees; Globes
- **ISRAEL-SPECIFIC REASON:** Hebrew portals; 4× fine
- **TRIGGER:** Ticket
- **AGENT LOOP:** Match → file → verify
- **LAST VALUABLE STEP:** Transfer accepted
- **CAN AGENT COMPLETE IT?:** Partly
- **VERIFICATION:** Status
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 50%
- **HUMAN TIME / customer / month:** 45 min
- **ACCESS METHOD:** Browser; exclusive B2B channels
- **COMPETITION:** Ri-Port, rental ERPs, RoadProtect
- **MARKET SIZE:** <150 firms
- **CUSTOMER SOURCE:** Rental directories
- **EXPECTED PRICE:** ₪500–1,500
- **COST TO SERVE:** Med
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Small long tail
- **SCORES:** PAIN 6, EXISTING_SPEND 7, ISRAEL_ADV 8, LAST_MILE 4, VERIFIABILITY 6, FREQUENCY 8, REACHABILITY 5, WTP 5, MARGIN 6, RETENTION 7, BUILD_SPEED 4, COMPETITION(−) 7, LEGAL_RISK(−) 5, PLATFORM_RISK(−) 8, HUMAN_DEP(−) 6

### #26 — Fleet compliance (license/test/recalls) on registry API  (score 81)

- **CUSTOMER:** Owned fleets 10–150 vehicles
- **CURRENT HUMAN JOB:** Admin tracks test dates, pays fee, books test, chases recalls
- **EXISTING SPEND:** Rakavim, K-Betihut, Carpro; insurance coordinator listings
- **ISRAEL-SPECIFIC REASON:** data.gov.il exposes tokef_dt + recalls per plate daily
- **TRIGGER:** Daily API pull
- **AGENT LOOP:** Detect expiry/recall → pay fee → WhatsApp driver to book test → verify tokef_dt advanced
- **LAST VALUABLE STEP:** Vehicle test done
- **CAN AGENT COMPLETE IT?:** No — physical test by driver
- **VERIFICATION:** tokef_dt in API (excellent)
- **FREQUENCY:** Yearly per vehicle
- **AUTONOMY %:** 40%
- **HUMAN TIME / customer / month:** 20 min
- **ACCESS METHOD:** data.gov.il (live-tested); fee payment browser behind gov.il bot-block
- **COMPETITION:** Carpro, Rakavim, telematics
- **MARKET SIZE:** Same fleet pool
- **CUSTOMER SOURCE:** Fleet job ads
- **EXPECTED PRICE:** ₪5–12/vehicle
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** 20 company-owned plates pulled; tokef_dt & recall lookups worked 20/20; ACT impossible
- **BIGGEST RISK:** Low WTP; physical last mile
- **SCORES:** PAIN 5, EXISTING_SPEND 6, ISRAEL_ADV 7, LAST_MILE 3, VERIFIABILITY 9, FREQUENCY 4, REACHABILITY 6, WTP 4, MARGIN 8, RETENTION 7, BUILD_SPEED 8, COMPETITION(−) 6, LEGAL_RISK(−) 2, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 6

### #27 — Back office for traffic-safety officers (Reg. 585)  (score 102)

- **CUSTOMER:** Independent safety-officer practices & trucking firms
- **CURRENT HUMAN JOB:** Officer/admin maintains driver & vehicle files, chases documents
- **EXISTING SPEND:** Drushim 38011954, 37883039; AllJobs 8753351, 8813603, 8734629; State Comptroller tender 16/2023; K-Betihut
- **ISRAEL-SPECIFIC REASON:** Regulation 585 mandates safety officer for N2+
- **TRIGGER:** Calendar + registry
- **AGENT LOOP:** Chase drivers for docs → validate → update file → monthly report
- **LAST VALUABLE STEP:** Complete compliance file; officer signs
- **CAN AGENT COMPLETE IT?:** Mostly (sign-off stays human)
- **VERIFICATION:** Docs validated; registry
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 65%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** WhatsApp + registry API; driver-license status access unverified
- **COMPETITION:** Rakavim, Carpro, Netzer
- **MARKET SIZE:** ~123k heavy cargo vehicles; officer count unknown
- **CUSTOMER SOURCE:** Officer listings, Ministry list
- **EXPECTED PRICE:** ₪500–1,500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Registry part tested via vehicle API
- **BIGGEST RISK:** Officers protect billable admin; access
- **SCORES:** PAIN 7, EXISTING_SPEND 8, ISRAEL_ADV 9, LAST_MILE 6, VERIFIABILITY 6, FREQUENCY 8, REACHABILITY 7, WTP 6, MARGIN 7, RETENTION 8, BUILD_SPEED 6, COMPETITION(−) 5, LEGAL_RISK(−) 4, PLATFORM_RISK(−) 4, HUMAN_DEP(−) 5

### #28 — Toll-road invoice reconciliation & driver charge-back  (score 86)

- **CUSTOMER:** Fleets, rental
- **CURRENT HUMAN JOB:** Allocate Highway 6/tunnel invoices to drivers
- **EXISTING SPEND:** Globes ₪45–60/trip fees; Carpro integration
- **ISRAEL-SPECIFIC REASON:** Several concessionaires
- **TRIGGER:** Invoice
- **AGENT LOOP:** Parse → match → pay/dispute → payroll deduction
- **LAST VALUABLE STEP:** Paid/disputed
- **CAN AGENT COMPLETE IT?:** Partly
- **VERIFICATION:** Portal balance
- **FREQUENCY:** Monthly
- **AUTONOMY %:** 55%
- **HUMAN TIME / customer / month:** 20 min
- **ACCESS METHOD:** Operator portals
- **COMPETITION:** Carpro, Rakavim
- **MARKET SIZE:** Same fleet pool
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪300–800
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Small money
- **SCORES:** PAIN 4, EXISTING_SPEND 5, ISRAEL_ADV 8, LAST_MILE 6, VERIFIABILITY 7, FREQUENCY 7, REACHABILITY 6, WTP 4, MARGIN 7, RETENTION 7, BUILD_SPEED 6, COMPETITION(−) 5, LEGAL_RISK(−) 2, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 4

### #29 — Construction-equipment (צמ"ה) license compliance  (score 81)

- **CUSTOMER:** Contractors, equipment rental
- **CURRENT HUMAN JOB:** Track tokef, pay fee, book inspector
- **EXISTING SPEND:** gov.il fee service; thin
- **ISRAEL-SPECIFIC REASON:** Registry exposes tokef_date
- **TRIGGER:** API date
- **AGENT LOOP:** Pay fee → book inspector → verify tokef
- **LAST VALUABLE STEP:** Valid license
- **CAN AGENT COMPLETE IT?:** Partly; inspection physical
- **VERIFICATION:** API tokef_date
- **FREQUENCY:** Yearly
- **AUTONOMY %:** 40%
- **HUMAN TIME / customer / month:** 15 min
- **ACCESS METHOD:** data.gov.il verified; payment browser
- **COMPETITION:** Generic fleet tools
- **MARKET SIZE:** 184,652 units
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪300–1,000
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run beyond dataset check
- **BIGGEST RISK:** Thin spend
- **SCORES:** PAIN 5, EXISTING_SPEND 4, ISRAEL_ADV 7, LAST_MILE 4, VERIFIABILITY 9, FREQUENCY 3, REACHABILITY 5, WTP 4, MARGIN 8, RETENTION 7, BUILD_SPEED 8, COMPETITION(−) 3, LEGAL_RISK(−) 2, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 6

### #30 — Parking-ticket dispute agent  (score 71)

- **CUSTOMER:** Delivery & technician fleets
- **CURRENT HUMAN JOB:** Decide appeal, gather Pango/Cellopark logs, submit
- **EXISTING SPEND:** RoadProtect B2B; Wisesight
- **ISRAEL-SPECIFIC REASON:** Per-municipality appeals
- **TRIGGER:** Ticket
- **AGENT LOOP:** Evidence → appeal → status
- **LAST VALUABLE STEP:** Appeal submitted
- **CAN AGENT COMPLETE IT?:** Browser; outcome municipal
- **VERIFICATION:** Status
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 45%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** Portals
- **COMPETITION:** RoadProtect
- **MARKET SIZE:** Subset of fleets
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** Success fee
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** RoadProtect at scale
- **SCORES:** PAIN 6, EXISTING_SPEND 6, ISRAEL_ADV 8, LAST_MILE 4, VERIFIABILITY 6, FREQUENCY 7, REACHABILITY 5, WTP 6, MARGIN 6, RETENTION 6, BUILD_SPEED 4, COMPETITION(−) 8, LEGAL_RISK(−) 4, PLATFORM_RISK(−) 8, HUMAN_DEP(−) 7

### #31 — Arnona admin for multi-branch chains  (score 75)

- **CUSTOMER:** Chains with 5–50 branches
- **CURRENT HUMAN JOB:** Pay bills, file holder changes, exemptions
- **EXISTING SPEND:** Thin
- **ISRAEL-SPECIFIC REASON:** ~250 municipalities
- **TRIGGER:** Bill
- **AGENT LOOP:** Parse → pay/notify/appeal
- **LAST VALUABLE STEP:** Notice/payment
- **CAN AGENT COMPLETE IT?:** Partly
- **VERIFICATION:** Portal balance
- **FREQUENCY:** Monthly
- **AUTONOMY %:** 45%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** Portals
- **COMPETITION:** Consultants
- **MARKET SIZE:** Unknown
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪500–1,500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Low frequency
- **SCORES:** PAIN 5, EXISTING_SPEND 4, ISRAEL_ADV 9, LAST_MILE 5, VERIFIABILITY 6, FREQUENCY 3, REACHABILITY 5, WTP 5, MARGIN 7, RETENTION 7, BUILD_SPEED 4, COMPETITION(−) 4, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 7, HUMAN_DEP(−) 5

### #32 — Business-licensing renewal tracker  (score 70)

- **CUSTOMER:** Multi-site chains
- **CURRENT HUMAN JOB:** Track expiries, collect approvals, submit
- **EXISTING SPEND:** Fire consultants ₪3.5–6.5k; TLV online licensing
- **ISRAEL-SPECIFIC REASON:** Israeli licensing law
- **TRIGGER:** Expiry
- **AGENT LOOP:** Collect → submit → verify
- **LAST VALUABLE STEP:** Renewal submitted
- **CAN AGENT COMPLETE IT?:** Partly (fire approvals licensed)
- **VERIFICATION:** Status
- **FREQUENCY:** Rare
- **AUTONOMY %:** 40%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** Portals
- **COMPETITION:** Consultants
- **MARKET SIZE:** Unknown
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪300–1,000
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Rare event
- **SCORES:** PAIN 6, EXISTING_SPEND 6, ISRAEL_ADV 9, LAST_MILE 4, VERIFIABILITY 5, FREQUENCY 2, REACHABILITY 5, WTP 5, MARGIN 7, RETENTION 4, BUILD_SPEED 4, COMPETITION(−) 4, LEGAL_RISK(−) 4, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 7

### #33 — Public-tender monitoring + bid pack  (score 73)

- **CUSTOMER:** SMB contractors/suppliers
- **CURRENT HUMAN JOB:** Watch sites, assemble docs, submit
- **EXISTING SPEND:** BTL tender-consulting tender; thin
- **ISRAEL-SPECIFIC REASON:** Hebrew affidavits, registry gates
- **TRIGGER:** New tender
- **AGENT LOOP:** Eligibility → pack → submit
- **LAST VALUABLE STEP:** Bid submitted
- **CAN AGENT COMPLETE IT?:** No (signatures, affidavits)
- **VERIFICATION:** Receipt
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 40%
- **HUMAN TIME / customer / month:** 60 min
- **ACCESS METHOD:** Scraping; data.gov.il tenders stale (2021)
- **COMPETITION:** Alert services
- **MARKET SIZE:** ~2,300 classified contractors
- **CUSTOMER SOURCE:** Registry
- **EXPECTED PRICE:** ₪500–2,000
- **COST TO SERVE:** Med
- **CHATGPT TEST (could one upload give 80%?):** Partly
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Human-signed submission
- **SCORES:** PAIN 6, EXISTING_SPEND 5, ISRAEL_ADV 8, LAST_MILE 3, VERIFIABILITY 6, FREQUENCY 5, REACHABILITY 7, WTP 6, MARGIN 7, RETENTION 6, BUILD_SPEED 5, COMPETITION(−) 5, LEGAL_RISK(−) 4, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 7

### #34 — Public-vehicle (taxi/minibus) compliance  (score 71)

- **CUSTOMER:** Taxi/minibus operators
- **CURRENT HUMAN JOB:** Track licenses & permits
- **EXISTING SPEND:** Weak
- **ISRAEL-SPECIFIC REASON:** Public-vehicle registry
- **TRIGGER:** API
- **AGENT LOOP:** Renew → verify
- **LAST VALUABLE STEP:** Renewal
- **CAN AGENT COMPLETE IT?:** Partly
- **VERIFICATION:** tokef_dt
- **FREQUENCY:** Yearly
- **AUTONOMY %:** 40%
- **HUMAN TIME / customer / month:** 15 min
- **ACCESS METHOD:** API verified; renewal browser
- **COMPETITION:** Fleet software
- **MARKET SIZE:** 66,144 vehicles, fragmented
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪200–600
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Low WTP
- **SCORES:** PAIN 4, EXISTING_SPEND 3, ISRAEL_ADV 7, LAST_MILE 4, VERIFIABILITY 8, FREQUENCY 3, REACHABILITY 5, WTP 3, MARGIN 7, RETENTION 6, BUILD_SPEED 7, COMPETITION(−) 3, LEGAL_RISK(−) 2, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 6

### #35 — WhatsApp dispatch desk for service companies  (score 100)

- **CUSTOMER:** HVAC/plumbing/electric/appliance firms with 5–30 technicians
- **CURRENT HUMAN JOB:** Coordinator opens call, assigns tech, confirms slot
- **EXISTING SPEND:** AllJobs 8756211, 8720662, 8726956; Drushim 37466274, 38185025, 37615272; Fireberry $45–113/user
- **ISRAEL-SPECIFIC REASON:** WhatsApp + Hebrew voice; Priority/Fireberry; global FSM lacks Hebrew
- **TRIGGER:** Incoming WhatsApp
- **AGENT LOOP:** Classify fault → pick tech by area/skill → offer slots → book → job card → closure photo → invoice
- **LAST VALUABLE STEP:** Confirmed booking in tech calendar
- **CAN AGENT COMPLETE IT?:** Yes if calendar/CRM writable
- **VERIFICATION:** Customer + tech confirmation
- **FREQUENCY:** Many per day
- **AUTONOMY %:** 70%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** WhatsApp API; Fireberry/Priority APIs; often Excel
- **COMPETITION:** Fireberry bots, Gambot ₪179–645, Fieldy, agencies
- **MARKET SIZE:** 1,500–3,000 firms (est.)
- **CUSTOMER SOURCE:** Registry (מיזוג 437, חשמלאות 1,436...), job ads
- **EXPECTED PRICE:** ₪600–1,500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run (no FSM sandbox); booking write analogous to #13
- **BIGGEST RISK:** Commoditised pieces; owner trust
- **SCORES:** PAIN 7, EXISTING_SPEND 8, ISRAEL_ADV 6, LAST_MILE 7, VERIFIABILITY 7, FREQUENCY 10, REACHABILITY 6, WTP 6, MARGIN 7, RETENTION 7, BUILD_SPEED 7, COMPETITION(−) 7, LEGAL_RISK(−) 2, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 5

### #36 — Subcontractor compliance file (insurance cert + registry)  (score 102)

- **CUSTOMER:** Main contractors/developers with 20–200 subs
- **CURRENT HUMAN JOB:** Controller collects אישור קיום ביטוחים, registry class, tax approvals; blocks payment
- **EXISTING SPEND:** Tender insurance appendices (BOI, IUCC, Haifa U); site manager listings 8737580, 8756655; thin job evidence
- **ISRAEL-SPECIFIC REASON:** Standard CMA insurance form with closed-list codes; contractor registry
- **TRIGGER:** New sub / nightly expiry / payment request
- **AGENT LOOP:** Parse cert → registry lookup → compare to contract → request missing codes from insurance agent → payment hold flag → re-parse
- **LAST VALUABLE STEP:** Valid certificate on file + payment hold/release
- **CAN AGENT COMPLETE IT?:** Mostly; renewal depends on agent sending new cert
- **VERIFICATION:** Re-parse + registry
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 65%
- **HUMAN TIME / customer / month:** 20 min
- **ACCESS METHOD:** data.gov.il registry (live-tested); PDFs; ERP API
- **COMPETITION:** Brokers informally; global COI tools don't parse Hebrew form
- **MARKET SIZE:** 1,372–2,851 contractors class ≥2
- **CUSTOMER SOURCE:** Registry with 17,200 emails
- **EXPECTED PRICE:** ₪500–1,500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** Partly (one cert)
- **DRY-RUN RESULT:** 15 registry lookups 15/15 found; 0/15 had company ID → name/number matching needed; no suspension status
- **BIGGEST RISK:** Latent pain; ChatGPT handles single cert
- **SCORES:** PAIN 6, EXISTING_SPEND 5, ISRAEL_ADV 9, LAST_MILE 6, VERIFIABILITY 8, FREQUENCY 6, REACHABILITY 8, WTP 5, MARGIN 9, RETENTION 8, BUILD_SPEED 7, COMPETITION(−) 4, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 3, HUMAN_DEP(−) 5

### #37 — Developer bedek (warranty) call coordination  (score 100)

- **CUSTOMER:** Residential developers/contractors post-handover
- **CURRENT HUMAN JOB:** Bedek coordinator triages, dispatches subs, gets closure
- **EXISTING SPEND:** Drushim 37561673, 37967532, 37581965; AllJobs 8708786
- **ISRAEL-SPECIFIC REASON:** חוק המכר warranty periods; WhatsApp tenants
- **TRIGGER:** Tenant WhatsApp + photo
- **AGENT LOOP:** Identify apt/item → warranty check → assign sub → book → closure photo + tenant OK
- **LAST VALUABLE STEP:** Visit booked + closure confirmed
- **CAN AGENT COMPLETE IT?:** Mostly (disputes → engineer)
- **VERIFICATION:** Tenant confirmation
- **FREQUENCY:** Daily
- **AUTONOMY %:** 65%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** WhatsApp + CRM
- **COMPETITION:** Priority/Salesforce at large devs; QA tools
- **MARKET SIZE:** 200–500 developers
- **CUSTOMER SOURCE:** Registry ג3–ג5 (1,372)
- **EXPECTED PRICE:** ₪1,000–2,500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Big devs have IT; liability on triage
- **SCORES:** PAIN 7, EXISTING_SPEND 7, ISRAEL_ADV 7, LAST_MILE 7, VERIFIABILITY 7, FREQUENCY 8, REACHABILITY 7, WTP 7, MARGIN 7, RETENTION 7, BUILD_SPEED 6, COMPETITION(−) 5, LEGAL_RISK(−) 4, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 5

### #38 — Building-management resident dispatch  (score 93)

- **CUSTOMER:** Mgmt companies 20–300 buildings
- **CURRENT HUMAN JOB:** Maintenance coordinator dispatches suppliers
- **EXISTING SPEND:** AllJobs 8735286, 8724616; Drushim 37942984
- **ISRAEL-SPECIFIC REASON:** בתים משותפים, WhatsApp groups
- **TRIGGER:** Resident WhatsApp
- **AGENT LOOP:** Dedupe → dispatch → confirm
- **LAST VALUABLE STEP:** Resolved
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** Supplier report
- **FREQUENCY:** Daily
- **AUTONOMY %:** 70%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** WhatsApp
- **COMPETITION:** BuildApp (AI WhatsApp agent, 140+ cos), Bllink (300+ cos)
- **MARKET SIZE:** 500–1,000 cos
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪500–1,500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Incumbents ship it
- **SCORES:** PAIN 6, EXISTING_SPEND 8, ISRAEL_ADV 6, LAST_MILE 7, VERIFIABILITY 6, FREQUENCY 9, REACHABILITY 7, WTP 5, MARGIN 6, RETENTION 7, BUILD_SPEED 7, COMPETITION(−) 9, LEGAL_RISK(−) 2, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 4

### #39 — Building periodic-inspection calendar  (score 82)

- **CUSTOMER:** Mgmt companies, towers
- **CURRENT HUMAN JOB:** Schedule tests, file certificates
- **EXISTING SPEND:** Budget line items; BuildApp checklists
- **ISRAEL-SPECIFIC REASON:** Israeli standards
- **TRIGGER:** Expiry
- **AGENT LOOP:** Book → parse report → tickets
- **LAST VALUABLE STEP:** Certificate on file
- **CAN AGENT COMPLETE IT?:** Partly
- **VERIFICATION:** Report
- **FREQUENCY:** Yearly
- **AUTONOMY %:** 50%
- **HUMAN TIME / customer / month:** 15 min
- **ACCESS METHOD:** Email/PDF
- **COMPETITION:** BuildApp, CMMS
- **MARKET SIZE:** Same
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪300–800
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Feature not business
- **SCORES:** PAIN 4, EXISTING_SPEND 4, ISRAEL_ADV 6, LAST_MILE 6, VERIFIABILITY 8, FREQUENCY 3, REACHABILITY 6, WTP 4, MARGIN 8, RETENTION 8, BUILD_SPEED 8, COMPETITION(−) 6, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 2, HUMAN_DEP(−) 6

### #40 — Tenant-change holder admin (arnona/water)  (score 67)

- **CUSTOMER:** Rental managers
- **CURRENT HUMAN JOB:** File holder changes per authority
- **EXISTING SPEND:** Midrag fees; TLV form
- **ISRAEL-SPECIFIC REASON:** 250+ municipalities
- **TRIGGER:** Lease change
- **AGENT LOOP:** Meter photos → forms → verify
- **LAST VALUABLE STEP:** Holder changed
- **CAN AGENT COMPLETE IT?:** Partly (identity logins)
- **VERIFICATION:** Next bill
- **FREQUENCY:** Rare per unit
- **AUTONOMY %:** 40%
- **HUMAN TIME / customer / month:** 20 min
- **ACCESS METHOD:** Browser/email
- **COMPETITION:** Landager
- **MARKET SIZE:** Few hundred
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪50–150/transition
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Per-municipality cost
- **SCORES:** PAIN 5, EXISTING_SPEND 3, ISRAEL_ADV 9, LAST_MILE 5, VERIFIABILITY 6, FREQUENCY 3, REACHABILITY 4, WTP 4, MARGIN 6, RETENTION 6, BUILD_SPEED 3, COMPETITION(−) 3, LEGAL_RISK(−) 5, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 6

### #41 — Rent collection for small property managers  (score 83)

- **CUSTOMER:** Managers 20–300 units
- **CURRENT HUMAN JOB:** Cheques, transfers, reminders, receipts
- **EXISTING SPEND:** Midrag ₪45–55/apt collection
- **ISRAEL-SPECIFIC REASON:** Post-dated cheques
- **TRIGGER:** Due date
- **AGENT LOOP:** Match → remind → receipt
- **LAST VALUABLE STEP:** Payment + receipt
- **CAN AGENT COMPLETE IT?:** Yes if bank access
- **VERIFICATION:** Bank
- **FREQUENCY:** Monthly
- **AUTONOMY %:** 65%
- **HUMAN TIME / customer / month:** 20 min
- **ACCESS METHOD:** Bank CSV/aggregator
- **COMPETITION:** Bllink, Landager
- **MARKET SIZE:** Fragmented
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪300–800
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Low WTP
- **SCORES:** PAIN 5, EXISTING_SPEND 4, ISRAEL_ADV 6, LAST_MILE 7, VERIFIABILITY 8, FREQUENCY 7, REACHABILITY 4, WTP 4, MARGIN 7, RETENTION 7, BUILD_SPEED 6, COMPETITION(−) 6, LEGAL_RISK(−) 4, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 4

### #42 — Cleaning-company shift replacement & hours  (score 85)

- **CUSTOMER:** Licensed cleaning contractors
- **CURRENT HUMAN JOB:** Supervisor finds replacements, collects hours
- **EXISTING SPEND:** Drushim 38513535, 38534340, 38181491, 38130001
- **ISRAEL-SPECIFIC REASON:** Multilingual WhatsApp; licensing
- **TRIGGER:** Worker 'sick'
- **AGENT LOOP:** Find replacement → confirm → notify client → hours
- **LAST VALUABLE STEP:** Shift filled
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** Check-in
- **FREQUENCY:** Daily
- **AUTONOMY %:** 65%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** WhatsApp; payroll export
- **COMPETITION:** Shift apps
- **MARKET SIZE:** ~2,000 valid licensees (live-tested dataset)
- **CUSTOMER SOURCE:** Labor ministry dataset
- **EXPECTED PRICE:** ₪500–1,500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Licence dataset queried: validity + expiry available
- **BIGGEST RISK:** Thin margins
- **SCORES:** PAIN 7, EXISTING_SPEND 5, ISRAEL_ADV 5, LAST_MILE 7, VERIFIABILITY 6, FREQUENCY 9, REACHABILITY 8, WTP 4, MARGIN 6, RETENTION 6, BUILD_SPEED 7, COMPETITION(−) 6, LEGAL_RISK(−) 4, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 6

### #43 — Trades quote-to-cash follow-up  (score 82)

- **CUSTOMER:** Small renovators/installers
- **CURRENT HUMAN JOB:** Owner chases quotes, deposits, invoices
- **EXISTING SPEND:** WhatsApp bot vendors ₪179–645; Jobber
- **ISRAEL-SPECIFIC REASON:** Morning/iCount, allocation numbers
- **TRIGGER:** Quote sent
- **AGENT LOOP:** Nudges → deposit link → invoice
- **LAST VALUABLE STEP:** Payment
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** Payment
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 70%
- **HUMAN TIME / customer / month:** 10 min
- **ACCESS METHOD:** Morning API, WhatsApp
- **COMPETITION:** Morning + bots
- **MARKET SIZE:** Thousands
- **CUSTOMER SOURCE:** Registry שיפוצים 4,911
- **EXPECTED PRICE:** ₪150–400
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Price ceiling
- **SCORES:** PAIN 5, EXISTING_SPEND 4, ISRAEL_ADV 5, LAST_MILE 7, VERIFIABILITY 8, FREQUENCY 7, REACHABILITY 7, WTP 3, MARGIN 7, RETENTION 4, BUILD_SPEED 8, COMPETITION(−) 7, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 3

### #44 — Garage WhatsApp front desk  (score 71)

- **CUSTOMER:** Authorised garages (5,146)
- **CURRENT HUMAN JOB:** Front desk books, reminds, approvals
- **EXISTING SPEND:** Very thin
- **ISRAEL-SPECIFIC REASON:** Annual test
- **TRIGGER:** Interval
- **AGENT LOOP:** Remind → book → approve
- **LAST VALUABLE STEP:** Booking
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** Booking
- **FREQUENCY:** Daily
- **AUTONOMY %:** 60%
- **HUMAN TIME / customer / month:** 20 min
- **ACCESS METHOD:** WhatsApp; DMS unknown
- **COMPETITION:** Unknown
- **MARKET SIZE:** 5,146 garages
- **CUSTOMER SOURCE:** data.gov.il garage list
- **EXPECTED PRICE:** ₪200–500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Unvalidated
- **SCORES:** PAIN 4, EXISTING_SPEND 3, ISRAEL_ADV 4, LAST_MILE 6, VERIFIABILITY 6, FREQUENCY 7, REACHABILITY 8, WTP 3, MARGIN 6, RETENTION 5, BUILD_SPEED 7, COMPETITION(−) 5, LEGAL_RISK(−) 2, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 4

### #45 — Delivery-exception desk for Israeli online stores  (score 110)

- **CUSTOMER:** Stores shipping 300–3,000 parcels/mo
- **CURRENT HUMAN JOB:** CS rep watches stuck/returned parcels, contacts customer, reschedules
- **EXISTING SPEND:** AllJobs 8753546, 8747067, 8729702, 8731778; BOA/Datalogics courier apps
- **ISRAEL-SPECIFIC REASON:** Local couriers (Chita/Baldar, HFD, Israel Post), pickup points, Hebrew WhatsApp
- **TRIGGER:** Courier status poll
- **AGENT LOOP:** Classify exception → WhatsApp customer → recreate shipment/redelivery via API → verify delivered
- **LAST VALUABLE STEP:** Parcel delivered / new shipment
- **CAN AGENT COMPLETE IT?:** Partly (some redeliveries phone-only)
- **VERIFICATION:** Courier status
- **FREQUENCY:** Daily
- **AUTONOMY %:** 65%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** Chita Baldar endpoint, HFD WS, Yango API — merchant creds; partly undocumented
- **COMPETITION:** BOA, Datalogics notify only; LionWheel own-fleet
- **MARKET SIZE:** 1,000–2,000 stores (StoreCensus 7,963 Israeli Shopify)
- **CUSTOMER SOURCE:** StoreCensus list
- **EXPECTED PRICE:** ₪500–1,500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run (needs merchant creds)
- **BIGGEST RISK:** Undocumented courier APIs
- **SCORES:** PAIN 7, EXISTING_SPEND 7, ISRAEL_ADV 9, LAST_MILE 6, VERIFIABILITY 9, FREQUENCY 9, REACHABILITY 8, WTP 6, MARGIN 8, RETENTION 8, BUILD_SPEED 6, COMPETITION(−) 4, LEGAL_RISK(−) 2, PLATFORM_RISK(−) 6, HUMAN_DEP(−) 5

### #46 — Hebrew WhatsApp CS agent executing order actions (refund/cancel/address)  (score 116)

- **CUSTOMER:** Fashion/home/cosmetics stores
- **CURRENT HUMAN JOB:** Digital CS rep answers WIMO, cancellations, refunds, credit notes
- **EXISTING SPEND:** Same AllJobs CS listings + 8756002; Glassix $49–65/user; Morning Shopify app
- **ISRAEL-SPECIFIC REASON:** Consumer Protection cancellation rules (5%/₪100 fee), Israeli gateways (Grow, HYP, Cardcom) + credit invoice
- **TRIGGER:** Incoming WhatsApp
- **AGENT LOOP:** Pull order + courier status → intent → law check → refund via gateway + credit invoice → verify refund ID
- **LAST VALUABLE STEP:** Refund + credit note issued / order changed
- **CAN AGENT COMPLETE IT?:** Yes (Grow refundTransaction, HYP refundDeal verified docs)
- **VERIFICATION:** Refund ID + credit-note number
- **FREQUENCY:** Many per day
- **AUTONOMY %:** 75%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** Shopify, Grow, HYP, WhatsApp Cloud — all verified docs
- **COMPETITION:** Supportify (no Hebrew), Glassix (inbox), notification apps
- **MARKET SIZE:** 1,500–3,000 stores with CS
- **CUSTOMER SOURCE:** StoreCensus Israeli Shopify list
- **EXPECTED PRICE:** ₪600–2,000
- **COST TO SERVE:** Med
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run (no sandbox without account); decision logic only
- **BIGGEST RISK:** Merchants won't delegate refunds; global AI CS adds Hebrew
- **SCORES:** PAIN 8, EXISTING_SPEND 8, ISRAEL_ADV 7, LAST_MILE 8, VERIFIABILITY 9, FREQUENCY 10, REACHABILITY 8, WTP 7, MARGIN 7, RETENTION 8, BUILD_SPEED 6, COMPETITION(−) 6, LEGAL_RISK(−) 3, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 4

### #47 — Returns & exchanges ops  (score 99)

- **CUSTOMER:** Fashion/footwear stores
- **CURRENT HUMAN JOB:** Book reverse pickup, refund/exchange
- **EXISTING SPEND:** Datalogics ReturnoAI $200/mo; Returnit
- **ISRAEL-SPECIFIC REASON:** Local couriers, consumer law
- **TRIGGER:** Return request
- **AGENT LOOP:** Eligibility → reverse shipment → refund + credit invoice
- **LAST VALUABLE STEP:** Refund/exchange
- **CAN AGENT COMPLETE IT?:** Mostly (item inspection human)
- **VERIFICATION:** Docs
- **FREQUENCY:** Daily
- **AUTONOMY %:** 60%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** As #45/#46
- **COMPETITION:** Datalogics, Narvar, Returnit
- **MARKET SIZE:** 800–1,500
- **CUSTOMER SOURCE:** StoreCensus
- **EXPECTED PRICE:** ₪400–1,000
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Existing Israeli product
- **SCORES:** PAIN 6, EXISTING_SPEND 7, ISRAEL_ADV 7, LAST_MILE 7, VERIFIABILITY 8, FREQUENCY 7, REACHABILITY 8, WTP 6, MARGIN 7, RETENTION 7, BUILD_SPEED 6, COMPETITION(−) 7, LEGAL_RISK(−) 2, PLATFORM_RISK(−) 5, HUMAN_DEP(−) 5

### #48 — Multi-courier shipment creation  (score 105)

- **CUSTOMER:** Small stores
- **CURRENT HUMAN JOB:** Copy orders into courier portals
- **EXISTING SPEND:** BOA $8–40/mo, Datalogics
- **ISRAEL-SPECIFIC REASON:** Local couriers
- **TRIGGER:** Order
- **AGENT LOOP:** Create shipment → label → write back
- **LAST VALUABLE STEP:** Label
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** Tracking no.
- **FREQUENCY:** Daily
- **AUTONOMY %:** 95%
- **HUMAN TIME / customer / month:** 5 min
- **ACCESS METHOD:** APIs
- **COMPETITION:** Commoditised
- **MARKET SIZE:** Thousands
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪50–150
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** No WTP at target
- **SCORES:** PAIN 4, EXISTING_SPEND 6, ISRAEL_ADV 8, LAST_MILE 9, VERIFIABILITY 9, FREQUENCY 10, REACHABILITY 8, WTP 2, MARGIN 6, RETENTION 6, BUILD_SPEED 8, COMPETITION(−) 10, LEGAL_RISK(−) 1, PLATFORM_RISK(−) 4, HUMAN_DEP(−) 1
- **STATUS:** KILLED: ₪30–150 apps already do the whole loop

### #49 — Zap.co.il feed & repricing ops  (score 104)

- **CUSTOMER:** Electronics/appliance stores on Zap
- **CURRENT HUMAN JOB:** Watch Zap rank, reprice, fix feed
- **EXISTING SPEND:** Zap ~1,500 stores; Zap's own dynamic pricing
- **ISRAEL-SPECIFIC REASON:** Zap Israel-only
- **TRIGGER:** Zap rescan
- **AGENT LOOP:** Scrape → reprice → verify rank
- **LAST VALUABLE STEP:** Price changed
- **CAN AGENT COMPLETE IT?:** Yes
- **VERIFICATION:** Rank
- **FREQUENCY:** Daily
- **AUTONOMY %:** 80%
- **HUMAN TIME / customer / month:** 15 min
- **ACCESS METHOD:** Store APIs; Zap scrape-only
- **COMPETITION:** Zap itself
- **MARKET SIZE:** ~1,500
- **CUSTOMER SOURCE:** Zap store list
- **EXPECTED PRICE:** ₪500–1,500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Platform competes; ToS
- **SCORES:** PAIN 6, EXISTING_SPEND 7, ISRAEL_ADV 8, LAST_MILE 8, VERIFIABILITY 8, FREQUENCY 9, REACHABILITY 9, WTP 6, MARGIN 7, RETENTION 7, BUILD_SPEED 7, COMPETITION(−) 8, LEGAL_RISK(−) 4, PLATFORM_RISK(−) 9, HUMAN_DEP(−) 2
- **STATUS:** KILLED in red team: Zap sells repricing, scrape-only

### #50 — Insurance agency renewals back office  (score 94)

- **CUSTOMER:** General-insurance agencies
- **CURRENT HUMAN JOB:** Ops clerk pulls renewal quotes from insurer portals, processes renewals
- **EXISTING SPEND:** Drushim 38156031, 37816615, 37767177, 38464553; AllJobs 8750096, 8713556
- **ISRAEL-SPECIFIC REASON:** Hebrew insurer portals; CMA licensing
- **TRIGGER:** 45 days before expiry
- **AGENT LOOP:** Pull quote → compare → WhatsApp client → issue in portal → verify policy no.
- **LAST VALUABLE STEP:** Policy issued
- **CAN AGENT COMPLETE IT?:** Browser + 2FA; licensed approval gate
- **VERIFICATION:** Policy number
- **FREQUENCY:** Daily
- **AUTONOMY %:** 45%
- **HUMAN TIME / customer / month:** 45 min
- **ACCESS METHOD:** Insurer agent portals, browser-only, 2FA
- **COMPETITION:** Surense, Finance 360
- **MARKET SIZE:** 1,500–3,000 agencies
- **CUSTOMER SOURCE:** gov.il licensed-agent registry
- **EXPECTED PRICE:** ₪800–2,000
- **COST TO SERVE:** Med
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run (no portal access)
- **BIGGEST RISK:** Insurer bot-blocking; licensing
- **SCORES:** PAIN 8, EXISTING_SPEND 8, ISRAEL_ADV 9, LAST_MILE 4, VERIFIABILITY 7, FREQUENCY 8, REACHABILITY 8, WTP 7, MARGIN 7, RETENTION 8, BUILD_SPEED 3, COMPETITION(−) 4, LEGAL_RISK(−) 6, PLATFORM_RISK(−) 8, HUMAN_DEP(−) 5

### #51 — Har HaBituach / Mislaka data pulls  (score 72)

- **CUSTOMER:** Pension/insurance agents
- **CURRENT HUMAN JOB:** Pull client data, normalize
- **EXISTING SPEND:** Mislaka ₪5–18/request; consent forms
- **ISRAEL-SPECIFIC REASON:** Israel-only systems
- **TRIGGER:** Consent
- **AGENT LOOP:** Pull → parse → report
- **LAST VALUABLE STEP:** Report
- **CAN AGENT COMPLETE IT?:** Report only; advice licensed
- **VERIFICATION:** —
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 40%
- **HUMAN TIME / customer / month:** 30 min
- **ACCESS METHOD:** OTP consumer login; licensed interfaces
- **COMPETITION:** Agent CRMs
- **MARKET SIZE:** ~14k licensees
- **CUSTOMER SOURCE:** Registry
- **EXPECTED PRICE:** ₪300–800
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** Partly
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Licensing, platform blocks
- **SCORES:** PAIN 6, EXISTING_SPEND 6, ISRAEL_ADV 10, LAST_MILE 3, VERIFIABILITY 6, FREQUENCY 6, REACHABILITY 8, WTP 5, MARGIN 7, RETENTION 6, BUILD_SPEED 4, COMPETITION(−) 7, LEGAL_RISK(−) 8, PLATFORM_RISK(−) 9, HUMAN_DEP(−) 5

### #52 — Execution Office (הוצל"פ) file operations  (score 74)

- **CUSTOMER:** Collection law firms
- **CURRENT HUMAN JOB:** Clerk updates files, files routine requests
- **EXISTING SPEND:** AllJobs 8747423, 8767409, 8795900; Drushim 37466217, 37704420
- **ISRAEL-SPECIFIC REASON:** Unique system
- **TRIGGER:** Status poll
- **AGENT LOOP:** Decide → file
- **LAST VALUABLE STEP:** Filing
- **CAN AGENT COMPLETE IT?:** No — lawyer smart card
- **VERIFICATION:** —
- **FREQUENCY:** Daily
- **AUTONOMY %:** 20%
- **HUMAN TIME / customer / month:** —
- **ACCESS METHOD:** Smart card, browser
- **COMPETITION:** Entrenched incumbents
- **MARKET SIZE:** Hundreds
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪1–3k
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Smart card + legal
- **SCORES:** PAIN 7, EXISTING_SPEND 8, ISRAEL_ADV 10, LAST_MILE 2, VERIFIABILITY 6, FREQUENCY 9, REACHABILITY 6, WTP 7, MARGIN 7, RETENTION 8, BUILD_SPEED 2, COMPETITION(−) 7, LEGAL_RISK(−) 9, PLATFORM_RISK(−) 9, HUMAN_DEP(−) 8
- **STATUS:** KILLED: lawyer smart card

### #53 — Net HaMishpat decision/deadline monitor  (score 74)

- **CUSTOMER:** Small law firms
- **CURRENT HUMAN JOB:** Check decisions, calendar deadlines
- **EXISTING SPEND:** Official app; extension
- **ISRAEL-SPECIFIC REASON:** Israeli courts
- **TRIGGER:** Daily
- **AGENT LOOP:** Detect → compute deadline → task
- **LAST VALUABLE STEP:** Deadline calendared
- **CAN AGENT COMPLETE IT?:** Deadline calc borders legal judgment
- **VERIFICATION:** Calendar
- **FREQUENCY:** Daily
- **AUTONOMY %:** 40%
- **HUMAN TIME / customer / month:** 15 min
- **ACCESS METHOD:** Smart card
- **COMPETITION:** Official app, firm systems
- **MARKET SIZE:** Many lawyers
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪200–500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Access & liability
- **SCORES:** PAIN 6, EXISTING_SPEND 4, ISRAEL_ADV 9, LAST_MILE 4, VERIFIABILITY 7, FREQUENCY 9, REACHABILITY 7, WTP 5, MARGIN 7, RETENTION 8, BUILD_SPEED 3, COMPETITION(−) 7, LEGAL_RISK(−) 8, PLATFORM_RISK(−) 9, HUMAN_DEP(−) 5

### #54 — Paramedical clinic kupot-commitment tracking  (score 68)

- **CUSTOMER:** Speech/OT/physio clinics
- **CURRENT HUMAN JOB:** Medical secretary tracks Form 17 expiries, reminds parents
- **EXISTING SPEND:** Drushim 37776088; AllJobs 8712327
- **ISRAEL-SPECIFIC REASON:** Kupot holim system
- **TRIGGER:** Expiry
- **AGENT LOOP:** Remind parent → confirm upload
- **LAST VALUABLE STEP:** New commitment
- **CAN AGENT COMPLETE IT?:** No — patient requests it
- **VERIFICATION:** —
- **FREQUENCY:** Weekly
- **AUTONOMY %:** 35%
- **HUMAN TIME / customer / month:** 20 min
- **ACCESS METHOD:** Opaque portals
- **COMPETITION:** Clinic systems
- **MARKET SIZE:** Thousands
- **CUSTOMER SOURCE:** easy.co.il
- **EXPECTED PRICE:** ₪200–500
- **COST TO SERVE:** Low
- **CHATGPT TEST (could one upload give 80%?):** No
- **DRY-RUN RESULT:** Not run
- **BIGGEST RISK:** Patient owns last step; health data
- **SCORES:** PAIN 6, EXISTING_SPEND 6, ISRAEL_ADV 8, LAST_MILE 3, VERIFIABILITY 5, FREQUENCY 7, REACHABILITY 6, WTP 4, MARGIN 7, RETENTION 7, BUILD_SPEED 5, COMPETITION(−) 5, LEGAL_RISK(−) 7, PLATFORM_RISK(−) 7, HUMAN_DEP(−) 8

### #55 — Studio renewals & failed payments  (score 78)

- **CUSTOMER:** Yoga/pilates/CrossFit
- **CURRENT HUMAN JOB:** Chase renewals
- **EXISTING SPEND:** Arbox, Boostapp
- **ISRAEL-SPECIFIC REASON:** —
- **TRIGGER:** Expiry
- **AGENT LOOP:** Already automated
- **LAST VALUABLE STEP:** —
- **CAN AGENT COMPLETE IT?:** —
- **VERIFICATION:** —
- **FREQUENCY:** —
- **AUTONOMY %:** —
- **HUMAN TIME / customer / month:** —
- **ACCESS METHOD:** Enterprise-only API
- **COMPETITION:** Arbox/Boostapp own it
- **MARKET SIZE:** —
- **CUSTOMER SOURCE:** —
- **EXPECTED PRICE:** ₪100–300
- **COST TO SERVE:** —
- **CHATGPT TEST (could one upload give 80%?):** —
- **DRY-RUN RESULT:** Killed
- **BIGGEST RISK:** Incumbents
- **SCORES:** PAIN 4, EXISTING_SPEND 7, ISRAEL_ADV 5, LAST_MILE 6, VERIFIABILITY 8, FREQUENCY 7, REACHABILITY 8, WTP 3, MARGIN 6, RETENTION 6, BUILD_SPEED 5, COMPETITION(−) 10, LEGAL_RISK(−) 1, PLATFORM_RISK(−) 9, HUMAN_DEP(−) 3
- **STATUS:** KILLED: Arbox/Boostapp
