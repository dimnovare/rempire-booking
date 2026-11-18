# The test run: Renat and the barbers on staging

*Plan, 17–18.11.2026. Dim chose on decisions page round 7 (18.11): a
**read-only link to the live shop**. This replaces the separate test shop of
the first draft.*

**Goal:** Renat and all his barbers use staging
(`rempire-booking.diipsolutions.eu`) on their own phones for a few days, as
close to the real thing as possible:

- the real barbers, services and prices;
- the live shop's products: names, prices, photos, barcodes;
- finding a product by scan, search or photo;
- the barber's balance;
- a test invoice.

**The hard limit:** no stock count, order, setting or data in the live shop
changes. The only change is one small, read-only code deploy, and it goes
out only with Dim's OK.

## Dim's answers (round 7, 18.11.2026)

| Question | Answer |
|---|---|
| Shape | **A read-only link to the live shop.** It needs a small deploy of new code to the live shop, but no data changes |
| Photo match | **The shop's own OpenAI key**, about a cent a photo |
| Staging e-mail | **Only to staff addresses.** Login codes reach the person; the rest is redirected to the shop inbox |
| Who tests | **Everyone at once**: Renat and all the barbers |
| Real barbers, services, prices | **From the Altegio import (A7).** It waits on the Altegio login; until then staging has demo data |
| Problem reports | **A «Сообщить о проблеме» button** |
| The live shop's preview risk | **Ask the shop's session first** (below) |

Repo, host and database were for the separate test shop, so they no longer
apply.

## The shape

```
barber's phone ──> booking staging ──read only──> rempireshop.com /api/partner/…
  (PWA /b)         sales stay here, stamped TEST    lookup, search, photo match
```

### 1. The live shop: two read-only routes

A new shop branch, `booking-partner-read`, off the live shop's `main`. It
holds only the read half of the partner API, from `booking-partner-api`:

- `GET /api/partner/products/lookup?barcode=…|q=…`: the product, name,
  photo, shop price, VAT and stock count.
- `POST /api/partner/products/identify`: a photo goes in, 3 candidates come
  out. It uses the shop's `OPENAI_API_KEY`. It caps the photo size and has a
  rate limit, so a leaked secret can't run up a bill.
- Both check `BOOKING_API_SECRET` and answer 503 until it is set.

**Not in it:**

- no migration;
- no `barber-sales` route;
- no purchase-price field;
- no admin or storefront change;
- nothing that writes.

So the deploy changes no table, stock count, order or page. A pushed branch
with no new migration also migrates nothing on its preview. It still goes
live only with Dim's OK, after he has seen the exact diff.

### 2. Booking staging: it reads, never sells into the shop

- `SHOP_API_URL=https://rempireshop.com`, `SHOP_API_SECRET` = the shop's
  `BOOKING_API_SECRET`.
- **A switch, `SHOP_SALES`, off on staging.** A sale is saved in booking
  only, with a «ТЕСТ» status, and is never sent to the shop. The shop branch
  has no sales route anyway, so it is off twice over.
  - The barber's statement and the invoice drafts still pick test sales up.
  - The switch goes on only at the move, together with the full partner API.
- **Purchase prices** don't exist in the live shop yet. A sale «for himself»
  shows «закупочная цена не указана» and books 0 €, marked as such.
- **What the test can't show:** the shop-side half of a sale, meaning the
  stock going down, the «Барбер» badge and the order under «Салон». That
  waits for the full branch, and it is tested there with `npm run
  test:shop-link`.

### 3. Staging made safe for real use

- **A test banner:** a thin «Тестовая версия» line on every staging page,
  in the client pages, the admin and `/b`. It goes at the move.
- **Mail guard:**
  - Login codes go to the person.
  - Every other letter goes only to a staff login's address. That covers
    client confirmations, reminders and invoices.
  - Anything else is redirected to the shop inbox, marked.
- **Test invoices:** on staging every PDF carries a large «ТЕСТ / NÄIDIS»
  stamp and a staging-only number series.
- **«Сообщить о проблеме»:** a button in the admin and `/b`. It saves the
  text, the screen, the login and the time to the database, so Claude reads
  the whole test run back.
- **Logins:** one per barber in «Доступ», using his own e-mail.
- **Clients in tests are fake, or the testers themselves.** Never a real
  client's name or phone. Once the A7 import is in, the guide says so
  plainly.

### 4. The test days

- **When:** once A7 has imported the real barbers, services, prices and
  hours. That needs the Altegio login: Renat adds info@diipsolutions.eu as a
  user.
- **Who:** Renat and all the barbers at once.
- **For them:** a one-screen guide in Russian, which Dim forwards.
  - **Barber:** install the app, his day, a walk-in, move a visit, block an
    hour, ask for a day off. Find a product by barcode, search and photo, and
    «sell» it to a client or for himself. See «Мои расчёты».
  - **Renat:** the calendar, «Запросы», the barbers' test sales and balances,
    a test invoice, the overview.
- **Afterwards:**
  - the test sales, visits and invoices are wiped;
  - the imported barbers, services and prices are kept for the move;
  - the reports become a fix list.

## Order of work

| # | What | Who |
|---|---|---|
| R1 | The shop branch `booking-partner-read`: the two routes, the secret check, the photo limits and the rate limit, with tests. **Not pushed.** | Claude |
| R2 | Booking: `SHOP_SALES` off, test sales, the missing purchase price, the banner, the mail guard, «ТЕСТ» PDFs, staging invoice numbers, the feedback button | Claude |
| R3 | **Dim's OK** on R1's diff. Then: the push to the live shop, `BOOKING_API_SECRET` in the shop's Vercel (Production only, Sensitive), `SHOP_API_URL` and `SHOP_API_SECRET` in booking's Vercel | Dim |
| R4 | A7, the Altegio import | Claude, once Dim has the login |
| R5 | The guide in Russian | Claude writes it, Dim forwards it |
| R6 | The test days, then the wipe and the fix list | Renat and the barbers; Claude reads the reports |

R1 and R2 can run side by side now. R4 waits on Altegio.

## The live shop's preview risk (ask the shop's session)

Every branch pushed to `rempireshop/rempire-web` builds a Preview with the
production `DATABASE_URL`, the Montonio, R2 and Telegram keys and
`CRON_SECRET`, because they are set for "All Environments" (checked 17.11).
The build's `postbuild` migrates that database. So:

- a branch with a new migration changes the live database before it is
  merged;
- a preview can use the live payment keys.

**The shop session's answer** («Rempire e-shop prototype Q&A page», 18.11,
from reading code only; nothing was changed):

- Nothing relies on previews having production values. The shop's CI uses no
  secrets. Production is promoted from `main` through the `production`
  branch, not through previews. `tools/migrate.mjs` expects previews to have
  no `DATABASE_URL`.
- So Production-only is safe. Previews become code-only: the catalogue
  file's own products, no blog or set pages, and a demo admin and checkout.
- The risk today is bigger than migrations:
  - a checkout on a preview creates a real, live Montonio payment and writes
    the order to the live database;
  - code on a preview writes the live database and the live R2 bucket.
  - On 18.11 no remote branch adds a migration, so nothing has leaked yet.
- **To fix, in Vercel `rempire-web`** (Dim's own change):
  - set to **Production only**: `DATABASE_URL`, `MONTONIO_*`, `R2_*`,
    `TELEGRAM_BOT_TOKEN`, `CRON_SECRET`, `GSC_SERVICE_ACCOUNT_JSON`, and
    `DEPLOY_HOOK_URL` (All Environments on 17.11: a panel save on a preview
    would rebuild production);
  - check the scopes of `RESEND_API_KEY`, `OPENAI_API_KEY` and the admin or
    session secret too;
  - leave Development unticked, or `vercel env pull` puts live keys on a
    laptop;
  - then delete or redeploy the old previews (`test-cleanup/*`,
    `feat/cpu-cut`, `ci/weekly-e2e-not-cancelled`, `r27-*`), which keep the
    values they were built with.
- **For R1:** after the fix, its preview has no database, so `/lookup` is
  tested on production after the merge. That is safe: it reads only, and it
  answers 503 until the secret is set. R1 has no migration, so its
  `postbuild` changes nothing either way.
