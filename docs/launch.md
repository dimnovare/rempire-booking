# Launch on rempire.ee

*23.11.2026, at Dim's request. What must be true before REMPIRE's bookings
move from Altegio to this app, in what order the move happens, and how to
go back if it fails. Accounts and env vars: `docs/accounts.md`. The tests
that must pass first: `docs/test-plan.md`. Everything that lives only on
staging, and what each becomes at the move: `docs/move-log.md`.*

## The date

- Altegio renews itself on **02.12.2026** (92,99 € a month, paid to
  04.12). Cancelling the renewal before 02.12 still leaves it running to
  04.12: that is our safety net for the first days.
- Renat never answered «до 2 декабря подходит» (`switch.ok`); that
  question left his page on 23.11.
- **Dim chose one more month of Altegio** (round 13, 23.11): Altegio renews
  on 02.12 as usual. Dim is away **30.11–13.12** without internet, so the
  switch comes after that: **Dim's plan is day one Monday 04.01.2027**
  (round 14; not agreed with Renat, so his page names no date),
  the import runs on Sunday 03.01 (nobody works on Sundays in Altegio).
  Whether Altegio and Isolta renew for a year or 1–2 months is Renat's
  call (his page, «Altegio и Isolta»).
- While Dim is away, Renat is invited (not asked) to try the admin on
  staging and report with
  «Сообщить о проблеме» (round 14; message 2 of
  `docs/renat-before-30-11.ru.md`).

## Blockers: none is fully done yet

| # | What | Who | Why it blocks |
|---|---|---|---|
| B1 | **Altegio import (A7):** clients with phones, future visits. Staff, services, prices and hours are already in from Altegio's public widget | Renat forwards Altegio's Excel exports; Claude builds the importer | Without the future visits, barbers lose every booking made in Altegio |
| B2 | **rempire.ee DNS:** who holds the Cloudflare zone, and access for one DNS change per host | Renat (or whoever runs rempire.ee) | No address, no Resend domain on rempire.ee, no Google publish |
| B3 | **Two addresses:** `book.rempire.ee` for clients, `staff.rempire.ee` for staff (round 13); routing by host is not built | Claude builds, after Renat's feedback (Dim, 23.11: no rempire.ee access yet). It can be tried before on a second staging address on diipsolutions.eu | On Android only one of the two apps installs while they share an address (`docs/apps.md`). Renat's iPhone holds both, so his test does not need it |
| B4 | **Messaggio:** project login and the sender code «REMPIRE» | Renat → Dim puts them into Vercel | No SMS reminders. A new sender name takes 1–5 working days |
| B5 | **Production database** on Railway, empty, its own URL and CA | Waits for Renat's answer on which side the accounts go (`payer.side`): the shop's Railway or another. Two databases, one for staging and one live: the same app and setup, but live clients never mix with test data and a change is tried on staging first. Reusing today's database as the live one works too; staging then gets a new empty one (Dim, 23.11: asked) | Staging's database holds demo data |
| B6 | **Privacy policy** page in RU, ET, EN | **Drafted 23.11:** `/ru/privacy`, text in `src/lib/privacy-content.ts` with 16 «[to confirm]» marks. Still: Renat reads it and answers what only the salon knows (his page, `privacy`, 23.11); the server regions are ours to check. The erasure request is built: «Обезличить» on the client's card (23.11) | Google needs it to publish the login; we hold clients' phones and e-mails (GDPR) |
| B7 | **Error page and monitoring:** a friendly error page with the salon's phone, an uptime check that alerts Dim, database backups | **Built 23.11:** the error pages and `/api/health`, `/api/health/cron`. Still: Renat is asked whether he wants the uptime check that mails him (his page, `alert`, 23.11); backups start with the live database, after Renat's OK on the tests (Dim, 23.11) | Today an error shows Next's bare page; nobody would know the booking is down |
| B8 | **The full test pass** in `docs/test-plan.md`, all green, on the production build | Claude runs it; Dim and Renat do the real-phone part | «The booking can never go down» |

Not blocking the launch (they can follow):
- A8 «Мои визиты» with an SMS code (the visit link in every letter and SMS
  already lets a client move or cancel).
- The shop's sales half (`SHOP_SALES`): needs Dim's OK for the shop branch.
- Isolta's invoice history (the import is built; needs Isolta's export).

## Decisions for Dim

Round 13 (artifact `4VNZQCdY9mHDAdYTSzZhrs`, answered 23.11): hosts
`book.` and `staff.rempire.ee`; staging stays; production starts with the
setup from staging (no clients, no visits), then the Altegio import;
staging's redirected letters keep going to the shop inbox; one more month
of Altegio.

Round 14 (artifact `1dwcFR6gRYqkwAF23iVkiA`, answered 23.11): day one
Monday 04.01; Renat tests on staging while Dim is away; two free Resend
accounts; BrowserStack for the test month plus 10 minutes on a real phone.
Asked of Renat (his page, set 4): Altegio and Isolta terms (he decides),
where the booking lives, Google access, Altegio's exports, which side the
accounts move to (rempire.ee or rempireshop.com); then whether he wants
the down alert (it would go to him, not Dim) and the privacy draft to
read (`docs/renat-before-30-11.ru.md`). Settled the same evening (Dim,
kickoff decision 38): no client app of our own, and another business
(tattoo or other) is added when Renat wants it.

## The move, in order

**Days before**
1. Production database (B5); Vercel Production vars (`docs/accounts.md`);
   CI on a branch: production `DOMAIN`, no `SEED_*`, `DB_DRIVER` unset.
2. DNS for both hosts; Vercel domains; `SITE_URL`.
3. Resend: the rempire.ee sending domain, `EMAIL_FROM`, webhook.
4. Google: redirect URIs, privacy policy, publish.
5. Deploy production **with `ALLOW_INDEXING` still unset**: the test run
   stays on, so nothing reaches a real client. Run the production smoke
   test (`docs/test-plan.md` § 9).
6. Dress rehearsal: import Altegio's exports into production, compare
   counts and 20 random visits with Altegio, then wipe them.

**The evening before day one** (after the salon closes)
7. Renat stops changes in Altegio (no new bookings by staff).
8. Fresh Altegio exports → import clients and future visits; reviews with
   `--no-mask`; check counts against Altegio.
9. «Настройки → Уведомления»: check every switch; Renat switches Altegio's
   client SMS and e-mails off.
10. Barbers' logins in «Доступ»; each barber installs the staff app.
11. `ALLOW_INDEXING=yes`, redeploy; `npm run check:noindex` now reports
    indexing on for production only.
12. rempire.ee's «book» buttons and Google Maps «Записаться» point to the
    client host.
13. Claude books, moves and cancels one real visit with Dim's own phone and
    e-mail; checks the letter, the SMS, the barber's push.

**Day one and the week after**
- Claude watches errors, the outbox and the cron every few hours.
- Altegio stays open read-only to 04.02; Renat cancels its renewal before 02.02.
- Isolta is cancelled a month before its renewal, once invoices run here.

## Going back

If bookings fail on day one and the fix is not quick:
1. Point rempire.ee's buttons and Google's link back to Altegio's widget.
2. Visits booked in the new app since the switch are listed in «Записи»
   (filter «Онлайн») and entered in Altegio by hand.
3. Vercel's «Instant Rollback» returns the previous deploy within a
   minute when only the code is at fault.
