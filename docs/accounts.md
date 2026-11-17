# Accounts in use (booking)

*17.11.2026, at Dim's request: every outside account the booking app uses
today, how it is signed in, which env var names it fills, and what has to
switch at the move to rempire.ee. The shop's own registry is
`rempire-web/docs/accounts.md`; this file covers the booking app only.*

## Rules

- **Names only.** No passwords, keys, tokens or recovery codes here. The
  values live in Vercel env vars or GitHub secrets; the logins are on Dim's
  login sheet.
- **One business identity:** the shop's Google account
  rempireshopinfo@gmail.com, with 2FA on Renat's phone. GitHub user
  `rempireshop` signs in to Vercel and Railway.
- The staff login addresses (`ADMIN_BOOTSTRAP_EMAIL`) are in Vercel only,
  not here.
- Which Chrome profile holds which account: Rempire's browser has the shop's
  accounts (Vercel, Railway, Resend); Dim's own has GitHub `dimnovare` and
  Cloudflare `diipsolutions.eu`.

## Registry

| Service | What it does for booking | Account / sign-in | Holds (names only) | Pays | At the move |
|---|---|---|---|---|---|
| **GitHub** repo `dimnovare/rempire-booking` (private) | The code. Actions `ci.yml`: check → deploy → noindex | Dim's GitHub `dimnovare` | secret `VERCEL_TOKEN`; variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | free | Who owns the repo is still open (kickoff §9). If it moves to `rempireshop`, check that the secret and the variables came along. In `ci.yml`: change `DOMAIN` and drop `SEED_DEMO=yes` from the deploy line |
| **Vercel** team «Rempire» (Pro), project `rempire-booking` | Hosting (`fra1`), the 5-minute cron (`vercel.json`) | GitHub `rempireshop`. Dim's own Vercel login is not a member; CI deploys with token `rempire-booking-ci` (this project only, expires **17.11.2027**) | the env vars below | Dim's card (the team's Pro, $20 a month, shared with the shop) | Add the booking host on rempire.ee, set `SITE_URL` and `ALLOW_INDEXING=yes`. Decide whether `rempire-booking.diipsolutions.eu` stays as staging |
| **Railway**, the shop's workspace «rempireshop's Projects» (Hobby), project `rempire-booking-staging` | Postgres 18, EU West. Demo data only | GitHub `rempireshop` | fills `DATABASE_URL` (its `DATABASE_PUBLIC_URL`) and `DATABASE_SSL_CA` (the CA expires **14.02.2029**) | Dim's card today, then the company card (the shop's card plan) | A production database without demo data (a new project or service), with its own `DATABASE_URL` and CA. Production never points at the staging database |
| **Cloudflare**, Dim's account, zone `diipsolutions.eu` | Staging DNS: CNAME `rempire-booking` → Vercel, TXT `_vercel` (`docs/staging-setup.md`) | Dim's browser | — | free | The records stay while staging lives. Planned: Resend's 3 records for `rempire-booking.diipsolutions.eu` |
| **Cloudflare**, zone `rempire.ee` | DNS of Renat's site (nameservers `vicky` / `ligia`; mail MX at zone.ee) | **Unknown account, no access yet.** Not the shop's Cloudflare, not Dim's (checked 17.11) | — | ? | Needed for the booking CNAME (`broneeri.` or `book.`) and for Resend on rempire.ee. Find out who holds it first |
| **Resend**, booking account (free) | Staff login codes; later the booking confirmations | rempireshopinfo+booking@gmail.com, made 17.11 | `RESEND_API_KEY`, `EMAIL_FROM` (`booking@rempire-booking.diipsolutions.eu`, Dim, 17.11) | free: 1 domain, 100 a day, 3 000 a month | **No domain is verified yet (checked 17.11), so every send fails with «Письмо не ушло».** The free plan has one domain: at the move, remove the staging domain, add rempire.ee and change `EMAIL_FROM` (or pay for more). The shop's own Resend (`@rempireshop.com`) is a separate account and stays untouched |
| **Google Cloud**, in the shop's Google account | Staff «Войти через Google» | rempireshopinfo@gmail.com (2FA on Renat's phone) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | free | **Not created yet.** Planned as its own project «REMPIRE Booking», not inside the shop's `rempire-shop` project, which runs the shop's live customer login. At the move: add the redirect URI `https://<booking host>/api/auth/google/callback` and `rempire.ee` as an authorized domain |
| **Vercel cron** | Runs `/api/cron/outbox` every 5 minutes | — | `CRON_SECRET` (**not set yet**: each run answers 503) | — | Stays as it is |
| **Staff logins** (the app's own) | Owner logins to `/admin` | — | `ADMIN_BOOTSTRAP_EMAIL` (5 addresses, set by Dim), `ADMIN_BOOTSTRAP_PASSWORD` (Sensitive) | — | On staging all 5 have the shared password since 17.11. A fresh production database gets them again on its first deploy. Delete both vars once everyone is in |
| **SMS provider** | 2-hour reminders (A6), client login codes (A8) | **Not chosen yet** (round-2 decisions page) | names added with the provider | prepaid | The sender name «REMPIRE» stays the same |
| **Messaggio** | Renat's SMS today | Renat's login. Whether he uses it directly or through Altegio is not known yet | — | Renat | A candidate to keep; see the round-2 page |
| **Altegio** | The live booking system: Renat's clients and visits | Renat's login | — | Renat (amount not recorded) | A7 imports staff, services, clients and future visits. Then the rempire.ee «book» buttons point to the new app. Altegio stays read-only for a few weeks, then Renat cancels it |
| **Isolta** (Finago) | Invoices to the barbers | Renat's login | — | Renat | Replaced by the app. Export the receivers and the invoice history first |
| **rempire.ee website** | Renat's React site; its «book» buttons go to Altegio | whoever runs it (unknown, like the DNS) | GA4 `G-FZ84GVRXZ4`, GTM `GTM-T43NKNP` | ? | Point the buttons at the booking host |
| **Telegram** | `@rempireshop_bot` is the shop's order pings: **never touch**. Renat is making a new bot for tattoo booking | Renat (BotFather) | — | free | An optional channel later |
| **Web Push** (VAPID) | The barber PWA (Phase B) | not yet | keys of its own, never the shop's | free | — |
| **Montonio** | Only if deposits or prepayments are wanted (decision 15) | Renat's contract | — | Renat | — |

## Env vars in Vercel (`rempire-booking`, Production)

Read from the Vercel dashboard on 17.11.2026, names only.

| Name | Set | By | Note |
|---|---|---|---|
| `DATABASE_URL` | yes | Dim | Secret; Railway's `DATABASE_PUBLIC_URL` |
| `DATABASE_SSL_CA` | yes | Claude | the database's CA, public |
| `ADMIN_BOOTSTRAP_EMAIL` | yes | Dim | 5 addresses |
| `ADMIN_BOOTSTRAP_PASSWORD` | yes | Dim | Sensitive |
| `RESEND_API_KEY` | yes | Dim | Sensitive |
| `EMAIL_FROM` | yes | Dim | sends only once its domain is verified in Resend |
| `DB_DRIVER`, `SEED_DEMO` | per deploy | CI | `auto`, `yes`; `SEED_DEMO` must go at the move |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Dim | after the Google client exists |
| `CRON_SECRET` | no | Dim | any random 32+ characters |
| `SITE_URL`, `ALLOW_INDEXING` | no | — | only at the move |
| SMS names | no | — | with the provider |

The full list with comments is `.env.example`.

## The move to rempire.ee, in order

1. **Get the rempire.ee Cloudflare login** from whoever runs Renat's site.
2. **Production database** on Railway, without demo data; set its
   `DATABASE_URL` and `DATABASE_SSL_CA`.
3. **CI:** drop `SEED_DEMO=yes` from the deploy line and set `DOMAIN` to the
   booking host. Decide whether staging stays as a second environment.
4. **Vercel domain:** add the booking host (`broneeri.rempire.ee` or
   `book.rempire.ee`) and its CNAME on rempire.ee. Set `SITE_URL`.
5. **Resend:** add rempire.ee and its 3 DNS records, then change `EMAIL_FROM`.
6. **Google:** add the new redirect URI and `rempire.ee` as an authorized
   domain.
7. **SMS:** check that the sender name is approved for the live account.
8. **Altegio import (A7);** no changes in Altegio while it runs.
9. **The rempire.ee «book» buttons** point to the booking host.
10. **Indexing:** `ALLOW_INDEXING=yes` (`src/lib/indexing.ts`).
11. **Afterwards:**
    - Altegio stays read-only for a few weeks, then Renat cancels it.
    - Isolta goes once the invoices run in the app.
    - Delete `ADMIN_BOOTSTRAP_*` once everyone is in.
    - Renew the Vercel token before 17.11.2027.
    - Move Railway and Vercel to the company card.
