# Phase C: sales and money, the build plan

*17.11.2026. Scope is kickoff §10 C, with decisions 4–7, 13, 16 and 19 and
§7 (the shop link). Phase B is on main and staging (`docs/phase-b.md`); its
real-phone test comes later (`docs/phase-b-phone-test.md`). Dim's answers to
the open choices are on the Phase C decisions page (round 6, see
`booking-decisions-page` in Claude's memory); the table below records
them.*

**Done when** one real barber's month closes in the app: every product he
sold or took is on his statement, the shop's stock went down for each one,
and Renat issues one numbered invoice PDF (rent, items, the 17 %) that goes
to the barber by e-mail and matches what Isolta would have sent.

## Dim's answers (17.11.2026, decisions page round 6)

None of the 11 had been tapped when the build started, so each is the
page's recommended option. Each one that Renat or Isolta may still change
is a setting, not code.

| Question | Answer |
|---|---|
| Start now | **Yes**, on demo data. Only C5's first real invoice waits for Isolta and the accountant |
| Who takes the client's money | **The barber.** REMPIRE sells him the product at the shop price, and his 17 % comes off the same invoice as a minus line. So no Renat question is needed |
| Purchase prices | **In the shop**, an admin-only field on the variant |
| Shop side now | **Yes, on a branch.** The push waits for Dim's OK |
| The 17 % basis until Renat Q1 | **Price paid, without VAT.** A switch in «Счета» → «Компания» (net paid, gross paid, list price) |
| Photo match | **In the shop, with its own OpenAI key** |
| How often | **Monthly**, drafts from the 1st (the billing day is a setting, 1–28) |
| Renat checks | **Drafts**, Renat taps «Выставить» |
| Numbers | **Continue Isolta's series.** «Компания» → «Последний номер» takes Isolta's last number once |
| Barber sees his balance | **Yes, live**, in «Ещё» → «Мои расчёты» |
| E-invoices | **PDF now**, an e-invoice if a barber's company asks |

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
| C1 | **Receivers, issuer, rent.** In the admin, «Счета» → «Получатели»: a person, FIE or OÜ, with the legal name, registry code, KMKR number, address, e-mail, payment terms, VAT on or off, and the barber it belongs to. REMPIRE's own company details go in the admin settings. Each barber's chair rent has a valid-from date, so a change never rewrites old months. | The real details from Isolta. Demo data until then | **built**; real data waits on Isolta |
| C2 | **Shop link (shop branch).** The purchase price field and the three partner endpoints in `rempire-web`, on a branch, with tests, against the shop's own test database only. Booking calls them through one small client (`src/lib/shop.ts`). With no `SHOP_API_URL` it falls back to a **fake shop** of demo products, as push does without its keys. | Dim's OK to push the shop branch; `SHOP_API_URL` and `SHOP_API_SECRET` (booking), the same secret in the shop as `BOOKING_API_SECRET`; Renat's purchase prices | **on the shop branch `booking-partner-api`, not pushed**; booking's client and fake shop built |
| C3 | **Selling in the app.** The camera scan (`BarcodeDetector` where the phone has it, otherwise a small JS reader), the name search, client or self, the quantity, the price shown before the tap, and an undo within a few minutes. Each sale gets a `ref` first and is sent to the shop with retries through the outbox, so a bad connection never sells twice or loses a sale. | | **built**; staging sells from the fake shop |
| C4 | **Statement.** The running ledger for each barber, in the app and in the admin, from `product_sales`, `chair_rents` and `invoices`. The 17 % basis is a setting (Renat Q1); until he answers, it is Dim's pick on the decisions page. | Renat Q1 | **built**; the basis starts as net paid |
| C5 | **Invoices.** On the 1st, a draft for every receiver with something to bill. Renat checks it, changes lines if needed and taps «Выставить». That gives the number (`invoice_counters`, the shop's `141_invoices.sql` pattern), the PDF (`pdf-lib`, after the shop's `src/lib/invoice-pdf.ts`: the legal minimum of VAT Act §37, the tower, Estonian with an English line) and the e-mail through Resend with the PDF attached. Then «оплачен» when the money arrives, and a credit invoice for a correction. | From Isolta: the issuer, VAT, the layout and the last invoice number; the accountant's view on the 17 % (below) | **built**; the first real invoice waits on Isolta and the accountant |
| C6 | **Overview.** Renat's month across all barbers, and a CSV export for the accountant. | | **built** |
| C7 | **Photo match.** The camera or a screenshot goes to the shop's identify endpoint, which shows 3 candidates, and the barber taps one. Barcode scanning comes first. This is the backup while few barcodes are bound (kickoff §7.1). | The shop's OpenAI account, already there | **built** in booking (the fake shop returns 3 demo products for any photo); real matching comes with C2 |

C1 and C2 can start at once and side by side: C1 lives in booking's admin,
C2 in the shop. C3 needs C2's client, even if only its fake shop. C4
follows C3, C5 follows C1 and C4, and C6 comes last. C7 can come any time
after C3.

## As built (17.11.2026)

Everything below runs on staging with demo barbers, demo companies
(made-up registry codes, e-mail `delivered@resend.dev`) and the fake shop.

- **«Продать»** (`/b/sell`, the barber app's fourth tab):
  - a barcode by camera (`BarcodeDetector`, else `@zxing/browser`), a name
    search, or a photo (C7);
  - «Клиенту» or «Себе», up to 20 pieces, the price and his share shown
    before the tap.
  - The phone makes the sale's `ref`. A sale that can't reach the server
    waits on the phone and is sent again (the same `ref` is the same sale).
  - **Undo** for 5 minutes. The shop hears of a sale only after that, so
    an undone sale never touches its stock. After 5 minutes Renat reverses
    it with a minus row («Сторно» in the admin) and puts the stock back in
    the shop by hand (the shop has no return endpoint).
  - The shop sync retries from the cron. A sale the shop refuses for good
    shows in the admin's month with «Повторить».
- **Money rules:**
  - All amounts are gross (VAT inside), in cents.
  - The 17 % is stored on each sale when it is made, so a later change of
    the basis or the share never rewrites old sales.
  - «Себе» = the shop's purchase price (without VAT) × 1.24, no
    commission. A product with no purchase price can't be taken «себе».
- **«Счета» in the admin** (the fifth tab; since 19.11.2026 in Isolta's
  look and order, `docs/reference-looks.md`):
  - **Счета** (the tab it opens on): every invoice in one table, with a
    search and a status filter. «Новый счёт» asks for the receiver and
    opens his draft: the one he has, the month being invoiced, or an empty
    free invoice (`invoices.free`, 015).
  - **Месяц** (`/admin/invoices/month`): per barber: sold, 17 %, self,
    rent, billed, paid, open.
    «Собрать черновики», the month's invoices, and two CSVs for the
    accountant (invoices, lines). It opens on the month before.
  - **Счёт:**
    - A draft's lines save as you type.
    - «Выставить» takes the next number from `invoice_counters`, freezes
      the PDF data and e-mails the PDF through the outbox.
    - Then «Оплачен», «Отправить ещё раз», or «Кредитовать». A credit
      invoice is a full credit, issued at once, with its own number.
  - **Получатели:** person, FIE or OÜ, VAT on or off, the barber it
    belongs to.
    - Chair rent with a valid-from month. A rent can't start in a month
      that is already invoiced.
  - **Компания:** REMPIRE's company (the owner only), the number format,
    «Последний номер» (it only goes up), the 17 %, its basis and the
    billing day.
- **«Мои расчёты»** (`/b/money`, from «Ещё»): his month, his invoices with
  the PDF, and his sales. A draft shows as «готовится». It opens on the
  current month.
- **The cron** (`/api/cron/outbox`) sends the messages first. Then it
  sends the waiting sales to the shop (at most 40 s a run) and, from the
  billing day on, makes the month's drafts.
- **The PDF** (`src/lib/billing/pdf.ts`) carries the minimum of VAT Act §37,
  in Estonian with English under it. Fonts: Oswald, Golos Text and PT Mono,
  all under the Open Font License, in `src/app/fonts/`.

## The shop branch (C2), waiting for Dim's OK

`rempire-web`, local branch `booking-partner-api`, 3 commits up to
`ec90982c`, **not pushed**. All 8204 shop tests and its typecheck pass. The
contract is the shop's `docs/partner-api.md`; booking's `src/lib/shop.ts`
already speaks it.

> **Never push `booking-partner-api` to `rempireshop/rempire-web`, not even
> as a branch.**
>
> - The live shop's Vercel project sets `DATABASE_URL`, the Montonio and R2
>   keys, `TELEGRAM_BOT_TOKEN` and `CRON_SECRET` for «All Environments».
> - So a pushed branch builds a Preview that holds the live values.
> - Its `postbuild` (`migrate --if-configured`) would then run
>   `230_partner_api.sql` on the **production** database.
>
> The branch reaches the live shop only as a merge into `main`, with Dim's
> OK, at the moment he wants it deployed. Until then it is tested on this
> computer only (§ Testing the shop link locally).

What the merge changes on the live shop:

- **Migration `230_partner_api.sql`**, run once at deploy:
  - a new table `purchase_prices`;
  - `orders.partner_ref` (unique) and `orders.barber`;
  - two check constraints widened: the channel `barber` and the stock reason
    `sale_barber`.
- **Three routes** under `/api/partner/`. They answer 503 until
  `BOOKING_API_SECRET` is set.
- **Admin:**
  - «Склад» gets «Закупка без НДС».
  - «Заказы» shows a «Барбер» badge; barber sales show under «Салон».
- **A barber sale** is a paid order with no letter, no loyalty points and no
  ping. It counts in «Аналитика», and stock goes down with `sale_barber`.
  Web checkout is unchanged.
- **Photo match** uses the shop's `OPENAI_API_KEY`, about a cent a photo.

Watch for:

- Whoever holds the secret can create paid orders at any price, so it stays
  only in the two Vercel projects, marked Sensitive.
- The shop's `go-live-reset --clear` deletes barber orders along with test
  orders. Don't run it once real barber sales exist.

Then set `SHOP_API_URL` and `SHOP_API_SECRET` in booking's Vercel. Until
then staging stays on the fake shop.

## Testing the shop link locally

`npm run test:shop-link` (`tools/shop-link-local.mjs`) is the automated
check of the shop branch against booking. It is a developer check, not the
staging test run (that is `docs/test-run.md`).

- It runs the shop from its worktree
  `rempire-web/.claude/worktrees/booking-partner-api` on port 3300 and booking
  on 3400, each on an empty PGlite database in the temp folder.
- Each process gets a clean environment built from a short list. It refuses
  to start on the main shop checkout, on `main`, beside any `.env*` file, or
  when a live-looking variable (`DATABASE_URL`, Montonio, R2, Telegram,
  Resend…) would leak in. So run it from a booking worktree.
- Secrets are random per run and stay in memory. The shop gets fake
  barcodes, stock 10 and purchase prices on three products.
- It walks the phone (Playwright, 390 px): a client sale by search, a self
  sale at purchase × 1.24, a camera scan, the cron, a retry with the same
  `ref`, the shop down and back, then the shop's orders and stock, the
  «Барбер» badge, no letter or ping, `/b/money` and Renat's invoice draft.
- Not covered: photo match (it needs the shop's OpenAI key), real phones,
  real e-mail.

`--keep` leaves both servers up at the end. A failed run keeps its logs and
prints the folder.

## The staging test run in code (R2, 18.11.2026)

The plan is `docs/test-run.md`. What booking does for it:

- **`SHOP_SALES`** (`src/lib/sales.ts`): only `on` sends sales to the shop.
  - Off, a sale is saved with `sync_status = 'test'` and the cron never
    sends it, not even one queued before.
  - The statement and the invoice drafts count it. The barber's list and
    Renat's show «тест».
  - A sale «себе» with no purchase price books 0 €, marked «закупочная цена
    не указана» (`mode = 'self'`, `purchase_cents` null). With `on` it is
    refused, as before.
- **One staging switch**, `testRun()` in `src/lib/test-run.ts`: on until
  `ALLOW_INDEXING=yes`, the same switch noindex reads. It drives:
  - **the line** `src/components/test-banner.tsx`: client pages, the
    admin and `/b`. In the admin and `/b` it sits above the top bar, in the
    room admin.css keeps for `.test-banner`;
  - **the mail guard** (`mailGuard`, used by the outbox): a staff login's
    address gets the letter marked «[ТЕСТ]»; anyone else's goes to the
    shop inbox (`TEST_MAIL_TO` overrides it), with who it was for on top.
    Login codes go straight to the person;
  - **invoices**: numbers `TEST-…` from their own counter
    (`invoice_counters.test`), and a «ТЕСТ / NÄIDIS» stamp on every page of
    the PDF;
  - **«Сообщить о проблеме»**: saved to `problem_reports` (text, screen,
    login, time). Renat reads them at `/admin/reports`; the banner links
    there with the open count.
- Migration `011_test_run.sql`. Tests: `tests/test-run.test.ts`. Every
  other test file runs as production (`vitest.config.mts` sets
  `ALLOW_INDEXING=yes`).
- **At the move:** set `ALLOW_INDEXING=yes`, and `SHOP_SALES=on` once the
  full partner API is live. The test sales, invoices and reports get wiped
  (R6). The real invoice series was never used.

## Data

Built as `db/migrations/010_sales_invoices.sql`, after the outline in
`docs/data-model.md` § Phase C: `product_sales`,
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
| Isolta access: issuer, VAT, rents, receivers, layout, last number | C1 real data, C5 |
| Renat Q1: the 17 % basis | C4 setting |
| The accountant: the two points above | C5's first real invoice |
| Dim's OK to push the shop branch, and the API secret pair | C2 live, C3 real stock |
| Renat's purchase prices in the shop | «for himself» sales |
