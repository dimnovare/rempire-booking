# Parity check: Altegio and Isolta against ours, 24.11.2026

*Dim, 24.11.2026: «Do one more check if our functionality matches Altegio
functionality - can we test that or check that so that everything runs
correctly? Same for Isolta?»*

The port check of 20.11 (`docs/port-check.md`) listed what REMPIRE uses.
This check goes one level down: each function REMPIRE uses, at the level of
its behaviour, matched against our code as of 4e71ea5 and against the
automated test that proves it. Sources: `docs/altegio-pages.md`,
`docs/altegio-rights.md`, `docs/isolta-pages.md`, `docs/client-flow.md`,
`docs/reference-looks.md`, and a live walk of Altegio's booking widget on
24.11 (up to the details form; nothing booked).

Dim's calls on what differs: decisions page round 15,
<https://claude.ai/artifact/GApJxnRWLMZK7Ng5DwMJcx>.

## Verdicts

T = matches, a test proves it · U = matches, no test touches it ·
M = differs · N = missing though REMPIRE uses it · D = left out on purpose
(decided before).

| Area | T | U | M | N | D |
|---|---|---|---|---|---|
| Altegio: journal, «Записи», booking, clients, staff, services | 77 | 5 | 5 | 5 | 14 |
| Altegio: messages, reports, rights | 55 | 6 | 6 | 4 | 9 |
| Isolta | 40 | 8 | 10 | 1 | 8 |
| **All** | **172** | **19** | **21** | **10** | **31** |

The full suites were green the same morning: 1260 unit tests, the e2e on
both phones on the production build (278), CI on 4e71ea5.

## Altegio's live widget against staging (24.11)

| What | Altegio | Ours (staging) | Verdict |
|---|---|---|---|
| Barbers | Jevgeni, Slava, Renat, Valentin, Milena | Renat, Valentin, Jevgeni, Slava, Milena | same five; now Altegio's order too (round 15, `barber-order`) |
| Each barber's services, times and prices | as `tools/altegio-structure.json` (19.11), all 26 lines | the same | ✅ |
| Steps | barber → services → day and time → details | the same | ✅ |
| Details form | name *, phone *, e-mail, comment, reminder, consent, «Book» | the same; the reminder is «2 h» or none | ✅ (the 16 reminder choices are left out on purpose, `docs/client-flow.md`) |
| Review counts | 31 / 38 / 28 / 22 / 21 (140) | 30 / 32 / 28 / 21 / 16 (127) | staging holds an older, masked import; `scripts/import-reviews.ts --no-mask` runs again at the move |
| How far ahead | each barber up to his schedule's end («schedule_till»: Renat 19.12, Milena 18.12, others 30.12) | 60 days on the weekly hours | differs (round 15, `horizon`) |

## What differs or is missing, and where it stands

**Fixed on 24.11**

- A new company in «Счета» → «Настройки» numbered «2026-0423» by the form's
  defaults (4 digits, by year); Isolta's numbers are bare. The form now
  starts at no prefix, 0 digits, not by year, as the database does, and the
  Isolta import report says when our next number will not look like
  Isolta's (`tests/isolta-import.test.ts`).
- A new receiver's payment term starts at 14 days, Isolta's default (was 7).
- Docs: «drag to lengthen» left the test plan (left out on purpose); the
  privacy policy is linked at the booking tick (`docs/client-flow.md`).

**Asked on round 15, Dim's answers (24.11)**

| Id | What | Dim | Done |
|---|---|---|---|
| `late-sms` | A visit booked inside the 2 h: our SMS reminder goes at once; the test plan said none | send at once | test plan § 7 corrected |
| `cancel-letter` | A client's own online cancel sends no «cancelled» letter; the salon's cancel does | send the letter | `src/lib/visits.ts`, test above |
| `horizon` | Altegio books each barber only up to his schedule's end; ours 60 days | per barber, as Altegio | see below |
| `barber-order` | Altegio's order of the barbers | Altegio's | demo: Jevgeni, Slava, Renat, Valentin, Milena; staging moves once at its next seed |
| `journal-copies` | «Добавить сотрудника в расписание» on any day; 3 more head-menu items; the client's e-mail in the hover card; the staff list as Altegio's table | build now | see below |
| `booking-settings` | A page for step, notice, horizon, change limit, «Любой» (decision 29) | build now | see below |
| `reference` | Isolta's reference number (invoice number + 7-3-1 check digit) | build | see below |
| `iban` | Isolta refuses to issue without an IBAN and an address | refuse | see below |
| `isolta-small` | A receiver's phone; the next number on a draft; the note kept internal | all three | see below |

Also fixed while building: a client's own online move now tells Renat by
push («own_client»), as «Уведомления» says.

**Built on 24.11 from those answers**

- `horizon`: «График до» per barber (`staff.schedule_until`, 042). The
  booking page, «Любой», the booking itself and the client's own move stop
  after it; the journal and the barber app do not. Set in the barber's
  profile; «График работы»'s template moves it to its last day when that
  is later. Every barber starts with none (only the salon's horizon), so
  Renat sets the dates at the switch (Altegio, 24.11: Renat 19.12, Milena
  18.12, the others 30.12). The demo keeps none, so staging stays bookable
  after December.
- `booking-settings`: «Настройки → Онлайн-запись» (`/admin/settings/online`):
  the step, the notice, how far ahead (up to 90 days), the move and cancel
  limit, «Любой специалист» on or off. Its door is the switch of the
  rights group «Онлайн-запись», as Altegio's list says.
- `journal-copies`: the person-plus «Добавить сотрудника в расписание» on
  any day; the six items behind a barber's head, in Altegio's order, with
  «Добавить/Убрать рабочие дни» and «Изменить время для онлайн-записи»
  (per day, client bookings only, 043); the client's e-mail in the hover
  card (masked without the phone right); the staff list as Altegio's
  table (Расписание «до …», the «Онлайн-запись» switch, Услуги).
- `reference`: the 7-3-1 reference on the PDF next to the IBAN, the
  invoice page, the list (searchable), the export and the barber's money
  page; computed from the number, so Isolta's imported invoices have it
  too.
- `iban`: no issuing without the company's IBAN (`no_bank`), then its
  address (`no_address`); the draft says so with a link to «Настройки»; no
  number is taken.
- `isolta-small`: a phone on each receiver (044; filled by the Isolta
  import where empty); the draft's head shows the number it would get now
  («не закреплён»); the note is internal and never printed. And
  «Отправить снова» goes to the receiver's current e-mail, as Isolta's
  send window takes the contact's.

Tests: `tests/online-booking-settings.test.ts` (27), `tests/journal-days.test.ts`
(21), `tests/billing-isolta-parity.test.ts` (11), plus the changed
`tests/parity-invoices.test.ts`, `tests/isolta-import.test.ts`,
`tests/invoice-section.test.ts` and `tests/demo-seed.test.ts`.

Runs with all of it together (24.11, afternoon): 1353 unit tests;
`tests/pg-race.test.ts` on Postgres 18 (042–044 from empty); typecheck;
the e2e in dev (273) and on the production build (275). Each run had
failures that passed when run alone (dev: «Отзывы» opened on the login
page; production: one slow «Перенести на» on the iPhone, whose visit then
filled Jevgeni's short Wednesday for the three tests after it). Two real
ones, the barbers' tiles in «Услуги» in the old order, were fixed.

**Waiting on Renat** (his page): paying a visit (cash / card, 81 a month,
all Jevgeni's) and the finance rights behind it; Altegio's other reports
(retention, workload, finance, P&L, till, by staff, service or client) and
the accountant's receivables file from Isolta; each barber's own rights as
in Altegio (every barber starts from the same role set now); the client and
visit import (3 207 clients); Isolta's old send and open history (the
export has none).

**Smaller differences, kept:** «Сообщения» has no SMS delivery report from
Messaggio (only accepted or failed), no carrier filter and no Excel export;
«Изменения данных» has no action filter; «Отзывы» has no Excel export;
client files up to 5 MB (Altegio 12 MB); an issued invoice is credited and
copied, never modified or deleted; no quotes or order confirmations.
None of these is used at REMPIRE as far as the scans show.

## Tests added on 24.11 for what was untested

**`tests/parity-booking.test.ts`** (Altegio behaviours no test touched):

- A barber with «online booking» off: not on the booking page, offered no
  time, never booked by «Любой»; the admin still books him and his column
  stays; switched on again, he is offered and booked.
- A service with «online booking» off: not in the catalog, an online
  booking of it refused; the admin still books it; on again, booked online.
- The online comment and e-mail: the comment kept (trimmed) where the visit
  window and the calendar read it; the e-mail on a new client's card in
  small letters; a card with an e-mail keeps it, that visit's letter goes
  to the one typed.
- The client cancels online: the barber's push, Renat's «own_client» push,
  the time free at once; Renat's switch off, only the barber hears; the
  «cancelled» letter at the address the confirmation went to (round 15),
  none without one.
- The client moves online: the «moved» letter, the barber's and Renat's
  push, the old time free.
- A staff push switched off on «Уведомления»: one queued before is skipped
  when it goes, the salon's own push still goes; switched on, the next
  goes.

**`tests/parity-invoices.test.ts`** (Isolta behaviours no test touched):

- «Отправить снова»: a second letter with the PDF and «resend» in the
  events; never for a draft or a discarded invoice.
- No e-mail on the receiver: refused with `no_email`, no number used up.
- The PDF's text: both registry codes, IBAN and bank, dates, lines and
  totals, «no VAT» or the KMKR number and 24 % lines; the draft's preview
  with no number and the draft stamp.
- The barber's own PDF in his app: his own issued invoice opens; another
  barber's, his draft and a missing one answer «not found»; no session goes
  to the login.
- Isolta's series at the switch: set to 422, it issues 423, then 424,
  never goes back and does not restart in a new year.
- «Открыт.»: Resend's «opened» shows in the receiver's journal and the
  invoice's events.

**`tests/isolta-import.test.ts`**: the import report warns when our next
number will not print as Isolta's bare one; a company set as Isolta's goes
on with a bare number and no warning.
