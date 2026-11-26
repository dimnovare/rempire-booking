# Move log: what lives on staging and what changes at the move

*Started 25.11.2026 at Dim's request: «do not forget everything that we've
done currently on staging to have a list of items where everything is
logged and informed when we start moving to production».*

One row per thing that exists only because the app runs on staging
(`rempire-booking.diipsolutions.eu`), or that must be switched, moved or
redone when it moves to rempire.ee. The order of the move itself is in
`docs/launch.md` («The move, in order»); env vars and accounts are in
`docs/accounts.md`. Env var names only, never values.

**Keep it current:** whoever adds something staging-only (a host, a
switch, a seed, an account, a monitor, a test mark) adds a row here in
the same commit. At the move, tick each row in the «Done» column.

## Addresses and indexing

| # | On staging now | At the move | Who | Done |
|---|---|---|---|---|
| H1 | One host for everything: `rempire-booking.diipsolutions.eu` (Vercel domain; CNAME in Dim's Cloudflare zone `diipsolutions.eu`) | `book.rempire.ee` for clients, `staff.rempire.ee` for staff (round 13). Vercel domains, DNS in rempire.ee's zone (B2). The staging host stays for staging | Dim (DNS, Vercel) | |
| H2 | Two-address routing (B3, `src/lib/hosts.ts`), **on for the staging trial since 25.11**: Vercel Production `SITE_URL=https://book-rempire.diipsolutions.eu` (client), `STAFF_URL=https://staff-rempire.diipsolutions.eu` (staff), both Config type. Their Vercel domains; in Cloudflare (`diipsolutions.eu`) a CNAME each (DNS only) and a `_vercel` TXT each beside `rempire-booking`'s; Google redirect URI `https://staff-rempire.diipsolutions.eu/api/auth/google/callback`. Today's `rempire-booking.` host still serves everything. Staging's client letters and SMS now point at `book-rempire`, staff letters at `staff-rempire`; logins are per host; CI's noindex check covers all three hosts (`TRIAL_HOSTS` in `ci.yml`). Undo: delete `STAFF_URL`, redeploy | Production `SITE_URL=https://book.rempire.ee`, `STAFF_URL=https://staff.rempire.ee`; Google redirect URI `https://staff.rempire.ee/api/auth/google/callback`. The trial hosts (Vercel domains, CNAMEs, `_vercel` TXTs, Google URI, `TRIAL_HOSTS`) can go once production runs and staging's old letters are past | Dim | |
| H3 | Noindex everywhere: meta, robots.txt, `X-Robots-Tag`, one switch in `src/lib/indexing.ts`; `npm run check:noindex -- <url>` after every deploy | `ALLOW_INDEXING=yes` on production only, then redeploy and `check:noindex` (it then reports indexing on). Staging never gets it | Dim (Vercel), Claude (check) | |
| H4 | rempire.ee's «book» buttons and Google Maps «Записаться» still open Altegio's widget | Point them to the client host on the evening before day one (`docs/launch.md`, step 12) | Renat / Dim | |

## The test run (switched off by `ALLOW_INDEXING=yes`)

Everything below reads `testRun()` (`src/lib/test-run.ts`): true until
`ALLOW_INDEXING=yes`. Nothing to delete by hand; check each is gone after
the switch.

| # | On staging now | At the move | Done |
|---|---|---|---|
| T1 | The yellow line «Тестовая версия · Сообщить о проблеме» over the admin and the barber app (`src/components/test-banner.tsx`) | Gone | |
| T2 | Problem reports: «Сообщить о проблеме» and their list `/admin/reports` (none so far, 25.11) | Gone with the line. Read the last reports before the switch | |
| T3 | Invoices and their PDFs carry `TEST-` numbers and a test mark (`src/lib/billing/pdf.ts`) | Real numbers from the series in «Настройки» of «Счета» | |
| T4 | Letters go to `TEST_MAIL_TO` (the shop's inbox), not to clients; SMS to `SMS_TEST_TO` | Production has neither var set: letters and SMS reach clients. Book, move and cancel one real visit with Dim's own phone and e-mail (`docs/launch.md`, step 13) | |
| T5 | The QR plaque (`/admin/plaque`, built 25.11) shows the staging link and a red «test» mark; the hint on «Настройки → Онлайн-запись» says not to print it | **Print it only after the move**, from production's `/admin/plaque` (A5 by default) | |

## Data

| # | On staging now | At the move | Who | Done |
|---|---|---|---|---|
| D1 | Railway project `rempire-booking-staging`, Postgres with demo data (`SEED_DEMO=yes`, `DB_DRIVER=auto` from CI) | A new empty production database (B5), its own `DATABASE_URL` and `DATABASE_SSL_CA`; no `SEED_*`, `DB_DRIVER` unset. Migrations run on Vercel's postbuild as on staging. Backups start with it | Dim / Renat (`payer.side`) | |
| D2 | Demo clients «Demo client N» and their visits, `DEMO_LOGINS`, the «Демо» tag | None of it on production: no demo seed, no demo logins | CI config | |
| D3 | The salon's setup (staff, services, prices, hours, «Уведомления» switches, brand, gallery, online booking settings), filled from Altegio's public widget and edited by Renat and Dim on staging | Production starts with the same setup, no clients, no visits (round 13). **How the setup is carried over is not built yet** (a script or an export of the setup tables): decide before the dress rehearsal | Claude | |
| D4 | Staff logins on staging (Renat, the barbers, Dim) | New logins in production's «Доступ»; each barber installs the staff app again on `staff.rempire.ee` (an app is tied to its address) | Renat, barbers | |
| D5 | No clients or visits from Altegio (A7 importer waits for Altegio's Excel exports) | Dress rehearsal import, wipe, then the real import on the evening before day one (`docs/launch.md`, steps 6 and 8) | Renat (exports), Claude | |
| D6 | Isolta's invoice history: importer built, no export yet | Import once Isolta's export arrives; Isolta is cancelled a month before its renewal | Renat, Claude | |
| D7 | Renat's Q&A page `/ru/q/<token>` (his answers, last 18.11) | Read the last answers into `docs/kickoff.md`; decide whether the page stays on production (the token never goes in the repo) | Dim | |

## Messages and phones

| # | On staging now | At the move | Who | Done |
|---|---|---|---|---|
| M1 | E-mail through Resend on Dim's `diipsolutions.eu` domain (`EMAIL_FROM`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`) | The rempire.ee sending domain in Resend (DNS in rempire.ee's zone), new `EMAIL_FROM`, the webhook pointed at production | Dim, Renat (DNS) | |
| M2 | No real SMS: Messaggio not connected | `MESSAGGIO_LOGIN`, sender «REMPIRE» (`MESSAGGIO_SENDER`; 1–5 working days to approve), `SMS_TRANSPORT` (B4) | Renat → Dim | |
| M3 | Staff pushes with staging's VAPID keys; subscriptions belong to the staging address | Production's own `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; barbers allow notifications again in the app on the new address | Dim (keys), barbers | |
| M4 | The bell in the admin (rebuilt 25.11 as Altegio's panel): its rows come from staging's events | Nothing to move: production's bell starts empty | — | |
| M5 | Google login with redirect URIs for the staging host (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) | Add the production hosts' redirect URIs; the privacy policy (B6) and publishing in Google's console | Dim | |

## Running and watching

| # | On staging now | At the move | Who | Done |
|---|---|---|---|---|
| R1 | The cron `/api/cron/outbox` every 5 minutes (`CRON_SECRET`): reminders, letters after a move or cancel, pushes, birthdays, review requests, retries. Needs Vercel Pro (Hobby: at most every 15 minutes, and not for commercial use) | Same on production. Dim tells Renat about the plan it needs (25.11) | Dim | |
| R2 | UptimeRobot: Dim registers 25.11; the first monitor on staging's `/api/health` | Change the monitor's URL to production's `/api/health`; add `/api/health/cron` (alerts when the cron stops); decide who gets the alert (Renat's page, `alert`) | Dim | |
| R3 | CI deploys staging on every push to `main` (`.github/workflows/ci.yml`) | Production deploys from its own branch or project with production `DOMAIN` (`docs/launch.md`, step 1). Staging keeps deploying from `main` | Dim, Claude | |

## The shop (rempire-web, live)

| # | On staging now | At the move | Who | Done |
|---|---|---|---|---|
| S1 | Booking reads the shop's products with the read key (`SHOP_API_URL`, `SHOP_API_SECRET`); sales into the shop are off (`SHOP_SALES` unset). Since 25.11 booking also refuses to sell into any shop not on localhost while `ALLOW_INDEXING` is not `yes`, even with `SHOP_SALES=on` or a write key set by mistake (`shopWritesAllowed()` in `src/lib/shop.ts`). The shop's side is **live since 25.11** (Dim's OK; merge 306f30c7, production bf45fd70, migrations 230 and 231 applied): «Склад» has «Закупка без НДС» for Renat to fill, which «Себе» sales on staging then read; the barber-sales route answers 503 `not_configured` until the write key | Nothing to merge any more (rempire-web `docs/partner-api.md`, «Merge day», steps 1–2 done). At the move: a new write key of 32+ characters, not the read key, as `BOOKING_API_WRITE_SECRET` in the shop and `SHOP_API_WRITE_SECRET` in booking production only; redeploy both; then `ALLOW_INDEXING=yes`, and `SHOP_SALES=on` last. Staging never gets the write key | Dim (OK, shop env), Claude | |
| S2 | `@rempireshop_bot` (the shop's Telegram order pings) | Never touched, before or after | — | |
| S3 | «Каталог товаров» asks the shop for its whole list (`GET /api/partner/products/list`, read key). The shop's route is **live since 26.11** (Dim's OK; shop branch `booking-partner-list` landed on main as 78f27ba7, production 78f27ba7, no migration, no env change): the staging page lists every product with brand and stock filters | Nothing: booking production uses the same read key | Dim's OK, Claude merged | 26.11 |

## Log

Newest last. One line per change to this list.

- 25.11.2026: list started (H1–H4, T1–T5, D1–D7, M1–M5, R1–R3, S1–S2).
- 25.11.2026: H2, two addresses built, off until `STAFF_URL`.
- 25.11.2026: H2, staging trial on: `book-rempire.` and `staff-rempire.diipsolutions.eu` (domains, DNS, `SITE_URL`, `STAFF_URL`, Google URI, CI noindex on all three).
- 25.11.2026: S1, read and write keys on booking's side merged; staging refuses to sell into a live shop whatever is set. Shop branch waits for Dim's OK.
- 25.11.2026: S1, the shop's half merged and live (production bf45fd70, migrations 230–231); sales stay shut until the write key at the move.
- 26.11.2026: S3, the shop's list route live (Dim's OK; 78f27ba7 through CI, promote and smoke; no migration, no env change). Staging «Каталог товаров» lists the whole shop.
