# Phase A: booking core, the build plan

*Started 17.11.2026. Scope and «done» are kickoff §10 A: Renat runs one
real day on it, side by side with Altegio. Tables: `docs/data-model.md`.
Screens: `docs/client-flow.md` and the approved mock.*

## Milestones

| # | What | Needs from outside | Status |
|---|---|---|---|
| A1 | **Data core:** migrations, `db.ts`, migrate on deploy, Tallinn time maths, free slots, booking with no double booking, demo seed. Tests on PGlite. | nothing | done 17.11 |
| A2 | **Client flow on real data:** the 4 screens, `/api/slots`, `/api/bookings`, the change-or-cancel page, «book again». | nothing | done 17.11; staging runs it on an in-memory demo database until A3 |
| A3 | **Staging database:** a Postgres for staging; migrations and the demo seed run on every deploy (`postbuild`). | nothing | done 17.11: Postgres `rempire-booking-staging` on the shop's Railway (docs/staging-setup.md). First deploy applied `001_core.sql` and the demo seed; on staging a booking, the same tap again, a taken slot (409), the change link, the calendar file and a cancel all work |
| A4 | **Staff login:** password, 6-digit e-mail code, Google. | Resend API key; Google OAuth client in the shop's Google account (Dim, 17.11); `ADMIN_BOOTSTRAP_*` in Vercel | done 17.11 except the outside parts: `003_staff_auth.sql`, password login, sessions (httpOnly cookie, only the token's hash stored, 90 days idle), roles owner / admin / barber, `/admin` locked, rate limits. The e-mail code works with the console transport; in production it says «not set up» until `RESEND_API_KEY`. Google login is built (code + PKCE; links the first Google login to the login with that e-mail, never creates one) and shows once `GOOGLE_CLIENT_*` are set. The first owner login comes from `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` on deploy |
| A5 | **Renat's admin:** day and week calendar, one column per barber; add, move, cancel; barbers; services with each barber's price and time; hours, breaks, vacations. | | done 17.11: `/admin` in Russian, phone first. Day view (a column per barber) and week view (one barber); tap a free time to add a visit or a block; open a visit to mark arrived / done / no-show, move (tap the new time, or drag with a mouse), edit or cancel. Barbers: profile, prices and times per service, weekly hours with breaks, single days, vacation and sick days, special time. Services: list and edit. Access: password, logins for barbers and the front desk |
| A6 | **Messages:** e-mail confirmation with `.ics` and the change link; the 2-hour SMS behind `sendSms(to, text)`; a cron for the outbox. | Resend; SMS provider account; `CRON_SECRET` and a cron schedule | groundwork done 17.11: `004_notifications.sql` outbox, `sendSms` with a console transport and SMS part counting, reminders planned from the visits, `/api/cron/outbox` (locked rows, retries with backoff). No provider is called; in production SMS rows wait until one is wired. Not yet: the e-mail confirmation with `.ics` |
| A7 | **Altegio import:** staff, services, clients, future visits. | Altegio login | |
| A8 | **My visits (client area):** an account icon top right; log in with a 6-digit SMS code to the phone used for booking, no password; upcoming and past visits; cancel or move until the cutoff; «book again» from any visit. Added by Dim, 17.11.2026. | A6's SMS provider | |
| A9 | **Special time + design v2:** barbers' own higher-priced hours, booked at once; the client flow with one bottom bar at every width. | nothing | done 17.11: `002_special_time.sql`, slots and «Book» with the extra, the bottom bar at every width, «My visits» to the latest visit on the device; demo special time on staging for the next 14 days |

### A8 in detail

- **Login:** phone → SMS code → in. A client who has never booked gets
  «no visits on this number yet» and the booking button, not an error.
- **Stays logged in:** an `httpOnly` cookie, 90 days, one row per device;
  «Log out» ends it. The code is stored only as a hash: 10 minutes, 5 tries,
  then a new code.
- **Abuse and cost:** rate limits per phone and per IP, so nobody can run up
  the SMS bill. Each code is a `notifications` row, so its cost shows with
  the reminders.
- **Screens:** upcoming visits first (barber, date, time, services, total,
  add to calendar, cancel or move until the cutoff); past visits below, each
  with «book again», which opens the times with the same barber and services.
- **Data:** visits are matched by `clients.phone_e164`, so visits imported
  from Altegio (A7) show up too.
- **Not in A8:** memberships, gift cards and loyalty cards (Altegio's client
  area has them). They wait for Renat's answer on whether he wants them.

### Special time

Renat's request, settled with Dim (17.11.2026):

- **The barber sets it himself**, any time of day: after hours, a Sunday,
  or a lunch hour inside his normal hours.
- **Each window has its own price** on top of the usual one (+20 €, +25 €…).
- **Clients book it at once.** Adding the time is the barber's promise to
  work it, so there is no request and no confirmation.
- **For the client** it sits among the normal times, with a dashed lime
  frame and the full price on the time itself (e.g. «20:00 · 80 €»). The bar
  and the details show «60 € + 20 € special time»; the button is «Book».
- **Build:** `special_time` table, slots with `extraCents`, the booking
  total includes it (A9, done with design v2). Renat adds it for a barber in
  the admin (A5); the barber adds it himself in the barber app (Phase B).
- **Rules in code** (`src/lib/slots.ts`):
  - A visit fits inside one priced window. It never runs from normal time
    into special time.
  - Where two special windows overlap, the earlier one wins.
  - «Anyone» takes a barber at the usual price before a special one.
  - «Book» sends the extra the client saw. If it has changed, the answer is
    «taken» with the nearest times, never a higher price.
- Screens: design v2 canvas, https://claude.ai/artifact/Dg7tYCfjpba275Q5GWatFA.
- The extra goes to the barber whole (Dim, 17.11.2026).

## Where the code is (A4–A6)

| Path | Does |
|---|---|
| `db/migrations/003_staff_auth.sql` | `users`, `sessions`, `login_codes`, `auth_attempts`; walk-ins without a phone |
| `db/migrations/004_notifications.sql` | the message outbox |
| `src/lib/auth/` | passwords (`tools/password.mjs`), sessions, login, the cookie, `requireAdmin()` |
| `tools/bootstrap-owner.mjs` | owner logins from `ADMIN_BOOTSTRAP_*`: one e-mail or a list, the first gets the password, the rest none (code or Google); never overwrites a password |
| `src/proxy.ts` | `/admin` without a cookie → `/admin/login`; admin pages always noindex |
| `src/app/admin/login/` | password or e-mail code |
| `src/app/admin/(app)/` | calendar, barbers, services, access |
| `src/app/admin/admin.css` | the admin's own styles (the client flow's are untouched) |
| `src/lib/admin/` | calendar data, visit changes, barbers, services |
| `src/lib/email.ts`, `src/lib/sms.ts` | `sendEmail` / `sendSms`: one door each, console transport locally |
| `src/lib/outbox.ts` | plans reminders, claims due rows (`for update skip locked`), sends, retries |
| `src/app/api/cron/outbox` | the cron entry, `Authorization: Bearer $CRON_SECRET` |

**Admin booking rules** (`src/lib/admin/visits.ts`): two visits never share a
chair, not even when forced. Outside the barber's hours or over time off
the admin asks first («Всё равно записать»). No notice and no horizon
limit. The price is the barber's own, plus the special-time extra at the
start. Every change writes an `audit` row.

**Login rules** (`src/lib/auth/login.ts`): 8 wrong passwords per e-mail or
30 per IP in 15 minutes, then a wait. A code is 6 digits, 10 minutes, 5
tries, single use; 3 codes per e-mail and 10 per IP an hour. Unknown
e-mails get the same answer as known ones. Changing the password ends the
other devices' sessions.

**Reminders** (`src/lib/outbox.ts`): planned on every cron run from
`appointments.reminder_min`, up to 48 hours ahead; a moved visit gets a new
one, a cancelled one loses it; none closer than 15 minutes to the visit.
They carry no change link yet: admin bookings have no token, and the
client's is stored only as a hash.

### Waiting on outside accounts

| What | For | Env var names |
|---|---|---|
| First owner login on staging | A4 | `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` (sensitive), then redeploy |
| Resend: account made 17.11 (new free account, as decided); a sending domain and an API key | A4 codes, A6 e-mail | `RESEND_API_KEY` (sensitive), `EMAIL_FROM` |
| Google OAuth client in the shop's Google account (Web application; redirect URIs in `src/lib/auth/google.ts`) | A4 Google login | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (sensitive) |
| SMS provider: Dim asked for a price comparison first (17.11) | A6 reminders, A8 codes | added with the provider |
| Cron secret (the schedule, every 5 minutes, is in `vercel.json`; Dim, 17.11) | A6 | `CRON_SECRET` (sensitive); until set, each run answers 503 and does nothing |
| Altegio login | A7 import | |

## Answers that change the build

| Question | Changes | Now |
|---|---|---|
| Cancel cutoff | change-or-cancel page | 24 h placeholder, a business setting; **read from Altegio's settings** (not asked) |
| What a barber may change himself (page Q2) | `time_off.status`, the barber app | approved on save |
| Barbers confirm bookings | | **decided: no.** Booked at once; the barber can cancel in an emergency (Phase B) |
| Deposits | | **decided: none for now** |
| Special-time extra | the barber's invoice (Phase C) | **decided: all of it to the barber**; stored apart from the service price |
| Telegram for barbers (page Q3) | the barber notifications (Phase B) | web push |

Each one is a business setting or a status, so an answer is a switch, not
a rebuild.

## Rules kept in code

- **Times:** `timestamptz` in the database. Hours are local wall-clock in
  `Europe/Tallinn`. Conversion goes through `src/lib/tz.ts`, tested on both
  2026 DST days (29.03 and 25.10).
- **No double booking:** the `appointments_no_overlap` exclusion constraint,
  plus a per-barber row lock (`select … for update`) around the slot check
  and insert, so time off and buffers are covered too.
- **Idempotent «Book»:** the page sends an `Idempotency-Key`; a double tap
  books once.
- **No real people in the repo:** the demo seed has the barbers' public first
  names from rempire.ee, example prices, and no clients.

## Where the code is (A1)

| File | Does |
|---|---|
| `db/migrations/NNN_*.sql` | the schema; never edit a file that has run, add one |
| `tools/migrate.mjs` | applies them; `postbuild` runs it when `DATABASE_URL` is set |
| `tools/seed-demo.mjs` | demo data; `postbuild` runs it when `SEED_DEMO=yes` |
| `src/lib/db.ts` | `query`, `withTx`; `pg` pool, or PGlite with `DB_DRIVER=pglite` |
| `src/lib/tz.ts` | wall-clock ↔ moment in `Europe/Tallinn` |
| `src/lib/slots.ts` | what is free (pure) |
| `src/lib/availability.ts` | rows → free slots per day |
| `src/lib/booking.ts` | the booking transaction |
| `src/lib/settings.ts` | step, horizon, notice, cutoff, reminder defaults |

Slot rules: starts on a 15-minute grid from local midnight; the visit fits
inside one working window; the chair (visit plus the services' largest
tidy-up buffer) touches no visit and no time off; 30 minutes' notice;
60 days ahead. «Anyone» goes to the barber at the usual price (not special
time), then the one with fewer visits that day.
A double tap with one `Idempotency-Key` returns the first booking.

## Where the code is (A2)

| Path | Does |
|---|---|
| `src/proxy.ts` | `/` → `/ru`, `/et` or `/en` by the browser's language |
| `src/app/[locale]/page.tsx` + `booking-flow.tsx` | the 4 screens of the mock |
| `src/app/[locale]/visit/[token]/` | the client's own link: see, add to calendar, cancel until the cutoff |
| `src/app/api/slots` | free times for the whole horizon in one call |
| `src/app/api/bookings` | «Book»; 409 with the three nearest times if taken |
| `src/app/api/ics/[token]` | the calendar file |
| `src/lib/i18n.ts` | RU / ET / EN copy |

**Staging database:** CI deploys with `DB_DRIVER=auto`. Since A3 (17.11)
Vercel has `DATABASE_URL`, so staging uses the Railway Postgres and keeps
bookings. Without it the app falls back to an in-memory Postgres (PGlite)
with the demo data, says so in a banner, and loses bookings on restart.

**Not in A2 yet:** moving a visit in one step (now: book the new time, then
cancel the old one); e-mail and SMS (A6); the salon phone (not in the demo
data); a privacy policy page; rate limits on `/api/bookings`.

## Renat's questions page (17.11)

| Path | Does |
|---|---|
| `src/app/[locale]/q/[token]/` | the page, in Russian at any locale; each field saves as he types, waits in the browser when offline |
| `src/app/api/qa/[token]` | `GET` the answers (`?log=1` adds every earlier value), `PUT` one field |
| `src/lib/owner-qa-content.ts` | the questions, «Уже решено», «Это посмотрим сами» |
| `db/migrations/005_owner_qa.sql` | forms (only the link token's SHA-256), answers, the log |
| `tools/seed-demo.mjs` `seedOwnerQa` | adds Renat's form on staging; `/ru/q/demo` exists only in the in-memory database |
| `src/app/api/og/[card]`, `src/lib/og.tsx` | link-preview pictures: booking per language, and the questions page |

**Link previews and robots.txt:** `*` stays `Disallow: /` and every page
still sends noindex (meta and header). Messenger preview bots
(`PREVIEW_BOTS` in `src/lib/indexing.ts`) may fetch pages, so a shared link
shows its title and picture. `SITE_URL` sets the absolute address in the
previews; unset, it is staging.
