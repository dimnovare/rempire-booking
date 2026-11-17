# Phase A: booking core, the build plan

*Started 17.11.2026. Scope and «done» are kickoff §10 A: Renat runs one
real day on it, side by side with Altegio. Tables: `docs/data-model.md`.
Screens: `docs/client-flow.md` and the approved mock.*

## Milestones

| # | What | Needs from outside | Status |
|---|---|---|---|
| A1 | **Data core:** migrations, `db.ts`, migrate on deploy, Tallinn time maths, free slots, booking with no double booking, demo seed. Tests on PGlite. | nothing | done 17.11 |
| A2 | **Client flow on real data:** the 4 screens, `/api/slots`, `/api/bookings`, the change-or-cancel page, «book again». | nothing | next |
| A3 | **Staging database:** a Railway project on the shop's account; migrations and the demo seed on deploy. | Dim pastes `DATABASE_URL` into Vercel | |
| A4 | **Staff login:** password, 6-digit e-mail code, Google. | Resend account; Google OAuth client (whose account?) | |
| A5 | **Renat's admin:** day and week calendar, one column per barber; add, move, cancel; barbers; services with each barber's price and time; hours, breaks, vacations. | | |
| A6 | **Messages:** e-mail confirmation with `.ics` and the change link; the 2-hour SMS behind `sendSms(to, text)`; a cron for the outbox. | Resend; SMS provider account | |
| A7 | **Altegio import:** staff, services, clients, future visits. | Altegio login | |

## Answers that change the build

| Renat's question | Changes | Until answered |
|---|---|---|
| Q7 cancel cutoff | change-or-cancel page | 24 h placeholder, a business setting |
| Q9 barbers' time off needs approval | `time_off.status` | approved on save |
| Q10 barbers confirm bookings | `pending` status | booked at once |
| Q6 deposits | a payment step | none |

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
60 days ahead. «Anyone» goes to the barber with fewer visits that day.
A double tap with one `Idempotency-Key` returns the first booking.
