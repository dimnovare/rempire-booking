# REMPIRE Booking: kickoff brief

*Written 17.11.2026 in the rempireshop chat, as the starting point for this
project. Everything below "Decisions" is either a fact checked on 17.11 or a
recommendation, and each item says which.*

## 1. Goal

Replace **Altegio** (booking) and **Isolta** (invoices to barbers) with one
REMPIRE system. It should be cheaper over time, have fewer clicks than
Altegio, and use REMPIRE's own look. It is built on Dim's domain first, then
moved to rempire.ee.

## 2. Decisions so far (Dim, 16–17.11.2026)

| # | Topic | Decision |
|---|---|---|
| 1 | Shape | A standalone app on its own subdomain. rempire.ee only links to it or embeds it. |
| 2 | Phasing | A booking core → B barber app → C sales, commission and invoices. |
| 3 | Barber app | **PWA**, not a native app. |
| 4 | Product recognition | Barcode scan first. **AI image recognition** (the shop's OpenAI account) as the backup: a photo or screenshot → a product. |
| 5 | Purchase prices | Renat will provide them. **Open:** store them in rempireshop or in the booking system (see §7.3). |
| 6 | Shop link | Through an **API** on rempireshop, never a shared database. |
| 7 | Invoices | **Our own invoicing replaces Isolta**, with no integration. It needs: rent of the barber's chair, items, a choice of who the invoice is for, CRUD for invoice receivers, then print or e-mail. The reason is cost; it pays for itself over time. |
| 8 | SMS | Renat uses **Messaggio** now. It must be cheap, simple and reliable. |
| 9 | Reference | Altegio's logic and data, and Fresha's simplicity, in our look and with fewer clicks. Dim will get Altegio access. |
| 10 | Universal? | **Open.** Dim is asking Renat whether this should work for any business (tattoo, other salons) or barbers only. |
| 11 | Hosting plan | **Open.** Vercel Pro might stay because two services already run there. Think it through. |
| 12 | Copying | Altegio's and Fresha's features and flows, logic and simplicity. Their look, no. |
| 13 | Barber companies | Each barber has an FIE or OÜ. VAT applies or not depending on the invoice receiver, so each receiver needs its own setup. |
| 14 | Languages | RU, ET, EN. |
| 15 | Deposits / prepayment | **Open.** It needs explaining to Renat first (in the questions file). |
| 16 | 17 % commission | **Open.** Dim is asking Renat how it is calculated. |

### Round 1 answers (Dim, decisions page, 17.11.2026)

| Question | Answer |
|---|---|
| Repo and app name | `rempire-booking` |
| Repo owner | `dimnovare`, private; move later if needed |
| Staging address | `rempire-booking.diipsolutions.eu` |
| Where the app runs (decision 11) | A new project on Rempire's Vercel Pro team. **Catch:** that team signs in as GitHub `rempireshop`, and Dim's Vercel login is not a member (see §11 status). |
| Booking database | The shop's Railway account, a project of its own. The same catch applies: the shop's Railway signs in as `rempireshop`. |
| Stack | Next.js + Postgres + Resend + Web Push, as in §6 |
| DB layer | Plain SQL migrations + `pg`, like the shop |
| Staff login | **Password, plus Google login**, with a 6-digit e-mail code as the backup |
| E-mail | A new free Resend account for booking |
| Look | Follow rempire.ee |
| Renat's questions | Dim forwards them on 17.11, unchanged |
| Altegio / Isolta logins | Neither yet |

## 3. Altegio today (walked through 17.11.2026, nothing booked)

### Where it is

- **Public widget:** `https://b353848.alteg.io/company/337850/…`.
  - Company «Rempire», «Mardi, 1-3». The name has a ⌄ chevron, a location
    switcher; only one location is visible.
- **Entry points on rempire.ee/en/barbershop:** each barber card has «book
  now».
  - Three cards go to `/menu`, which opens the barber-first flow.
  - Two cards go to `/personal/select-services`, which opens the
    service-first flow.
  - None of the links pre-selects the barber whose card was tapped. That is
    a free win for us.
- **Tattoo is NOT in Altegio.** On rempire.ee/en/tattoo, each of the five
  artists' «book now» opens their Instagram.
  - Renat's own Claude is building a tattoo booking Telegram Mini App right
    now (Cloudflare Worker + D1).
  - Decide early whether tattoo joins this system (§9).

### The client flow, barber first

1. **Choose a professional.** The list starts with «Any available
   professional», then each barber with photo, title, ★ rating, review count
   and an «i» info button. Then «Continue».
2. **Choose services.** Only the chosen barber's services are listed. Each
   has a checkbox (several can be picked), a duration and a price. Then
   «Continue».
3. **Choose a time.**
   - A month calendar, with slots grouped «Morning / Day / Evening».
   - If the day is full: «There are no available spots for this day · Next
     available date: Thursday, 26 November · Go to the nearest date».
   - The slots seen were 11:15, 13:45, 14:00, 16:45 and 17:00, so the grid
     looks like 15 minutes.
   - Pick a slot, then «Continue».
4. **Details.**
   - A summary: barber, date, «11:15 — 12:00», the services and their total.
   - Fields: **Name\***, **Phone\***, Email, Comment. The comment label shows
     in Russian («Комментарий к записи») even in the English UI, a
     localisation bug.
   - A **reminder** dropdown, defaulting to «2 hours before the visit». The
     options run from «Do not send» and 1 h through 2, 3, 4, 5, 6, 9, 12, 15,
     18, 21 and 24 h, to 2, 3, 5 and 7 days.
   - A consent checkbox (privacy policy + user agreement), then «Book».
   - **No payment or deposit step.**
5. A client account icon sits top right on every step, and there is a cookie
   banner.

**Tap count**, barber-first, before typing: barber → Continue → service →
Continue → (nearest date) → slot → Continue → consent → Book. That is about
9 taps, plus name and phone. Ours should get a returning client from the
reminder or confirmation to «book again» in **2–3 taps**.

### Catalogue seen 17.11

Prices differ by barber; the rempire.ee FAQ says so as well.

| Service (all barbers) | Price |
|---|---|
| Haircut with clippers and scissors | 40 € |
| Haircut with scissors (long hair) | 45 € |
| Haircut with clippers (Buzzcut) | 35 € |
| Haircut + Beard trim | 60 € |
| Beard trim | 28 € |
| Men's grey hairs coverage | 30–35 € |
| Kid's haircut | 35 € |
| Father and son | 65 € |

Renat's own services and durations, for example:

- clippers + scissors: 45 min, 40 €;
- long hair: 1 h, 45 €;
- haircut + beard: 1 h 15 min, 60 €;
- grey coverage: 30 min, 35 €.

**Barbers:**

| Barber | Reviews |
|---|---|
| Jevgeni Hair | 28 |
| Slava Krasytel | 22 |
| Renat Gayanov | 29 |
| Valentin Nachinov | 38 |
| Milena Orehhova | 21 |

Renat's next free slot was 9 days away (26.11).

### What to take from Altegio once Dim has the login

- The client base: names, phones, e-mails, visit history, notes.
- Services with each barber's duration and price.
- Schedules and breaks.
- Future appointments, so the switch-over doesn't lose any.
- Reviews.
- What Renat pays Altegio per month and for SMS.

Look for the admin's export options first. An API probably needs a partner
token. Plan a cut-over day: export → import → put the new links on rempire.ee
→ Altegio read-only for a few weeks.

## 4. rempire.ee today (checked 17.11)

- **Site:** a custom React single-page app (Create React App build,
  `/static/js/main.*.js`), not WordPress or Wix. Languages en/ru/et with
  hreflang; titles look like «… — Rempire».
- **DNS:** Cloudflare, on a **different account** from rempireshop.com
  (nameservers `vicky` / `ligia`). Dim is still waiting for that login.
- **Tags already on it:** GA4 `G-FZ84GVRXZ4`, GTM `GTM-T43NKNP`, Google Ads
  `AW-11038417591`, the Cloudflare beacon, and two `google-site-verification`
  TXT records.
- `www.rempire.ee` answers 200.
- **Moving there:** add `broneeri.rempire.ee` (or `book.`) as a CNAME to the
  app, then point the «book now» buttons at it. The React site itself barely
  changes.

## 5. Accounts and services that already exist

No secrets are written here. The full registry for the shop is
`rempire-web/docs/accounts.md`.

| Service | State today | Use for booking |
|---|---|---|
| **Google account** rempireshopinfo@gmail.com | The shop's identity; 2FA on Renat's phone | Probably the business identity for new services too. Ask Renat which company owns the booking system (§9). |
| **GitHub** | The shop's repo is under user `rempireshop`. Dim is `dimnovare` (the gh CLI on this PC is signed in as dimnovare). | New repo: under `dimnovare` while building, moved to the business later, or under `rempireshop` now. Dim decides. |
| **Vercel** | Team «Rempire», project `rempire-web`, **Pro since 03.11.2026** (Dim's card). Dim also has his own team. | Staging could live on Dim's team. On the shop's Pro team it shares the usage limits; the shop's CDN-request quota is the tight one. Decision 11. |
| **Railway** | The shop's Postgres 18 (EU West), Hobby ~$6/month | A **separate database** for booking, so a booking bug can never lock the shop. Same account or a new one: decide. |
| **Cloudflare** | rempireshop.com zone (the shop's account); **diipsolutions.eu zone (Dim's)**; rempire.ee zone (a third account, login pending) | Staging DNS on diipsolutions.eu now, a CNAME on rempire.ee later. |
| **Resend** | Sends from `@rempireshop.com`; free tier 100/day and 3 000/month **per account** | Booking letters should send from `@rempire.ee`. Check the free plan's domain limit, and keep booking mail from eating the shop's monthly cap: a separate account or a paid plan. |
| **OpenAI API** | The shop's account (`OPENAI_API_KEY`). The shop uses `gpt-6-luna` for text (`src/lib/openai-chat.ts`) and `gpt-image-2.5-sunburst` for photo cut-outs. | The vision backup for recognising products. A key of its own, or a project of its own on the same account, keeps the costs apart. |
| **Montonio** | Renat's payment contract; the shop has live keys | Only if deposits or prepayments are wanted (decision 15). Never place test orders with live keys. |
| **Web Push (VAPID)** | The shop sends order pings to Renat's phone this way | The same technique for the barber PWA, with **new keys** of its own. |
| **Telegram** | `@rempireshop_bot` = shop orders (never touch). Renat is creating a new bot for tattoo booking. | Optional extra notification channel later. |
| **Messaggio** | Renat's SMS provider today | See §8. |
| **Isolta** (Finago) | Renat's invoicing today | It gets replaced; export its receivers and invoice history first. |
| **Altegio** | The live booking system | The reference and data source (§3). |
| **Claude connector «Rempire»** | MCP at `https://rempireshop.com/api/mcp`, guarded by the panel password | Read-only product lookups while designing. Not for the app itself. |
| **Chrome** | The rempireshop profile is deviceId `ec8c7d97-ca57-46de-87b1-f8e8a3f3ca33`. Its display name shifts («Browser 2» or «Browser 3»), so always select it by id. | For walking through Altegio, Isolta and Messaggio once Dim signs in. |

## 6. Recommended stack (a recommendation, not decided)

- **Next.js + Postgres + Resend + Web Push,** the same as the shop.
  - Dim and Claude already know it, and the shop's patterns (migrations,
    i18n, admin, tests) can be copied.
  - A PWA works on Next out of the box.
- **Postgres over Cloudflare D1.** Double booking is blocked by the database
  itself, which SQLite/D1 can't do:

  ```sql
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  ALTER TABLE appointments ADD CONSTRAINT no_overlap
    EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
    WHERE (status <> 'cancelled');
  ```

- **Times:** stored as `timestamptz` and shown in `Europe/Tallinn`. Daylight
  saving changes twice a year, and slot math must survive both changes.
- **Data model:** generic from the start, whatever Renat answers on «universal».
  - Business → Location → Staff (role label «Barber» / «Tattoo artist»).
  - Service, with each staff member's own price and duration.
  - Schedule, TimeOff and Appointment.
  - Client, Product sale and Invoice.
  - It costs almost nothing now and keeps tattoo or other businesses open
    for later.

## 7. The rempireshop connection (facts checked in the shop's code 17.11)

### 7.1 What the shop already has

- **Barcode → product lookup:**
  - The barcode table: `db/migrations/090_inventory.sql`. A barcode is unique
    and points at one product variant.
  - The lookup: `src/app/api/admin/inventory/lookup`.
  - **Almost no barcodes are bound yet.** They get scanned into «Склад»
    first, and that is why the AI-photo backup matters.
- **«Продажа в салоне» (in-salon sale):** `POST /api/admin/pos-orders/`.
  - It creates a paid order with `channel:'pos'`, through the same settlement
    as a web payment.
  - It decrements stock with reason `sale_pos` and is idempotent (`ref` +
    `Idempotency-Key`).
  - **A barber sale is the same thing with a different channel.** Reuse it;
    don't rebuild it.

### 7.2 What it does not have

- **No purchase price («закупочная») anywhere** in the shop database. A
  search of all 68 migrations found nothing.
- **No API for a partner system.** Every admin route is behind the panel
  session.

### 7.3 Proposed shop-side additions (a recommendation; a shop change, so Dim's OK first)

- **Purchase price:** a variant field, admin-only, never in feeds or public
  responses.
  - In the shop, Renat keeps one product list in one place, and margins can
    show in its analytics.
  - The other option is a price table in booking keyed by shop variant id,
    which leaves the shop untouched but makes two places to edit.
  - The shop is recommended.
- **Two partner endpoints,** guarded by a shared server-to-server secret held
  in env on both sides:
  - `GET /api/partner/products/lookup?barcode=…|q=…` returns the variant,
    name, photo, retail price, purchase price and stock.
  - `POST /api/partner/barber-sales` takes `{ref, barberRef, mode:
    "client"|"self", items}`. It creates an order with `channel:'barber'`,
    stock reason `sale_barber`, and is idempotent by `ref`.
- **The 17 % commission is computed and stored in booking,** never in the
  shop.

## 8. SMS

- **Messaggio** (messaggio.com; Dim wrote «messagio») lists Estonia SMS from
  **€0.03417** per message and says the rate is flexible
  ([messaggio.com/messaging/estonia](https://messaggio.com/messaging/estonia/)).
  Confirm the API rate and the alphanumeric sender name «REMPIRE» with them.
- **Alternatives to compare:**
  - **Messente** (Tallinn company);
  - **Twilio**;
  - D7 Networks (lists ~$0.032 local).
- **Rough volume:** 5 barbers × ~8 visits/day × ~26 days ≈ 1 000 reminders a
  month, about €35/month at €0.034. This is an estimate; get the real
  numbers from Renat.
- **Cost savers:**
  - Send SMS only as the 2-hour reminder.
  - Confirmations go by e-mail, plus PWA push where the client has it.
  - Let the client switch the SMS off, as Altegio does.
- **Put the provider behind one small interface** (`sendSms(to, text)`), so
  it can be swapped without touching the booking code.

## 9. Open questions

**For Dim:**

- The domain for staging: `booking.diipsolutions.eu` or
  `rempire-booking.diipsolutions.eu`?
- Who owns the repo and the Vercel project?
- A Railway database on the shop's account or a new one?

**For Renat** (in Russian in `docs/questions-for-renat.ru.md`):

- Which company invoices the barbers?
- The 17 % basis.
- Chair rent amounts.
- Deposits and prepayment.
- The cancellation rule.
- Who sets prices.
- Whether barbers must confirm bookings.
- SMS and Altegio costs today.
- Tattoo in or out.
- Moving the reviews.

**To verify before building invoices:**

- Estonian invoice rules: sequential numbering, seller and buyer details, VAT
  lines per receiver.
- Whether a barber's company can **require an e-invoice (e-arve)**. Estonia
  has been moving B2B to machine-readable e-invoices. Check the current
  Raamatupidamise seadus rules before promising "print or e-mail PDF" is
  enough.

## 10. Phases and what «done» means

**A: Booking core**

- Data model and migrations.
- Renat's admin:
  - day and week calendar with one column per barber;
  - add, move and cancel appointments;
  - barbers;
  - services with each barber's price and duration;
  - working hours, breaks, vacations.
- The client flow: barber or service first, «nearest free slot» up front,
  ≤ 5 taps for a first visit, «book again» for a returning client.
- E-mail confirmation with an `.ics` file and a cancel/move link.
- The 2-hour SMS.
- RU/ET/EN.
- Import from Altegio.
- Done when Renat can run one real day on it, side by side with Altegio.

**B: Barber PWA**

- Login.
- My day and week.
- Push for a new, moved or cancelled booking.
- Confirm or decline, if Renat wants confirmations.
- Block time; request vacation.
- Client notes.

**C: Sales and money**

- Scan or photograph → shop product.
- Sell to a client at the shop price, with 17 % to the barber; or buy for
  themselves at the purchase price.
- Shop stock decremented through the API.
- A per-barber running statement.
- Invoice receivers: CRUD for a person, FIE or OÜ, with VAT on or off and
  their details.
- Invoices: rent, items and commission netting, numbered, as PDF to print
  or e-mail.
- Renat's overview.

## 11. First steps for this chat

1. Create the repo and a minimal Next.js app, deployed to the staging
   subdomain with noindex. Ask Dim for the name first.
2. Draft the data model and the client flow screens. Show Dim a mock before
   any big UI build: he approves looks first.
3. Turn §9 into one tappable decisions page for Dim (Artifact + `db`).
4. Once Dim has the Altegio and Isolta logins, walk their admin screens with
   him signed in, read-only, and list every field and report Renat actually
   uses.

**Status 17.11.2026:**

- Steps 1 and 3 are one page: «REMPIRE Booking decisions», round 1,
  <https://claude.ai/artifact/AEaJBFCscFZRnPm7Jfjf8L>.
  - 12 questions: repo name and owner, staging domain, hosting (decision
    11), Railway, stack, DB layer, staff login, Resend, look, and the status
    of Renat's questions and the logins.
  - Answers are in its `answers` collection, one document per question id,
    `{a, note, at}`.
  - The repo waits for `repo-name`, `repo-owner`, `staging-domain` and
    `vercel-home`.
- Step 2 is half done: `docs/data-model.md` and `docs/client-flow.md`
  (draft 1). The visual mock waits for `look`.
- Step 4 waits for the logins.
