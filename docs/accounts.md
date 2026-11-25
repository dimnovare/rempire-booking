# Accounts in use (booking)

*First written 17.11.2026. Rewritten 23.11.2026 at Dim's request: every
outside account the booking app uses, how it is signed in, which env var
names it fills, its state today, and what has to happen at the launch on
rempire.ee. The launch order itself is `docs/launch.md`; the tests before
it are `docs/test-plan.md`. The shop's own registry is
`rempire-web/docs/accounts.md`; this file covers the booking app only.
How the two sets become one: `docs/accounts-plan.md` (23.11).*

## Rules

- **Names only.** No passwords, keys, tokens or recovery codes here. The
  values live in Vercel env vars or GitHub secrets; the logins are on Dim's
  login sheet.
- **One business identity:** the shop's Google account
  rempireshopinfo@gmail.com, with 2FA on Renat's phone. GitHub user
  `rempireshop` signs in to Vercel and Railway.
- Staff login addresses (`ADMIN_BOOTSTRAP_EMAIL`) are in Vercel only.
- **Which browser holds what:** Rempire's Chrome profile (`ec8c7d97`) has
  the shop's accounts (Vercel, Railway, Resend, Google Cloud) and Renat's
  Altegio and Isolta logins, used read-only. Dim's own profile (`dc8ea0e6`)
  has GitHub `dimnovare` and Cloudflare `diipsolutions.eu`.

## The deadline

Altegio costs 92,99 € a month and **renews itself on 02.12.2026** (paid
to 04.12; `docs/port-check.md`). Isolta costs 94,80 € + VAT a year, renews
itself, and must be cancelled a month before; its renewal date is only on
Renat's last Isolta invoice (asked on his page, `switch.isolta`).

## Registry

«Since 17.11» says what changed against the first version of this file.

| Service | What it does for booking | Account / sign-in | Env var names | Pays | State on 23.11 | At the launch | Since 17.11 |
|---|---|---|---|---|---|---|---|
| **GitHub** `dimnovare/rempire-booking` (public; Dim kept it public, 24.11.2026) | The code; Actions `ci.yml`: check → deploy → noindex check | Dim's `dimnovare`; commits use his noreply address | secret `VERCEL_TOKEN` (token `rempire-booking-ci`, this project only, expires **17.11.2027**); variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`; `DOMAIN` is written in `ci.yml` | free | set up | `ci.yml`: change `DOMAIN`; drop `SEED_DEMO`, `SEED_BUSY` and `DB_DRIVER=auto` from the deploy line (with `auto` and no `DATABASE_URL`, production would quietly run on an in-memory demo database); keep the noindex check for staging only. Who owns the repo is still open | `SEED_BUSY=yes` added to the deploy line (c60169d) |
| **Vercel** team «Rempire» (Pro), project `rempire-booking`, region `fra1` | Hosting; the cron (`vercel.json`, every 5 minutes) | GitHub `rempireshop`; CI deploys with the project token | see «Env vars» | Dim's card; Pro ($20 a month) shared with the shop | set up | Add the two hosts, set `SITE_URL` and `STAFF_URL` (`docs/launch.md`, «Two addresses»), production database vars, then `ALLOW_INDEXING=yes` last. The shop wants to go back to Hobby; the 5-minute cron needs Pro | `SHOP_API_URL`, `SHOP_API_SECRET` set 18.11 |
| **Vercel cron** `/api/cron/outbox` | Sends every message; since 17.11 also sends barber sales to the shop and makes the month's invoice drafts | — | `CRON_SECRET` | — | runs | stays | does more |
| **Railway**, workspace «rempireshop's Projects» (Hobby), project `rempire-booking-staging` | Postgres 18, EU West: demo, generated and masked data | GitHub `rempireshop`; the local `railway` CLI cannot see it | `DATABASE_URL` (its `DATABASE_PUBLIC_URL`), `DATABASE_SSL_CA` (the CA expires **14.02.2029**) | Dim's card | set up | A production Postgres of its own, without demo data, with its own URL and CA. Staging never becomes production. Open: what carries over (`docs/launch.md`, decision «data») | — |
| **Cloudflare**, Dim's zone `diipsolutions.eu` | Staging DNS: CNAME `rempire-booking` → Vercel, TXT `_vercel`; Resend: CNAME `send.rempire-booking`, CNAME `rsend.rempire-booking`, TXT `resend._domainkey.rempire-booking` (all DNS only, no MX) | Dim's browser | — | free | set up | Stays while staging lives. The zone's own `send.`/`rsend.` records are Dim's Resend: leave them | — |
| **Cloudflare**, zone `rempire.ee` | Will hold the booking CNAME(s) and the Resend records | **Unknown who.** Renat «has access» (17.11); it is in neither browser. Nameservers on Cloudflare, mail MX at zone.ee | — | ? | **no access yet** | Needed before the DNS, Resend and Google steps. **On the critical path for 2.12** | now urgent |
| **Resend**, booking account (free) | Staff login codes, client letters, invoice PDFs; the «Открыт» mark from its webhook | rempireshopinfo+booking@gmail.com | `RESEND_API_KEY`, `EMAIL_FROM` (`booking@rempire-booking.diipsolutions.eu`), `RESEND_WEBHOOK_SECRET` | free: 1 domain, 100 a day, 3 000 a month | sends. Webhook secret: not recorded as set (the route answers 503 without it). Open tracking is off on the staging domain, so no «Открыт» arrives | The free plan holds one domain: remove the staging one (or pay), add a rempire.ee sending subdomain with its 3 records, change `EMAIL_FROM`, add the webhook `https://<host>/api/webhooks/resend` (event `email.opened`) with its secret. Altegio sends about 1 100 e-mails a month: inside the cap, but staging and production would share it | webhook added (514e424) |
| **Messaggio** | 2-hour SMS reminder, birthday SMS, no-show invitation (`src/lib/sms.ts`) | **Renat's own account** (decision 30). Altegio sends its SMS through it today. Dim has no login | `MESSAGGIO_LOGIN` (Sensitive), `MESSAGGIO_SENDER`, `SMS_TEST_TO` (staging only) | Renat, prepaid; about 600 SMS a month | code built and tested; **never run against the live account**; vars not recorded as set | Renat gives the project login and the sender code of «REMPIRE» (a new sender takes Messaggio 1–5 working days). Test on staging with `SMS_TEST_TO`. **Switch Altegio's own SMS off at the cut-over**, or imported visits get two reminders | chosen 19.11 (was «not chosen») |
| **Google Cloud**, project «REMPIRE Booking» (`rempire-booking`) | Staff «Войти через Google» | rempireshopinfo@gmail.com, the only Owner; consent screen in **Testing**, 3 test users | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | free | set up. A staging sign-in failed on 18.11 (Google answered 400); logging improved (ab0848b); cause not recorded | Redirect URI per staff host; Branding needs the **privacy policy page** (drafted 23.11, `/ru/privacy`; Renat's «[to confirm]» marks still open); then «Publish app». Details below | open bug |
| **Shop partner API** (`rempire-web`) | Product lookup, search, photo match; later the barbers' sales into shop stock | — | booking: `SHOP_API_URL` (`https://rempireshop.com`), `SHOP_API_SECRET` (read key), `SHOP_API_WRITE_SECRET` (write key, production only, at the move), `SHOP_SALES`; shop: `BOOKING_API_SECRET` (read, Production, Sensitive), `BOOKING_API_WRITE_SECRET` (write, at the move) | photo match runs on the shop's OpenAI account (fractions of a cent a photo) | **read half live** since 18.11; both secrets set. The sales half (barber-sales, purchase prices, shop migrations 230 and 231) is on the local shop branch `booking-partner-api-2`, **not pushed** (25.11); merged with no new variable its sale route stays 503 | Merge into the shop's `main` only with Dim's OK: it runs migrations 230 and 231 on the shop's live database (checklist: the shop's `docs/partner-api.md` § «Merge day»). At the move: the write key in both, then `SHOP_SALES=on`; Renat enters purchase prices | new row |
| **Web Push** (VAPID) | Pushes to the staff app; since 18.11 also clients' reminder notifications | no account: one key pair, only in Vercel | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:rempireshopinfo@gmail.com`) | free | set up | Keep the same two keys: new keys cut off every subscribed phone | clients use it too |
| **Staff logins** (the app's own) | Owner, admin and barber logins | — | `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` | — | staging: the owners, plus the barber test login rempireshopinfo+barber@gmail.com | A fresh production database gets the owners on its first deploy. Barbers need their e-mails from Renat. Delete both vars once everyone is in | — |
| **Altegio** | The live booking system; source of the import | Renat's login, read-only in Rempire's browser | — | Renat, 92,99 € a month | read access since 19.11. **The client and visit import (A7) is not built.** Its Excel exports e-mail a link to Renat's address; never pressed from here | Renat forwards the clients, visits and services exports. Reviews: `scripts/import-reviews.ts` (`--no-mask` at the move). Freeze Altegio during the import, switch off its client notifications, cancel before 02.12 | — |
| **Isolta** (Finago) | Invoices to the barbers today; history to import | Renat's login, read-only | — | Renat, 94,80 € + VAT a year | read access; importer built (`scripts/import-isolta-invoices.ts`) | Isolta's data export zip from Renat; import the 422 issued invoices; numbering goes on at 423 | importer built |
| **Google Business Profile** | Altegio's «Записаться» on Google Maps is on today; ours replaces it | rempireshopinfo@gmail.com | — | free | not yet | Set the booking link to the client host. How Altegio's button is wired is not known | new row |
| **OpenStreetMap** (tiles and Nominatim) | Map on the salon page; «Найти» in «Настройки → Контакты» (`src/lib/geocode.ts`) | no account; its usage policy kept (1 request a second, own User-Agent) | `GEOCODER` (`fake` in e2e only) | free | built | nothing | new row |
| **rempire.ee website** | Its «book» buttons go to Altegio | **unknown who runs it** | GA4 and GTM live on that site only; booking has no analytics | ? | — | Point the buttons at the client host | — |
| **Renat's questions page** `/ru/q/<token>` | Renat's answers, autosaved | token only with Dim; stored in the staging database | — | — | live on staging; set 3 (10 questions, 20.11) **not answered yet** | Save the answers before staging is ever torn down | new row |
| **Telegram** | **Not used.** Renat (18.11): barber notifications in the app. Never touch `@rempireshop_bot` | — | — | — | — | — | dropped |
| Montonio | Not used: no deposits (decision 15) | Renat | — | — | — | — | — |

Plain links with no account behind them: Google Maps, WhatsApp, Instagram,
Facebook (salon page, letters, visit window). Fonts are self-hosted.

## Env vars

«Staging» says whether a doc or commit records the value as set in
Vercel's Production environment of `rempire-booking`; «?» = not recorded.
On staging «Настройки → Уведомления → Каналы отправки» shows which
channels are live, without values.

| Name | Production | Staging | Note |
|---|---|---|---|
| `ALLOW_INDEXING` | `yes`, set **last** | unset | Also ends the test run (`src/lib/test-run.ts`): the mail guard, the `SMS_TEST_TO` filter, `TEST-` invoice numbers and the banner go. From then on real clients get real SMS and e-mails. Never on staging |
| `SITE_URL` | yes: `https://book.rempire.ee` | unset (trial: `https://book-rempire.diipsolutions.eu`) | the **client** address: every link a client gets. Unset falls back to the staging URL |
| `STAFF_URL` | yes: `https://staff.rempire.ee` | unset (trial: `https://staff-rempire.diipsolutions.eu`) | the **staff** address: staff letters, Google's way back. Unset = `SITE_URL`, one address for both. Set with `SITE_URL` on another host, each host serves its own half (`docs/launch.md`, «Two addresses») |
| `DATABASE_URL` | yes | yes (Dim) | Railway's public URL |
| `DATABASE_SSL_CA` | yes | yes | the database's CA, public |
| `DATABASE_SSL_NO_VERIFY`, `DATABASE_POOL_MAX` | no | ? | last resort / tuning |
| `DB_DRIVER` | `pg` or unset | `auto`, by CI | |
| `SEED_DEMO`, `SEED_BUSY` | **must be unset** | `yes`, by CI | `SEED_BUSY` is not in `.env.example` yet |
| `DEMO_LOGINS`, `PGLITE_PATH`, `SALES_MINUTE_MS`, `GEOCODER` | never | — | local, tests, e2e |
| `BUSINESS_SLUG` | optional (`rempire`) | ? | |
| `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` | first deploy only | yes (Dim) | delete once everyone is in |
| `RESEND_API_KEY`, `EMAIL_FROM` | yes; `EMAIL_FROM` on rempire.ee | yes | |
| `RESEND_WEBHOOK_SECRET` | if «Открыт» is wanted | ? | one per webhook endpoint |
| `EMAIL_TRANSPORT`, `SMS_TRANSPORT` | **must be unset** | ? | `console` silently stops sending, even with the Resend or Messaggio keys set (e-mail since 23.11) |
| `TEST_MAIL_TO` | no | ? | where staging redirects letters to non-staff; default rempireshopinfo@gmail.com. Dim kept that default (round 13, 23.11): leave it unset |
| `MESSAGGIO_LOGIN`, `MESSAGGIO_SENDER` | yes | ? | the login Sensitive |
| `SMS_TEST_TO` | no (ignored once indexing is on) | ? | the testers' own numbers, E.164 |
| `CRON_SECRET` | yes | yes (Dim) | Sensitive |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | yes (Dim) | the same client can stay |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | yes, the same keys | yes (Dim) | private key Sensitive |
| `SHOP_API_URL`, `SHOP_API_SECRET` | yes | yes (18.11) | the read key; equals the shop's `BOOKING_API_SECRET`. `SHOP_API_READ_SECRET` is the same key under a newer name and wins when both are set |
| `SHOP_API_WRITE_SECRET` | yes, at the move | **never** | the write key, 32+ characters, not the read key; equals the shop's `BOOKING_API_WRITE_SECRET`. Sensitive. Staging could not use it anyway: the test run never sells into a live shop (`src/lib/shop.ts`) |
| `SHOP_SALES` | `on` once the shop's sales half is live | off | |

The full list with comments is `.env.example`.

## Google Cloud (staff Google login)

Set up 17.11.2026 by Dim, with Claude filling the forms in Rempire's
browser.

- **Account:** the shop's Google account rempireshopinfo@gmail.com, the
  only principal (Owner) in IAM. No organization, no billing account.
- **Project:** «REMPIRE Booking», ID `rempire-booking`.
- **Google Auth Platform → Branding:** app name «REMPIRE»; support and
  developer contact rempireshopinfo@gmail.com. No logo (a logo would
  require Google's verification). Home page, privacy policy and authorized
  domains are empty.
- **Audience:** External, publishing status **Testing**. Only test users
  can sign in with Google (cap 100); today 3: Dim's, Renat's and the shop's
  Google accounts. New staff who want the Google button are added under
  Audience → Test users until the app is published. Staff without a Google
  account log in with the password or the e-mail code.
- **Exact addresses:** the app compares the address from Google exactly,
  dots included. Renat's Google account has no dot, so
  `ADMIN_BOOTSTRAP_EMAIL` lists it that way.
- **Client:** «rempire-booking», Web application. Redirect URIs:
  `https://rempire-booking.diipsolutions.eu/api/auth/google/callback` and
  `http://localhost:3400/api/auth/google/callback`.
- **Secret:** shown once, at creation; only in Vercel. If lost: add a new
  secret on the client, put it in Vercel, redeploy, delete the old one.

**To hand it over** to another Google account: IAM → Grant access → the
new account as Owner; they accept; change the support and contact
e-mails under Branding; remove rempireshopinfo@gmail.com if wanted. The
client ID and secret stay, so Vercel needs no change.

**The staging trial of the two addresses** (`docs/launch.md`, B3): add
`https://staff-rempire.diipsolutions.eu/api/auth/google/callback`. While
the two addresses are split, Google always comes back to the staff
address; today's staging address keeps its own URI.

**At the move to rempire.ee:** add the redirect URI
`https://staff.rempire.ee/api/auth/google/callback`; under Branding the home
page, the privacy policy on rempire.ee and the authorized domain
`rempire.ee`; then Audience → Publish app (scopes `openid email` need no
review). Remove the staging and localhost URIs once staging is gone.
