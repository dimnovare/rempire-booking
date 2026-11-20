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
| 9 | Reference | Altegio's logic and data, and Fresha's simplicity. Dim has Altegio access since 19.11. The look: see 23. |
| 10 | Universal? | **Any service** (Renat, Q&A page, 18.11): tattoo, a massage salon and others, not only barbers. Nothing changes now: words stay REMPIRE's; the code keeps one business per row (`business_id`), so a second one can be added later. |
| 11 | Hosting plan | **Open.** Vercel Pro might stay because two services already run there. Think it through. |
| 12 | Copying | Altegio's and Fresha's features and flows, logic and simplicity. Their logo, name and texts, never. Altegio's look for the client booking: yes, see 23. |
| 13 | Barber companies | Each barber has an FIE or OÜ. VAT applies or not depending on the invoice receiver, so each receiver needs its own setup. |
| 14 | Languages | RU, ET, EN. |
| 15 | Deposits / prepayment | **None for now** (Dim, 17.11): REMPIRE takes none today, so neither do we. |
| 16 | 17 % commission | **From the regular price with VAT** (Renat, Q&A page, 18.11: «От цены с НДС», «От обычной цены», «17 % при продаже от конечной цены с НДС»): basis `gross-list`, also when the product had a discount. The default and staging (migration 029). A barber buying for himself pays the purchase price with VAT, no commission. |
| 17 | Confirmations | **None** (Dim, 17.11): a booking is confirmed at once. Hours a barber opens are his promise to work them. He can still cancel a visit in an emergency. |
| 18 | Altegio data | **Move everything we can** (Dim, 17.11): clients and phone numbers, visit history, reviews. |
| 19 | Invoice format | **PDF by e-mail** is enough (Dim, 17.11). |
| 20 | Special-time extra | **Goes to the barber whole** (Dim, 17.11). |
| 21 | What we read ourselves | Altegio and Isolta access answer the rest (services, prices, hours, the cancel rule; the invoicing company, VAT, chair rent, invoice layout). Renat is not asked those. |
| 22 | Apps | **Two** (Dim, 18.11): one staff app where the role decides what opens, and the client booking site, installable. Renat is owner and barber at once. The final addresses are open. See `docs/apps.md`. |
| 23 | Booking look | **As Altegio's widget** (Renat, 19.11: «оставить все так же как в оригинале: цвета, последовательность, дизайн»; Dim: Altegio's visuals, our texts). Light, the same order of steps, our own code, icons and words. A client cancels at any time; after «Add to calendar» a goodbye and the start again. See `docs/client-flow.md`. |
| 24 | Keep it simple | Dim, 19.11: «let's not try to overcomplicate our solution and make exactly what is asked». For invoices Renat only does «new invoice → pick who gets it» in Isolta. |
| 25 | Staff look | **As Altegio's admin** (Dim, 19.11): the admin and the barber app light, in Altegio's colours, the calendar as its journal. Invoices as Isolta's, with «Новый счёт → получатель» and free invoices beside the month's own. Measured and described in `docs/reference-looks.md`. |
| 26 | Altegio's sections | Dim, decisions page round 8, 19.11. **Build now:** «Клиенты» (the client base; the import lands there), «Записи» (every visit in one table), «График работы» (the month grid of shifts), the sidebar's mini month and four tiles, a PDF preview of a draft invoice. **After the test days:** «Отчёты». **Renat is asked first** (his Q&A page, question 9): «Финансы» (payments and the till), «Отчёты», «Лояльность». Seen in his Altegio, 19.11: no discount rule and no loyalty programme is set up; «Финансовые операции» has a full page of rows for the last month, so payments are recorded there. |
| 27 | Small rules | Dim, round 8, 19.11. The extra for special time shows to the client **in money**, also when set in percent. A special-time window **must add something**; no «+0». The «Вы записаны» screen is to **match Altegio's**: Dim books a test visit there, Renat cancels it, Dim sends the screenshot. After the goodbye the client lands on **rempire.ee's home page**: the booking opens in a new tab and the tab closes after the booking (at the move). The privacy policy for booking: **Claude drafts it** in RU, ET and EN; Dim and Renat approve. |
| 28 | The rule for the look | Dim, 19.11: «scan through all pages of Isolta and Altegio, get all of the functionality and use their UI/UX exactly as is… Use Claude Design Artifact to make sure we make it identical». The scan is `docs/altegio-pages.md` and `docs/isolta-pages.md`; each screen is drawn on the design canvas first, then built. **Altegio's older pages** («Записи», «Клиентская база», reports, finance lists) keep their layout but get the new-style buttons and fields (round 9). |
| 29 | What we copy | Dim, decisions page round 9, 19.11. **Tiles:** «Продажа товара» and «Каталог товаров» show the shop's own data inside our app, never a link out to the shop («we sell shop stuff, so we need to make sure we have shop data there»); the payment tile stays hidden for now. **Goods and stock:** later, if Renat asks. **Finance:** small: mark a visit paid, the day's total; after Renat's answer. **Salaries, loyalty:** left out. **Reports:** four: main numbers, «Записи», messages, the change log. **Messages:** the same set Altegio sends today. **Staff rights:** Altegio's switches per right; first Dim asks which are in use and whether three roles are enough. **Booking form:** its settings become editable, as in Altegio. **Clients:** all of Altegio's fields; seven tabs (all but loyalty and accounts); every bulk action, mass SMS too. **Invoices:** Isolta's own sidebar; no saved products, no contact groups; mark paid and credit invoice, no reminders. |
| 30 | SMS | Dim, round 9, 19.11: **Messaggio**, on Renat's account; the reminder in **English for everyone**, as today (one part). |
| 31 | Import | Dim, round 9, 19.11: the three Excel exports may be downloaded (clients, visits, services); on staging **clients are masked until the move** (real barbers, services, prices, hours and visit times). The «Altegio.me MCP» login in Altegio is not Dim's; he asks Renat. |
| 32 | One place for each thing | Dim, 19.11: products, services and people each have **one list**; Altegio's and Isolta's screens read it, never a second copy. Products are the shop's catalogue; Isolta's «Товары/услуги» becomes a view over the shop's goods and the barbers' services; Isolta's contacts are the companies Renat invoices. The map is `docs/one-place.md`. |
| 33 | Staff rights | Dim, 19.11: **all of Altegio's switches**, on top of the roles. A switch is built for every right whose function we have; the others are listed as not applicable. |
| 34 | Staging data | Dim, 19.11: until Renat's export arrives, staging is filled with **generated visits on the real shifts** (real barbers, services, prices and hours from `tools/altegio-structure.json`; fake clients). Altegio's «Выгрузить в Excel» does not download: it e-mails a link to the account's address (Renat's), so the real client base and visits come through Renat, at the latest for the move. |
| 35 | Owner who also cuts | Dim, 19.11: the «Барбер / Мой день | Салон» switch goes («I do not like the placement or logic… for Renat who is barber and admin»). He chose **variant A** of three drawn on the design canvas: **«Мой день» is a tab of one app, not a mode.** See `docs/apps.md`, «One app for Renat». |
| 36 | After the re-scan | Dim, decisions page round 10, 20.11 (`docs/port-check.md`). **Dashboards:** Altegio's «Визиты» and «Основные показатели», now. **Messages:** all three Altegio sends and we did not, now: the e-mail reminder 12 h before, the birthday greeting at 10:00, the invitation after a no-show; SMS through Renat's Messaggio. **Booking grid:** copy Altegio, 30 min «Оптимальный» from the barber's start, no minimum notice. **Reviews:** import the 51 and show ★ per barber on the booking page. **Switch:** before Altegio renews on 2 December. **Invoices:** «Платежи» hidden until Renat asks; «opened» mark built (Resend webhook); Isolta's issued invoices imported as history; numbering goes on at 423. **Renat's page:** questions replaced on the same link (set 3); what we leave out is listed there for him. |
| 37 | Renat's answers, set 1 | Renat, Q&A page, 18.11 (read 20.11). **Barbers change themselves** (no request to Renat): their schedule, vacation and days off, the prices and the times of their services. **Barber notifications:** in the barber app (push), no Telegram bot. **Renat's pushes from the start:** a new online booking and a client's move or cancel; a barber's cancel, requests and the evening plan are off, each a switch in his settings. **QR plaque:** yes, one for the salon, at the reception (to build). **E-mails:** Renat tests them first himself. **Why he leaves Altegio:** a Russian service that might be shut down, slow support, rare outages, too much he never uses, prices that keep changing. |

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
| Look | Follow rempire.ee. **Replaced 19.11** for the client booking: Altegio's look (decision 23) |
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
- **Real volume** (Renat's Messaggio chart, October 2026): about 565 SMS a
  month, 15–30 on most days. He says he pays about €35 a month. At the
  list price that would be about 1 020 parts, but Altegio's reminder
  template is in English and short, so one part each (scan, 19.11): either
  his rate is nearer €0.06 an SMS, or «about 35» is rough. Ask for one
  Messaggio invoice.
- **What Altegio sends for REMPIRE today** (its «Уведомления», 19.11): the
  reminder by SMS 2 hours before and by e-mail 12 hours before; e-mails for
  a booking made, confirmed and cancelled; a birthday greeting and an
  invitation to no-shows (SMS and e-mail); the phone's confirmation code in
  the widget (SMS). To barbers: e-mail and app for a new and a cancelled
  booking. The notification language is English for everyone.
- **Prices per part to Estonia, without VAT** (the providers' own pages,
  19.11.2026): BulkGate €0.0296, **Messaggio €0.03417**, Messente (Tallinn)
  €0.0372, GatewayAPI €0.0375, SMSAPI €0.040; Sinch, ClickSend, Infobip,
  Twilio and Plivo cost €0.057 to about €0.09. No monthly fee at the first
  four. Estonia has no sender-name registry; the name is checked by the
  provider (Messaggio 1–5 working days, Messente about 48 h). Altegio sells
  no SMS of its own: today's bill is Messaggio's.
- **Our reminder** (`messageText` in `src/lib/outbox.ts`): since 20.11.2026
  every SMS is English and one part (decision 30: «in English for everyone,
  as today»); it drops the address, then the barber's name, if a text would
  run over. E-mail and push stay in the visit's language. (Before: Russian
  with the change link was two parts, Dim, round 4.)
- **Messaggio** (`src/lib/sms.ts`): `POST msg.messaggio.com/api/v1/send` with
  the header `Messaggio-Login`; env `MESSAGGIO_LOGIN`, `MESSAGGIO_SENDER`. On
  staging, until `ALLOW_INDEXING=yes`, only numbers in `SMS_TEST_TO` get a
  real SMS; the rest go to the log. Not yet checked against a live account:
  whether the login is the only credential, the sender code for «REMPIRE»,
  and the current error format.
- **565 reminders a month cost** (Messaggio / Messente / BulkGate):
  - every text one part: €19 / €21 / €17;
  - 70 % Russian in two parts (960 parts): €33 / €36 / €28;
  - all Russian in two parts (1 130 parts): €39 / €42 / €33.
- **So the provider moves the bill by €3–6 a month; the text's length moves
  it by €15–20.** A Russian reminder in one part (70 characters) has no room
  for the label and `https://`; it fits only as «REMPIRE: запись 20.11 в
  14:30, Valentin.» plus a bare short link. A client who takes the reminder
  as a notification costs nothing.
- **Not known yet:** Messaggio's rate on Renat's own account (its page calls
  the price flexible); the minimum top-up at Messaggio and Messente; how
  many clients read Russian.
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

**For Renat** (version 2, 17.11.2026: `docs/questions-for-renat.ru.md`; he answers on the questions page, `/ru/q/<token>`, which saves as he types):

- ~~The 17 % basis.~~ Answered 18.11 (decision 16).
- ~~What a barber may change himself.~~ Answered 18.11: all four (decision 37).
- ~~Telegram notifications for barbers through a new bot.~~ Answered 18.11: in the barber app.
- Monthly costs today: Altegio, Messaggio, Isolta.
- ~~REMPIRE only, or any service.~~ Answered 18.11: any service (decision 10).
- ~~Anything else.~~ Answered 18.11 (decision 37).

**From Altegio and Isolta, once Dim has access:** the cancellation rule,
services, prices and hours; the invoicing company, VAT, chair rent, the
invoice layout.

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
- «My visits» for clients: log in with an SMS code, see, cancel, move,
  book again (Dim, 17.11.2026).
- RU/ET/EN.
- Import from Altegio.
- Done when Renat can run one real day on it, side by side with Altegio.

**B: Barber PWA** (build plan: `docs/phase-b.md`)

- Login.
- My day and week.
- Push for a new, moved or cancelled booking.
- Confirm or decline, if Renat wants confirmations.
- Block time; request vacation.
- Add special time: any hours, each with its own higher price; clients
  book it at once (Renat via Dim, 17.11.2026). Phase A already shows it
  to clients and lets Renat add it in the admin.
- Client notes.

**C: Sales and money** (build plan: `docs/phase-c.md`; Renat's and the
barbers' test run on staging: `docs/test-run.md`)

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

**Last: the live walk-through** (Dim, 20.11.2026)

- When every feature is built: Claude clicks through every page and
  feature on staging, as each kind of login (owner, admin, barber, client).
- Takes out what is not needed (as the «Что барберы меняют сами» card on
  «Запросы», removed 20.11).
- Checks each page against Altegio and Isolta for look, feel and function
  (`docs/altegio-pages.md`, `docs/isolta-pages.md`, the design canvas), and
  fixes the differences.

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
- **Step 1, the same day:** the repo is `dimnovare/rempire-booking`
  (private).
  - Next.js 16.4, noindex in all three places, tests, and CI.
  - Commits use Dim's GitHub noreply address, because his account refuses
    pushes that show his private e-mail.
- **Blocker for the deploy:**
  - Rempire's Vercel team and the shop's Railway both sign in as GitHub
    `rempireshop` (shop's `docs/accounts.md`).
  - Dim's Vercel CLI login only sees his own team, and the Railway CLI is on
    Dim's own account.
  - On Pro every team member is a paid seat.
  - **Resolved the same day:**
    - Dim chose a one-time token.
    - The project `rempire-booking` and its domain were made in the
      dashboard.
    - CI deploys with a token scoped to that project only.
    - Details: `docs/staging-setup.md`.
- **Step 1 done, the same day:** <https://rempire-booking.diipsolutions.eu>
  is live, deployed by CI, and passes `check:noindex` (header, meta,
  robots.txt, 404).
- **Step 2, mock draft 1, the same day:**
  <https://claude.ai/artifact/TPBgoNWMpgQa5cwbHYztsN>.
  - The 4 client screens in RU/ET/EN, in rempire.ee's look. A tap counter
    checks the goal: 4 taps for a first visit, 2 for a return.
  - It also shows the edge cases: a day with no free time, a barber booked
    for 60 days, a time taken while the client types.
  - Dim approved the look the same day. Version 2 carries rempire.ee's own
    logo. Logos, fonts and colours: `docs/brand.md`.
