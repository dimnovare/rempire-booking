# The test run: Renat and the barbers on staging

*Plan, 17.11.2026, for Dim to check on 18.11. Nothing here is built yet. Dim's
choices are on decisions page round 7 (memory `booking-decisions-page`).*

**Goal:** Renat and his barbers use staging
(`rempire-booking.diipsolutions.eu`) on their own phones for a few days, as
close to the real thing as possible:

- real barbers, services and prices;
- the real shop catalogue: names, prices, photos, barcodes;
- selling by scan, search and photo;
- the barber's balance;
- a test invoice.

**The one hard limit:** nothing in the live shop changes. No stock count,
order, setting or deploy, and no preview build of the shop's repo.

## Why the shop needs its own test copy

Booking talks to the shop through the partner API on the shop branch
`booking-partner-api`, which is local and not pushed. That branch can't
simply go live or onto a preview:

- **A real sale lowers the live stock.** That is the point of the API, so the
  live shop can't take test sales.
- **The live shop's previews share production.** In the live Vercel project
  `rempire-web`, `DATABASE_URL`, the Montonio, R2 and Telegram keys and
  `CRON_SECRET` are set for "All Environments" (checked 17.11).
  - Every pushed branch builds a Preview with them.
  - The build's `postbuild` runs migrations on that database.
  - So pushing the branch to `rempireshop/rempire-web`, even unmerged, would
    migrate the **production** database. It stays unpushed there.

So the test copy is a **second shop of its own**: the same code, its own
database, its own Vercel project, and a copy of the live catalogue.

## The shape

```
barber's phone ──> booking staging ──partner API──> TEST shop ──> its own database
  (PWA /b)         rempire-booking.diipsolutions.eu  shop-test.diipsolutions.eu    (a catalogue copy)
                                                         │
                                live shop: never called; its photos are only shown
```

### 1. The test shop

- **Code:** the live shop's `main` plus the branch's commits, in a separate
  **private mirror repo**, for example `dimnovare/rempire-shop-test`. The live
  Vercel project never sees that repo, so no live preview is built.
- **Deploy:** GitHub Actions in the mirror deploys to a new Vercel project
  `rempire-shop-test` on Rempire's Pro team, with Git integration off. That
  is how booking deploys today (`ci.yml`, `VERCEL_TOKEN`).
- **Address:** `shop-test.diipsolutions.eu`, a CNAME in Dim's Cloudflare.
  - It must be off `*.rempireshop.com`. The shop treats any host there as
    the live shop: robots open, the Meta Pixel and the Cloudflare beacon,
    IndexNow, the deploy hook.
  - Off that domain the shop is noindex by itself (`X-Robots-Tag`, plus
    meta and robots with `PUBLIC_BASE_URL` off rempireshop.com).
  - Check it with booking's `check:noindex`.
- **Database:** a second database, `shop_test`, on booking's Railway
  Postgres server. It is free and apart from the live shop's Railway
  project.
- **Env vars** (names only; Dim sets the values). Only these:
  - `DATABASE_URL`: the test database.
  - `SESSION_SECRET` and `ADMIN_PASSWORD_HASH`: a test admin login for Renat
    and Dim.
  - `PAYMENT_PROVIDER=mock`.
  - `PUBLIC_BASE_URL=https://shop-test.diipsolutions.eu`.
  - `BOOKING_API_SECRET`: the same value as booking's `SHOP_API_SECRET`.
  - `OPENAI_API_KEY`, only for the photo match (choice on the page).

  **Never set in the test shop:** Montonio, Resend, Telegram, R2, VAPID,
  `CRON_SECRET`, `DEPLOY_HOOK_URL`, GSC. Without them it can't take money,
  mail customers, ping Renat's shop bot, upload into the live photo bucket,
  or run the shop's crons.

### 2. The catalogue copy

- Products, categories and the base photos are in the shop's code
  (`public/shop/catalogue2.js` and `/shop/img/`), so the test shop has them
  from the start.
- The rest is in the live database. A new script on the branch,
  `tools/catalogue-snapshot.mjs`, copies only that:
  - `product_overrides`: prices, hidden, gallery;
  - `custom_products`;
  - `stock_levels`: the counts and the bound barcodes;
  - `bundles`;
  - the catalogue and VAT parts of `settings`.
- **Never copied:** orders, customers, carts, accounts, reviews, gift cards,
  newsletters, events, or anything else the shop's `go-live-reset` PLAN marks
  as personal.
- **How it runs:** Dim runs it in his own terminal, with the live and test
  database addresses in two env vars, so Claude never sees either address.
  It reads the live database inside one `READ ONLY` transaction, so Postgres
  itself refuses any write.
- **Running it again** refreshes the copy and wipes the test sales. Run it
  before each test day if wanted.
- **Photos** are the live shop's public image links, only shown. Nothing is
  uploaded.
- **Purchase prices** don't exist in the live shop yet. Renat types them into
  the test shop's «Склад». They are kept, and moved to the live shop when C2
  goes live, so he types them only once.

### 3. Booking staging, set up for real use

- **Shop link:** `SHOP_API_URL=https://shop-test.diipsolutions.eu` and
  `SHOP_API_SECRET`. Then the fake shop is off.
- **Real barbers, services, prices and hours:**
  - Renat edits the demo rows in the admin. The demo seed never overwrites
    an edited row (`tools/seed-demo.mjs`).
  - If Altegio access comes first, the A7 import does it instead.
- **Logins:** one per barber in «Доступ» (role barber, with his column), using
  his own e-mail. He logs in with the e-mail code and installs the app
  (`docs/phase-b-phone-test.md`).
- **Clients in tests are fake, or the testers themselves.** Never a real
  client's name or phone.
- **A test banner:** a thin «Тестовая версия» line on every staging page,
  in the client pages, the admin and `/b`. It goes at the move.
- **A staging mail guard:**
  - Login codes go to the person, as now.
  - Every other letter goes out only to a staff login's address. That covers
    client confirmations, reminders and invoices.
  - Anything else is redirected to the shop inbox and marked.
  - So a real client's address typed by mistake gets nothing.
- **Test invoices:**
  - On staging every PDF carries a large «ТЕСТ / NÄIDIS» stamp.
  - Their numbers use a staging-only series, so no test number is ever used
    up.
  - The receivers are the barbers' companies with their real or test
    details. The issuer stays demo until Isolta.
- **Feedback:** a «Сообщить о проблеме» button on staging, in the admin and
  `/b`. The tester writes a line, and the screen and the time are saved, so
  Claude reads the whole test run back from the database.

### 4. The test days

- **Who:** Renat and one or two barbers first (choice on the page), then
  everyone.
- **For them:** a one-screen guide in Russian, with what to try. Dim forwards
  it.
  - **Barber:** install the app, his day, book a walk-in, move a visit, block
    an hour, ask for a day off. Sell by barcode, by search and by photo, both
    to a client and for himself. See «Мои расчёты».
  - **Renat:** the calendar, «Запросы», a barber's sales in the test shop's
    admin (with the «Барбер» badge), a test invoice, the overview.
- **Afterwards:**
  - the test sales and visits are wiped;
  - the edited barbers, services and prices are kept for the move;
  - the feedback becomes a fix list.

## Order of work

| # | What | Who |
|---|---|---|
| T1 | The test shop: the mirror repo, its CI deploy, the `shop_test` database, the env vars, the snapshot script, noindex checked | Claude builds it. Dim makes the repo, Vercel project, token, DNS and database, and runs the snapshot once |
| T2 | Booking connected: `SHOP_API_URL`/`SECRET`, the mail guard, the test banner, the «ТЕСТ» stamp, staging invoice numbers, the feedback button | Claude |
| T3 | Real setup: barbers, services, prices, hours, logins, receivers | Renat in the admin (or the A7 import); Dim creates the logins |
| T4 | The guide for Renat and the barbers, in Russian | Claude writes it, Dim forwards it |
| T5 | The test days, then the wipe and the fix list | Renat and the barbers; Claude reads the feedback |

T1 and T2 can run side by side. T3 can start once T2's mail guard is live.

## Separate from this plan (the live shop's own risk)

Every pushed branch of `rempireshop/rempire-web` builds a Preview with the
production database and keys, and migrates that database. That is true today
for the shop's own branches too. The fix is in the live project: set
`DATABASE_URL`, `MONTONIO_*`, `R2_SECRET_ACCESS_KEY`, `TELEGRAM_BOT_TOKEN` and
`CRON_SECRET` to Production only. That is a live-shop settings change, Dim's
call, and not needed for this plan.
