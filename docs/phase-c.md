# Phase C: sales and money, the build plan

*17.11.2026. Scope is kickoff §10 C, with decisions 4–7, 13, 16 and 19 and
§7 (the shop link). Phase B is on main and staging (`docs/phase-b.md`); its
real-phone test comes later (`docs/phase-b-phone-test.md`). Dim's answers to
the open choices are on the Phase C decisions page (round 6, see
`booking-decisions-page` in Claude's memory). Until he answers, the
recommended option there is the plan.*

**Done when** one real barber's month closes in the app: every product he
sold or took is on his statement, the shop's stock went down for each one,
and Renat issues one numbered invoice PDF (rent, items, the 17 %) that goes
to the barber by e-mail and matches what Isolta would have sent.

## What it is

- **«Продать» in the barber app** (`/b/sell`):
  - scan the barcode with the phone's camera;
  - or search the shop's products by name;
  - or take a photo or screenshot, matched by AI (decision 4).
  - Then one of two modes:
    - **to a client**, at the shop price, with 17 % to the barber;
    - **for himself**, at the purchase price, with no commission (decision 16).
- **The shop link** goes through the API, never a shared database
  (decision 6). These are shop changes (kickoff §7.3), so they are built on a
  branch of `rempire-web`, and pushed only with Dim's OK:
  - the purchase price on a variant, admin-only, never in feeds or public
    responses;
  - `GET /api/partner/products/lookup` (by barcode or text);
  - `POST /api/partner/products/identify` (a photo goes in, candidates come
    out). It uses the shop's own OpenAI account, so booking never holds that
    key;
  - `POST /api/partner/barber-sales`: an order with `channel: 'barber'`,
    stock reason `sale_barber`, idempotent by `ref`.
- **The barber's statement:** a running balance per barber, in the app
  («Ещё» → «Мои расчёты») and in the admin. It lists sales, self-purchases,
  the 17 %, rent and invoices.
- **Invoices replace Isolta** (decision 7):
  - REMPIRE's company issues them (`invoice_issuers`). The receivers are the
    barbers' FIE or OÜ, or a person: CRUD, each with its own VAT setup
    (decision 13).
  - Chair rent per barber.
  - A monthly draft that Renat checks, then issue: a number with no gaps,
    a PDF, e-mailed (decision 19), «оплачен», and a credit invoice for a
    correction.
  - Never edited once issued, never deleted.
- **Renat's overview:**
  - the month per barber: sold, commission, rent, invoiced, paid, open;
  - a CSV for the accountant.

## Milestones

| # | What | Needs from outside | Status |
|---|---|---|---|
| C1 | **Receivers, issuer, rent.** In the admin, «Счета» → «Получатели»: a person, FIE or OÜ, with the legal name, registry code, KMKR number, address, e-mail, payment terms, VAT on or off, and the barber it belongs to. REMPIRE's own company details go in the admin settings. Each barber's chair rent has a valid-from date, so a change never rewrites old months. | The real details from Isolta. Demo data until then | |
| C2 | **Shop link (shop branch).** The purchase price field and the three partner endpoints in `rempire-web`, on a branch, with tests, against the shop's own test database only. Booking calls them through one small client (`src/lib/shop.ts`). With no `SHOP_API_URL` it falls back to a **fake shop** of demo products, as push does without its keys. | Dim's OK to push the shop branch; `SHOP_API_URL` and `SHOP_API_SECRET` (booking), the same secret in the shop as `BOOKING_API_SECRET`; Renat's purchase prices | |
| C3 | **Selling in the app.** The camera scan (`BarcodeDetector` where the phone has it, otherwise a small JS reader), the name search, client or self, the quantity, the price shown before the tap, and an undo within a few minutes. Each sale gets a `ref` first and is sent to the shop with retries through the outbox, so a bad connection never sells twice or loses a sale. | | |
| C4 | **Statement.** The running ledger for each barber, in the app and in the admin, from `product_sales`, `chair_rents` and `invoices`. The 17 % basis is a setting (Renat Q1); until he answers, it is Dim's pick on the decisions page. | Renat Q1 | |
| C5 | **Invoices.** On the 1st, a draft for every receiver with something to bill. Renat checks it, changes lines if needed and taps «Выставить». That gives the number (`invoice_counters`, the shop's `141_invoices.sql` pattern), the PDF (`pdf-lib`, after the shop's `src/lib/invoice-pdf.ts`: the legal minimum of VAT Act §37, the tower, Estonian with an English line) and the e-mail through Resend with the PDF attached. Then «оплачен» when the money arrives, and a credit invoice for a correction. | From Isolta: the issuer, VAT, the layout and the last invoice number; the accountant's view on the 17 % (below) | |
| C6 | **Overview.** Renat's month across all barbers, and a CSV export for the accountant. | | |
| C7 | **Photo match.** The camera or a screenshot goes to the shop's identify endpoint, which shows 3 candidates, and the barber taps one. Barcode scanning comes first. This is the backup while few barcodes are bound (kickoff §7.1). | The shop's OpenAI account, already there | |

C1 and C2 can start at once and side by side: C1 lives in booking's admin,
C2 in the shop. C3 needs C2's client, even if only its fake shop. C4
follows C3, C5 follows C1 and C4, and C6 comes last. C7 can come any time
after C3.

## Data

The next free migration number when the work starts (010 today). The
outline is `docs/data-model.md` § Phase C: `product_sales`,
`invoice_issuers`, `invoice_receivers`, `chair_rents`, `invoices`,
`invoice_lines`, `invoice_counters`. Also:

- `settings`: the 17 % basis and the billing day.
- Every money row carries cents and basis points (`vat_bp`,
  `commission_bp` 1700), never floats.
- No hard deletes. A wrong sale is reversed by a minus row, and an issued
  invoice is corrected by a credit invoice.

## Two points for the accountant (before C5 issues a real invoice)

- **Who takes the client's money for a product** decides how the 17 % is
  booked (decisions page). Both cases end in one net invoice; the
  bookkeeping differs.
  - **The barber takes it:** REMPIRE sells him the product at the shop
    price minus 17 %. That is one line with a discount, on REMPIRE's VAT.
  - **REMPIRE's till takes it:** the 17 % is the barber's own service to
    REMPIRE. If his company is VAT-registered, it carries his VAT and may
    need a self-billing agreement.
- **VAT per receiver** (decision 13): on a domestic invoice VAT follows the
  issuer. If REMPIRE has two companies, the model already holds both
  (`docs/data-model.md`).

## E-invoices (e-arve)

PDF by e-mail is enough today (decision 19). Since 1.7.2025 a buyer
company that is registered as an e-invoice recipient may **ask** for a
machine-readable invoice (EN 16931). This is a right, not a general duty.
So:

- PDF first;
- the invoice data is kept whole (lines, VAT, both parties), so an e-invoice
  through an operator can be added when a barber's company asks for one.

Check the current Raamatupidamise seadus wording before the move.

## Rules

- **The live shop is never touched without Dim's OK:** its code on a branch,
  its database never written from booking's staging. Staging uses the fake
  shop until Dim says to connect a real one.
- **A barber sees only his own sales, statement and invoices**
  (`requireStaff()`). Renat sees all of them.
- **The shop stays the one place for products, prices and stock.** Booking
  stores what was sold at the price of that moment, and never keeps its own
  catalogue.
- **The 17 % is computed and stored in booking**, never in the shop
  (kickoff §7.3).
- **Invoice numbers have no gaps and no twins.** A number is handed out only
  at «Выставить», never for a draft.
- **No real client or barber data in the repo**; tests and seeds use fake
  companies.

## Waiting on

| What | For |
|---|---|
| Dim's answers on the Phase C decisions page | C1–C7 details |
| Isolta access: issuer, VAT, rents, receivers, layout, last number | C1 real data, C5 |
| Renat Q1: the 17 % basis | C4 setting |
| The accountant: the two points above | C5's first real invoice |
| Dim's OK to push the shop branch, and the API secret pair | C2 live, C3 real stock |
| Renat's purchase prices in the shop | «for himself» sales |
