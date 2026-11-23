# Launch on rempire.ee

*23.11.2026, at Dim's request. What must be true before REMPIRE's bookings
move from Altegio to this app, in what order the move happens, and how to
go back if it fails. Accounts and env vars: `docs/accounts.md`. The tests
that must pass first: `docs/test-plan.md`.*

## The date

- Altegio renews itself on **02.12.2026** (92,99 € a month, paid to
  04.12). Cancelling the renewal before 02.12 still leaves it running to
  04.12: that is our safety net for the first days.
- Renat has not yet said «до 2 декабря подходит» (his page, `switch.ok`,
  unanswered since 20.11).
- If the blockers below are not done by **30.11**, paying Altegio one more
  month is cheaper than a bad switch.

## Blockers: none of these is done yet

| # | What | Who | Why it blocks |
|---|---|---|---|
| B1 | **Altegio import (A7):** clients with phones, future visits. Staff, services, prices and hours are already in from Altegio's public widget | Renat forwards Altegio's Excel exports; Claude builds the importer | Without the future visits, barbers lose every booking made in Altegio |
| B2 | **rempire.ee DNS:** who holds the Cloudflare zone, and access for one DNS change per host | Renat (or whoever runs rempire.ee) | No address, no Resend domain on rempire.ee, no Google publish |
| B3 | **Two addresses:** one for clients, one for staff (e.g. `broneeri.rempire.ee` and `staff.rempire.ee`); routing by host is not built | Dim decides the names; Claude builds | On Android only one of the two apps installs while they share an address (`docs/apps.md`) |
| B4 | **Messaggio:** project login and the sender code «REMPIRE» | Renat → Dim puts them into Vercel | No SMS reminders. A new sender name takes 1–5 working days |
| B5 | **Production database** on Railway, empty, its own URL and CA | Dim creates it; Claude sets the CA | Staging's database holds demo data |
| B6 | **Privacy policy** page in RU, ET, EN | Claude drafts, Dim and Renat approve | Google needs it to publish the login; we hold clients' phones and e-mails (GDPR) |
| B7 | **Error page and monitoring:** a friendly error page with the salon's phone, an uptime check every minute that alerts Dim, database backups | Claude builds the page; Dim opens the monitor account | Today an error shows Next's bare page; nobody would know the booking is down |
| B8 | **The full test pass** in `docs/test-plan.md`, all green, on the production build | Claude runs it; Dim and Renat do the real-phone part | «The booking can never go down» |

Not blocking the launch (they can follow):
- A8 «Мои визиты» with an SMS code (the visit link in every letter and SMS
  already lets a client move or cancel).
- The shop's sales half (`SHOP_SALES`): needs Dim's OK for the shop branch.
- Isolta's invoice history (the import is built; needs Isolta's export).

## Decisions for Dim

On the round-13 decisions page (artifact `4VNZQCdY9mHDAdYTSzZhrs`, 23.11):
- the two host names;
- who does the real-phone test (`docs/test-plan.md` § 10);
- does staging stay as a second environment after the launch;
- what carries over from staging to production (nothing / the structure);
- where staging's redirected letters go (`TEST_MAIL_TO`);
- the date: 30.11 (Monday 1.12 as day one) or one more month of Altegio.

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
- Altegio stays open read-only to 04.12; Renat cancels its renewal.
- Isolta is cancelled a month before its renewal, once invoices run here.

## Going back

If bookings fail on day one and the fix is not quick:
1. Point rempire.ee's buttons and Google's link back to Altegio's widget.
2. Visits booked in the new app since the switch are listed in «Записи»
   (filter «Онлайн») and entered in Altegio by hand.
3. Vercel's «Instant Rollback» returns the previous deploy within a
   minute when only the code is at fault.
