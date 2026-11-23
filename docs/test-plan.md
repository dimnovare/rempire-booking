# Test plan before the launch

*23.11.2026, at Dim's request: «the booking of Renat can never go down».
What must be tested, by whom, and how, before bookings move from Altegio
(`docs/launch.md`). Every box here is ticked on the **production build**
before the switch. Claude runs everything a browser can do; Dim, Renat and
one barber do the part that needs a real phone in a hand.*

Related: `docs/launch.md` (the move), `docs/accounts.md` (accounts, env
vars), `docs/test-run.md` (the staging test run with the barbers),
`docs/phase-b-phone-test.md` (one barber's phone, step by step).

## 1. Nothing reaches a client while we test

The rule: **no test, by Claude or anyone, sends a letter, SMS or push to a
real client, or writes to the live shop.** Three places tests run, from
safest to least safe:

| Where | Mail | SMS | Push | Shop | Use it for |
|---|---|---|---|---|---|
| **Local test server** (`npm run e2e`, the `barber-dev` preview) | printed to the log | printed | no keys: none | fake shop | every functional check, again and again |
| **Staging** (`rempire-booking.diipsolutions.eu`, `ALLOW_INDEXING` unset) | real send, but every non-staff address is redirected to `TEST_MAIL_TO` | real send only to numbers in `SMS_TEST_TO` | real, to phones that opted in on staging | read only; sales off (`SHOP_SALES` unset) | how letters look in real inboxes, real SMS, real push, real phones |
| **Production** after `ALLOW_INDEXING=yes` | real | real | real | real | the smoke test (§ 9) with Dim's own phone and e-mail only |

What keeps each channel quiet, and where it can still leak:

- **E-mail.** On staging `mailGuard` (`src/lib/test-run.ts`) sends a
  client's letter to `TEST_MAIL_TO`, or to the shop inbox if that is unset.
  - Leak 1: an address that belongs to an active **staff login** gets the
    real letter (subject «[ТЕСТ]»). Staging logins must be Dim's and the
    demo `example.test` ones only, or barbers who agreed to it.
  - Leak 2: **login codes** are never redirected; they go only to existing
    logins, so this is safe.
  - Fixed 23.11: `EMAIL_TRANSPORT=console` now wins over Resend keys
    (`src/lib/email.ts`), and the e2e server and the `barber-dev` preview
    blank every outbound key, so a local `.env*.local` file can no longer
    make a test send mail or call the live shop.
- **SMS.** Until `ALLOW_INDEXING=yes`, Messaggio is used only for the exact
  numbers in `SMS_TEST_TO` (with `+372`). Every other SMS is only printed.
- **Push.** No test-run guard: it reaches every phone that **opted in on
  staging**. Only staff and testers can opt in, never a real client. Before
  a staging run, «Доступ» must show only test phones; a barber who opted in
  gets every test booking and the 20:00 day plan.
- **The shop.** `SHOP_SALES` unset: a sale is stored as `test`, nothing is
  sent. Reads hit the live shop. **Photo search costs money** (the shop's
  OpenAI key): test it once, not in a loop.
- **Altegio.** No test touches it. Its flows are walked only up to the
  client details form (CLAUDE.md).
- **Mass actions send for real**: «Отменить выбранные» in «Записи» (a
  letter and a push per visit), mass messages in «Клиенты», issuing an
  invoice (it runs the whole outbox at once). On staging they are
  redirected like every letter; on production they are run only on Dim's
  own test visits.

### Before each staging run (5 minutes)

1. `TEST_MAIL_TO` is set to Dim's test inbox (decision, round 13), not the
   shop inbox.
2. `SMS_TEST_TO` holds Dim's number only.
3. «Доступ»: no barber login has a real e-mail unless he agreed; push
   subscriptions are Dim's test phones only.
4. `SHOP_SALES` unset; `ALLOW_INDEXING` unset; the yellow test banner shows.
5. Test clients: names start with «Тест», e-mails at `example.test`,
   phones not in `SMS_TEST_TO`.

**After the run:** «Сообщения» lists every message. Each real recipient is
`TEST_MAIL_TO`, a number in `SMS_TEST_TO` or a test phone. Resend's log
shows the same, nothing else.

## 2. Automated tests

| Suite | Command | Today (23.11) | Must be |
|---|---|---|---|
| Types | `npm run typecheck` | green | green |
| Unit (Vitest, PGlite) | `npm test` | 1151 tests; 1 failed, depended on the hour of the day, fixed 23.11 | green twice in a row, at two hours of the day |
| E2E, phone size (Playwright: Pixel 7 Chromium, iPhone 13 WebKit) | `npm run e2e` | 268 passed, 61 skipped (by design), 4 failed: each assumed a working day or a later hour; fixed 23.11, the 4 pass | green on a Monday, a Saturday and a weekday, morning and evening |
| E2E, production build | `npm run build` then `E2E_PROD=yes npm run e2e` | Android only | green |
| No index | `npm run check:noindex -- <url>` | after every deploy | staging: noindex; production after the move: indexed |

**To add before the launch** (in this order):

1. **Booking smoke test after every deploy** in CI: the booking page
   answers 200 with the salon's name in it; `/api/…/slots` returns times;
   a health route proves the database answers. A failure stops the deploy
   job and alerts Dim.
2. **Two people, one time:** two bookings of the same slot at the same
   moment, against Postgres: exactly one 201, one 409. The database has an
   exclusion constraint (`appointments_no_overlap`); the test proves the
   API turns it into a clean «time taken».
3. **Postgres in CI**: the migrations from empty and from staging's last
   state, on a real Postgres 18, not only PGlite.
4. **The cron over HTTP**: with the secret, one due reminder goes once;
   a second run sends nothing more.
5. **Resend handling**: a 500, a timeout and a 429 from a stub; the row is
   retried, never sent twice. A timeout on the call itself.
6. **The error page**: database off → the friendly page with the salon's
   phone (built 23.11, checked by hand with the `db-down` preview in
   `.claude/launch.json`); an e2e test for it is still to write.
   `/api/health` and `/api/health/cron` have unit tests
   (`tests/health.test.ts`).
7. **E2E in CI** on every push, and three desktop projects for the admin:
   Chrome, Firefox and Safari (WebKit) at 1440 × 900.
8. **Load**: 50 visitors choosing times and 10 booking at once, for five
   minutes; no error, slots answer under 1 s.

Not covered by any test today: «Проверить» push; the `/admin/reports`
page; `/admin/login` in a browser and Google login end to end; real FCM
and APNs delivery; offline on iPhone; outages of the database, Resend,
Messaggio or the shop.

## 3. Client booking (RU, ET, EN)

Every line in all three languages, on a phone and on a computer.

**Choosing**
- [ ] `/` opens in the browser's language; the language sheet switches
      and remembers it.
- [ ] Barber first, service first and «Любой мастер» all reach the same
      free times.
- [ ] `?b=<barber>` opens with that barber chosen.
- [ ] Several services: durations and prices add up; the time fits all.
- [ ] «Визит вне рабочего времени (доплата)» shows its extra fee, and the
      total includes it.
- [ ] Prices and names match «Услуги» exactly, after a change too.

**Free times** (each checked against the admin calendar)
- [ ] Only inside working hours; never in a break, time off, a block or
      another visit.
- [ ] Today: no time already past; minimum notice respected.
- [ ] The last time of the day still fits the whole visit.
- [ ] Nothing past the booking horizon (60 days by default).
- [ ] A barber with no hours that day shows no times, not an error.
- [ ] Around midnight, and on the nights the clocks change (28.03.2027,
      31.10.2027), times are in Tallinn time.

**Details and booking**
- [ ] Name and phone required; Estonian (`+372`), Finnish, Russian and
      Latvian numbers accepted; wrong ones explained under the field.
- [ ] E-mail optional and checked; comment; SMS tick; consent required.
- [ ] The phone keyboard shows digits for the phone and @ for e-mail;
      autofill fills name, phone and e-mail.
- [ ] «Записаться» twice quickly makes one visit.
- [ ] The time taken in the meantime: a clear message and other times.
- [ ] Network lost while booking: a clear message; retrying makes one
      visit.
- [ ] Done screen: barber, services, day, time, price, address, «add to
      calendar», «move or cancel».
- [ ] Within seconds: in the admin calendar, in the barber's app, the
      barber's push, the confirmation letter.
- [ ] «Ваша запись» on the booking page in the same browser.

**Salon page** (`/about`)
- [ ] Contacts, map, photos, opening hours as in «Настройки».
- [ ] Reviews six at a time; the form holds a review for approval; its
      limits (3 an hour per address) answer politely.

**Everyone**
- [ ] Text at 200 % zoom and the phone's largest font: nothing cut off.
- [ ] Keyboard only and a screen reader (VoiceOver, TalkBack) can book.
- [ ] First load on slow 3G under 3 s; no layout jumps.
- [ ] Staging: noindex in meta, `robots.txt` and the header.

## 4. The client's visit page and links

- [ ] The link in every letter and SMS opens the right visit (`/v/…` short
      link too).
- [ ] «Add to calendar» works in Google Calendar, Apple Calendar and
      Outlook, at the right time.
- [ ] Move: only free times; closes 2 h before; the «moved» letter; the
      barber's push; the old time is free again.
- [ ] Cancel: confirms first; the «cancelled» letter; the barber's push;
      the time is free again at once on the booking page.
- [ ] A cancelled, past or unknown link shows a clear page with the
      salon's phone, never an error.
- [ ] Push opt-in from the visit page; the reminder arrives.

## 5. Admin: Renat and the front desk

On a computer (Chrome, Safari, Edge, Firefox) and on Renat's phone.

- [ ] **Login**: password, e-mail code, Google; wrong password; log out;
      log out another device.
- [ ] **Журнал**: day and week; every barber's column; new visit (known
      client, new client); drag to move, drag to lengthen; edit services;
      statuses «Пришёл», «Ожидание», «Подтвердил», «Не пришёл» (the
      no-show letter); cancel; blocks; special time; the month in the
      sidebar; selling a product from the visit.
- [ ] **Визиты**: the list and the feed; open a visit (page to be rebuilt,
      design on Dim's canvas).
- [ ] **Записи**: every filter; Excel export opens in Excel; «Отменить
      выбранные» on test visits only.
- [ ] **Клиенты**: list, columns, search by phone; card with its 7 tabs;
      edit, comments, photo, files; a message to one client; mass message
      (preview first); labels; delete; export.
- [ ] **Услуги**, **Сотрудники**, **График работы**: every change shows at
      once on the booking page and in the barber's app.
- [ ] **Доступ**: add a login, rights, copy rights, switch off, link to a
      barber.
- [ ] **Запросы**: approve and decline; the barber's push.
- [ ] **Отзывы**, **Сообщения**, **Изменения**, **Каталог**: lists load;
      hide a review.
- [ ] **Настройки**: brand, contacts («Найти»), gallery; «Уведомления»:
      each switch really stops its message (§ 7).
- [ ] **Счета**: the Isolta flow end to end: receivers, rent, items, new
      draft, preview, issue, paid, credit, resend, copy, discard; the
      month's drafts; reports and CSV / xlsx; numbers `TEST-…` on staging.
- [ ] **Аналитика / Отчёты**: three numbers checked by hand against the
      visits behind them.

## 6. The barber's app

On an Android phone and an iPhone, installed on the home screen.

- [ ] Install from the start page, on both; the icon and name are right;
      it opens without the browser's bar.
- [ ] Login by e-mail code; stays logged in for weeks.
- [ ] **День**: his own column; visits, breaks, blocks in Altegio's
      colours; the visit sheet: add a service (only with the right), book,
      move, emergency cancel with a reason, client card, notes, «Записать
      снова».
- [ ] **Неделя**.
- [ ] **Моё время**: break, vacation, sick day, special time (money or %),
      weekly hours; each goes at once or waits for Renat, as his rights
      say; withdraw a request.
- [ ] **Продать**: search, barcode by camera, photo search (once), sell to
      a client and to himself, undo within 5 minutes; nothing reaches the
      shop while `SHOP_SALES` is off.
- [ ] **Деньги**: his month; invoice PDFs open on the phone.
- [ ] **Ещё**: language, push on / off / per kind, «Проверить», log out.
- [ ] Renat's «view as» a barber.
- [ ] Offline: the last loaded day stays readable with a clear banner;
      back online it refreshes by itself.

## 7. Letters, SMS, push and the cron

For each message: it arrives **once**, at the right time (Tallinn), in the
client's language, with links that work; its switch in «Уведомления» stops
it; the client's own opt-out stops it.

| Message | To | Channel | When |
|---|---|---|---|
| Confirmation | client | e-mail | at once |
| Moved, cancelled | client | e-mail | at once |
| Reminder | client | e-mail | 12 h before |
| Reminder | client | SMS and/or push | 2 h before |
| Birthday | client | e-mail, push, SMS fallback | on the day |
| No-show | client | e-mail / SMS | after «Не пришёл» |
| Manual, mass | client | chosen | at once |
| Invoice, credit, resend | barber | e-mail with PDF | at issue |
| Login code | staff | e-mail | at once |
| New, moved, cancelled visit; request answer | barber | push | at once |
| Day plan | barber | push | 20:00 |
| Online booking, new client, requests | Renat | push | at once |

- [ ] The cron runs every 5 minutes (Vercel Pro; Hobby allows one a day).
      «Сообщения» shows each run's rows.
- [ ] A visit booked 1 h ahead gets no 2-hour reminder; one booked 3 h
      ahead gets it.
- [ ] A visit moved after its reminder was planned gets the reminder for
      the new time only.
- [ ] A cancelled visit gets no reminder.
- [ ] The new letters (Dim's canvas) look right in Gmail (web, Android,
      iPhone), Apple Mail and Outlook, light and dark mode.
- [ ] rempire.ee's mail domain passes SPF, DKIM and DMARC; letters land in
      the inbox, not spam.
- [ ] SMS: the sender shows «REMPIRE»; the text fits one SMS; the link
      opens the visit.
- [ ] Push on iPhone needs the app on the home screen (iOS 16.4 or later):
      the install page says so.

## 8. Who may see and do what

Each row is tried by URL too, not only by the menu: a page the login
lacks answers «no access», never data.

| Login | Must reach | Must not reach |
|---|---|---|
| No login (client) | booking, salon page, his visit by its link | `/admin`, `/b`, other visits |
| Owner (Renat) | everything, «Изменения», `/b` as any barber | — |
| Front desk / manager | journal, clients, records, as rights say | «Изменения», rights, invoices unless given |
| Barber | his day, his clients as rights say, his money | other barbers' money, admin pages, other columns unless given |
| Barber with extra rights | what his rights add, nothing more | — |
| Switched-off login | nothing; open sessions end | — |

## 9. Production smoke test

Run on production with `ALLOW_INDEXING` still unset (launch step 5), and
again right after it is set (launch step 13). Dim's own phone and e-mail
only. 15 minutes.

1. Booking page loads on a phone and a computer, in RU, ET and EN; the
   test banner shows while `ALLOW_INDEXING` is unset and is gone after.
2. Book a real visit for Dim with a real barber, tomorrow.
3. It is in the journal and in the barber's app; the barber's push came.
4. The confirmation letter reached Dim's inbox; its links open the visit.
5. Move it; the «moved» letter; the old time is free.
6. SMS: with Dim's number in `SMS_TEST_TO` (before) or for real (after),
   the reminder for a visit 2 h 10 min ahead arrives on time.
7. Cancel it; the «cancelled» letter; the time is free again.
8. «Сообщения»: every row sent, nothing failed, nobody else.
9. `npm run check:noindex -- <client host>`: noindex before, indexed
   after; the staff host stays noindex.
10. The error page: the uptime monitor's last checks are green.

## 10. Real phones and browsers

The e2e runs on emulated phones (Chromium and WebKit on Windows). That is
not real Safari or a real installed app, so a real-phone pass is needed.

| Device | Who | What |
|---|---|---|
| iPhone, current iOS, Safari | Dim | client booking; visit page; install the staff app; push with the screen locked; tap the push opens the visit |
| iPhone, older iOS (16.4–17) | a barber | the same; push |
| Android, Chrome | Dim or a barber | the same; camera scanner; push; install |
| Android, Samsung Internet | a barber | client booking |
| Renat's phone | Renat | his admin on the phone; the owner pushes |
| Mac Safari, Windows Chrome and Edge, Firefox | Claude (browser) and Dim | the admin, the booking |

Each device also: dark mode, the largest font, landscape, a slow network,
phone locked for an hour then opened (still logged in, data fresh).
`docs/phase-b-phone-test.md` is the barber's half, step by step.

## 11. Can it go down?

Each case is forced on staging or a local production build, and the
answer must be calm, clear and recoverable.

| Case | Expected |
|---|---|
| Database unreachable | the error page with the salon's phone (the page itself may still answer 200: it streams); `/api/health` answers 503 and the monitor alerts within 5 minutes; back by itself when the database is |
| `DATABASE_URL` missing on production | refuses to start; never the in-memory demo database (`DB_DRIVER` unset on production) |
| Railway's CA changes | known date (CA expires 14.02.2029); a reminder in Dim's calendar |
| Cron stops | booking and confirmations still work; reminders late; `/api/health/cron` answers 503 after 15 minutes without a finished run, and the monitor alerts |
| Resend down or slow | booking still works; letters retried; after 5 failures shown in «Сообщения» and resent by hand |
| Messaggio down | the same for SMS |
| The shop down | «Продать» says so; booking untouched |
| A deploy during a booking | the booking finishes or fails clearly; never half a visit |
| A deploy with a bad migration | caught on staging first; Vercel's Instant Rollback; migrations only add |
| Spam bookings | a limit per IP on `/api/bookings` (to build); Renat can cancel many at once |
| Two people, one time | one visit; the other sees other times (§ 2 item 2) |
| Backups | a nightly backup (Railway's, if the plan has them, or a dump of our own) restored once into a scratch database; counts match |

## 12. The Altegio import check (A7)

On the dress rehearsal (launch step 6) and again on the evening before.

- [ ] Clients: count equals Altegio's; 20 random ones with name, phone,
      e-mail, visits count.
- [ ] Future visits: count per barber per day equals Altegio's journal for
      the next 30 days; 20 random ones with time, services, price, client.
- [ ] Nobody gets a letter or SMS because of the import.
- [ ] Reviews: count and the newest five.

## 13. Sign-off

| Part | Run by | Date | Result |
|---|---|---|---|
| § 2 automated, all green on the production build | Claude | | |
| § 3–8 on the local production build | Claude | | |
| § 3–8 on staging, letters and SMS checked in Dim's inbox and phone | Claude and Dim | | |
| § 10 real phones | Dim, Renat, one barber | | |
| § 11 outages | Claude | | |
| § 12 import | Claude, checked by Renat | | |
| § 9 smoke test on production | Claude and Dim | | |
| Go | Dim and Renat | | |
