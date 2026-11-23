# One REMPIRE: the accounts plan

*23.11.2026, at Dim's request: «decide what runs on rempire.ee and what on
the shop, which accounts are used; the fewer accounts, the better the
overview». A proposal; the choices are on decisions round 14. Today's
accounts: `docs/accounts.md` (booking) and `rempire-web/docs/accounts.md`
(shop). Dim is away 30.11–13.12 without internet, so everything that needs
Renat is asked before 30.11.*

## What runs where

| Address | What | Runs on | Company |
|---|---|---|---|
| `rempire.ee`, `www.rempire.ee` | The salon's website (a React site; its host is not known to us) | as today; its «book» buttons go to `book.rempire.ee` | Rempire OÜ |
| `book.rempire.ee` | Client booking, the visit pages, the salon page | Vercel team «Rempire», project `rempire-booking` | Rempire OÜ |
| `staff.rempire.ee` | Renat's admin and the barbers' app (one installed app) | the same project | Rempire OÜ |
| `send.rempire.ee` | Booking letters' sending domain (Resend); mail to `@rempire.ee` stays at Zone | Resend | Rempire OÜ |
| `rempireshop.com` | The shop, its panel, the partner API the booking reads | Vercel project `rempire-web` | Rempire Store OÜ |
| `rempire-booking.diipsolutions.eu` | Staging, noindex, its own database (round 13: it stays) | the same Vercel project, Dim's DNS | — |

Both apps stay **separate projects with separate databases**: a problem in
one never takes the other down. What they share is the accounts around them.

## Accounts: today and the target

| Service | Today | Target | Who acts |
|---|---|---|---|
| **Google identity** | rempireshopinfo@gmail.com for the shop and the booking; the salon's Google Maps profile and (probably) the rempire.ee tags sit on **another account nobody here has** | rempireshopinfo@gmail.com owns or manages all of it | Renat: find who holds the salon's Maps profile and ask them to add rempireshopinfo@ as owner |
| **Domains** (Zone.ee) | `rempireshop.com`: THEFLOW OÜ, Zone account blackboxestonia@ (Renat's own). `rempire.ee`: Rempire OÜ, Zone.ee, **expires 04.02.2027**, account not known | both domains in one Zone.ee account, auto-renew on | Renat: which Zone.ee account holds rempire.ee |
| **Cloudflare** (DNS) | `rempireshop.com` on the shop's account (rempireshopinfo@). `rempire.ee` on **another account** (nameservers `ligia` / `vicky`, moved there on 04.11.2026) | one account (rempireshop.com's) with both zones | Later, once tested (Dim, 23.11): Renat's page asks only where the booking lives. If on rempire.ee: access to that zone, or its holder adds two records by our instructions; or the booking stays on the shop's domain and rempire.ee links to it |
| **Vercel** | team «Rempire», Pro $20 a month, both projects | the same; **stays Pro**: Hobby is for non-commercial use only and allows a cron once a day, the booking needs one every 5 minutes | nothing |
| **Railway** | workspace «rempireshop's Projects»: the shop's Postgres and booking staging | the same workspace; booking production as its own project and database (about $5 a month more) | Dim creates it after 13.12 |
| **GitHub** | shop: `rempireshop/rempire-web`; booking: `dimnovare/rempire-booking` | both under `rempireshop`; Dim a collaborator; the booking gets the shop's backup workflow | Dim, at the handover |
| **Resend** (e-mail) | two free accounts: the shop's (rempireshop.com) and the booking's (rempireshopinfo+booking@, same inbox) | **option A**: keep both free (0 €; one Google inbox behind both). **option B**: one paid account for both domains ($20 a month). One free account for both doesn't fit: 100 letters a day shared | **Dim chose A** (round 14, 23.11) |
| **Google Cloud** | two projects: «Rempire shop» (customers' Google login, published) and «REMPIRE Booking» (staff Google login, never published, broke on 18.11) | **option A**: drop staff Google login (e-mail code and password stay) and delete the booking project. **option B**: move the staff login into the shop's project | Later (Dim, 23.11): access to the salon's Google account, to keep one place and fewer logins; Renat's page asks only whether he has it |
| **SMS** (Messaggio) | Renat's own account; Altegio sends through it | the same; Altegio's sending switched off at the move | Renat: login and sender before 30.11 |
| **Uptime monitor** | none | one free UptimeRobot account on rempireshopinfo@: `/api/health` and `/api/health/cron` of the booking, the shop's home page; alerts to Renat after the switch (Dim, 23.11), to Dim while testing | Dim opens it (5 minutes) |
| **Backups** | shop: GitHub Actions twice a day, restored and counted each time | the booking copies the same workflow | Claude builds it |
| **Web push keys** | one pair per app, in Vercel only | the same (no account) | — |
| **Altegio, Isolta** | Renat's | cancelled after the move (Altegio a month after, Isolta at its renewal) | Renat |
| **Telegram** `@rempireshop_bot` | shop's order pings | untouched | — |

After this, the list is: **one Google identity, one Zone.ee, one
Cloudflare, one Vercel team, one Railway workspace, one GitHub owner**, plus
Resend (one or two), Messaggio, UptimeRobot, and the shop's own (Montonio,
OpenAI, Merchant Center, Search Console).

## Who pays

Three companies are in play: **Rempire OÜ** (the salon, rempire.ee),
**Rempire Store OÜ** (the shop) and **THEFLOW OÜ** (rempireshop.com's
registrant). The booking's costs (its share of Vercel, its database, SMS)
belong to the salon. Today Vercel, Railway and Cloudflare run on Dim's
card. The accounts move to Renat in any case (Dim, 23.11); the open point
is which side they belong to, the salon's rempire.ee or the shop's
rempireshop.com, and so which company's card replaces Dim's (the shop's
«card plan»).

## Asked of Renat (his page, set 4, 23.11)

Dim forwards `docs/renat-before-30-11.ru.md`; no switch date is agreed
with Renat, so none is named.

1. Altegio and Isolta: he checks and decides himself whether to extend
   for a year; 1–2 months may be enough.
2. Where the booking lives: rempire.ee or the shop's domain.
3. Whether he has access to the salon's Google account.
4. Altegio's Excel exports of clients and visits: Altegio mails them only
   to the owner, so he forwards them.
5. Which side the accounts move to (23.11 evening): the salon,
   rempire.ee, or the shop, rempireshop.com.

Later, when the work gets there: Messaggio's login (SMS tests), the
barbers' e-mails (after testing), access to the Google account and, if
the booking moves there, to rempire.ee's DNS.

## Not now

- Moving the rempire.ee website itself onto Vercel (one host less): only
  if its maker hands it over; it works as it is.
- One shared database for shop and booking: saves about $5 a month, but a
  shop problem could stop bookings.
