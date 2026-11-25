# Several businesses under one login: the build plan

*24.11.2026. Not started. Dim's rules of 24.11 (below) are fixed. The other
choices are on the decisions page, round 16 (`booking-decisions-page` in
Claude's memory). Until Dim answers, the first option on each card is the
plan. Kickoff decisions 10 and 38 already keep every row under its business,
so REMPIRE's data does not move.*

**Goal:** Renat logs in once, switches between his businesses, and adds a
new one (another barbershop, a tattoo studio, anything bookable) by himself
in a few minutes. It gets its own name, logo, staff, services, hours,
clients, letters and booking link. No code and no deploy are needed.

**Done when** Renat, on his phone and without help, adds a second
business, adds a barber who already works at REMPIRE, opens it for booking,
and a test client books there from its link. Nothing that REMPIRE's clients
or barbers see has changed.

## Dim's rules (24.11.2026)

- **Only owners see every business.** Everyone else sees only the business
  they work in.
- **The owner decides who works in two places.** Example: a barber who works
  one week in Tallinn and the next in Pärnu. The owner adds him to the
  second business, and from then on he can switch between the two. Nobody
  adds themselves.
- **Clients book as they do with Altegio today.** Each business has its own
  generated link. The «Записаться» button on rempire.ee opens it in a new
  tab, where the client picks the barber (or other specialist), the service
  and the time.
- **Each business can be installed on the phone as its own app** (PWA), as
  REMPIRE's booking page can today.
- **A business need not be REMPIRE** (Dim, later on 24.11). Example: a
  massage salon with its own name, with no tie to REMPIRE at all. Its link,
  pages, letters, SMS, phone app and staff app never show REMPIRE.
- **Setting up a business is very simple, fast and professional.** Someone
  who is bad with computers can do it. Every page (booking, salon page,
  barber pages, letters, SMS, privacy) is built from the business's own data,
  so a new business never needs code.

## How it works, for Renat

- **The switch.** In the wide admin, the business name at the top of the
  sidebar opens a list of his businesses, each with its logo, and
  «Добавить бизнес». On the phone it is a row in «Ещё». The admin opens in
  the business he used last.
- **«Добавить бизнес».** Six short steps, one screen each, saved after every
  step (M5). He can leave and come back. Clients see nothing until he taps
  «Открыть запись».
- **A barber in two businesses.** On the barber's card in «Сотрудники»,
  the owner adds the other business under «Работает также в». The barber
  keeps one login. His app gets the same switch. His hours are set in each
  business's «График работы». The system never books him in two places at
  once (M6).
- **The client's link** works as Altegio's. Altegio's links sit on
  Altegio's own domain, never the salon's. In the same way, every business
  gets a link on one neutral booking domain the moment it is added:
  `<booking domain>/<name>`.
  - That domain is bought once and carries no business's name (round 16,
    `address`).
  - Later, a business can get its own domain, `book.<its domain>` (M8).
  - REMPIRE's link is `book.rempire.ee`, its own domain from the start
    (`docs/launch.md` B3).
  - The admin's «Онлайн-запись» page shows the link, with a copy button
    and the snippet for the «Записаться» button on a website.
  - REMPIRE keeps its own addresses.
- **The phone app.** Each business has its own installable app, with its
  own name and icon (made from its logo). A client with two installed sees
  two icons.
- **The staff app** stays one app for all businesses, with the switch
  inside. Only its name and icon depend on where it is installed from:
  - REMPIRE's staff install it from `staff.rempire.ee` as «REMPIRE Team»;
  - other businesses' staff install it from the neutral domain, under a
    neutral name (round 16, `staff-app`).

## Global constraints

- REMPIRE's addresses, look and texts stay exactly as they are. Old links
  (`/ru`, `/v/<token>`, visit pages, barber links) keep working.
- Owners are members of every business they own, including ones added later.
  Every other login belongs only to the businesses an owner adds it to.
  Nobody gets more than that.
- Adding a business takes no code, no deploy, no DNS change and no new
  account. Its link works on the neutral domain at once. Its own domain or
  SMS name stays optional and comes later.
- A business that is not REMPIRE never shows REMPIRE. That covers its link,
  pages, letters and their sender, SMS, phone app, staff app, login letter,
  privacy page and the page shown on an error.
- The setup screens are phone-first, with one main (yellow) action per
  screen, a visible label on every field, and RU/ET/EN through
  `useA()`/`getA()`.
- Never Altegio's names or texts. Staging stays noindex through
  `src/lib/indexing.ts`. Run `npm run check:noindex -- <url>` after every
  staging deploy.
- New migration files only, from `049` (047 and 048 were taken on 25.11 by the bell and «Удалить вход»). Never edit one that has run.
- One place rule (`docs/one-place.md`): one person = one login. A person in
  two businesses has one staff row in each (his services and prices may
  differ by place) and one membership in each.
- Fake data in every test and seed. The shop (`rempire-web`) is not changed.

## Review focus

Things no task below would test by itself, with the behaviour a person
expects. Each one has its own test in the task named.

1. **A tab left open in business A, after a switch to B in another tab.**
   A save from that old tab writes to A or is refused with «Бизнес сменён,
   обновите страницу». It never lands in B. (M2)
2. **A push or bell item from business B, tapped while A is open.** It opens
   B's visit (and switches to B). It never shows «не найдено». (M2)
3. **A name that clashes with a reserved path** (`admin`, `b`, `v`, `api`,
   `ru`, `et`, `en`, …) **or with another business.** The wizard offers the
   next free link. Once a business is open, its link stays fixed even if it
   is renamed. (M4, M5)
4. **A barber removed from a business while his app is open in it.** His
   next tap lands in the business he still has, with no error page. (M1)
5. **A half-finished business** (no logo, services or staff). Its link
   shows «Запись скоро откроется», never an error. Its admin pages show
   empty states. (M5)

## Data

- `049_memberships.sql`
  - `memberships (user_id, business_id, role, staff_id, rights_preset,
    rights, rights_values, notify, bell_seen_at, last_used_at, active,
    created_at)`, primary key `(user_id, business_id)`.
  - `role` is checked as in `users`.
  - `staff_id` must belong to the same business: a unique `(id,
    business_id)` on `staff` and a composite foreign key. Tested.
  - It is filled from today's `users` rows, one per login, skipping
    deleted ones (`users.deleted_at`, 048).
  - «Удалить вход» (048) becomes per business: it deletes this
    business's membership. The `users` row is tombstoned as today (e-mail
    freed, sessions ended, `deleted_was` for «Вернуть») only when no
    membership is left; «Вернуть» puts the membership back.
  - `sessions.business_id`: the business this device has open.
- `050_business_profile.sql`
  - `businesses.kind` (`barber`, `tattoo`, `beauty`, `other`; REMPIRE =
    `barber`).
  - `businesses.status` (`draft`, `open`; REMPIRE = `open`).
  - Brand colour in `businesses.settings` (only if round 16 `look` keeps
    it).
  - The logo stays where it is today: `locations.logo` and
    `location_images` (031), one location per business.
  - `business_hosts (host primary key, business_id, purpose, status,
    created_at)`.
    - `purpose` is `booking` or `staff`; `status` is `pending` or
      `verified`.
    - **REMPIRE's own two hosts are not rows:** they come from `SITE_URL`
      (client) and `STAFF_URL` (staff), as built for launch blocker B3
      (`src/lib/hosts.ts`, `docs/launch.md` «Two addresses»): at the move
      `book.rempire.ee` and `staff.rempire.ee`. `business_hosts` rows are
      for the other businesses' own domains, later (M8).
    - The neutral domain is not a row: it is `PLATFORM_HOST`, and the first
      part of its path names the business.
- `051_users_drop_business.sql`
  - Drops the per-business columns from `users` (`business_id`, `role`,
    `staff_id`, the rights, `notify`, `bell_seen_at`).
  - It ships only after M1 has run on staging, never in the same deploy.

## Tasks

Each task ends green: `npm test`, `npm run typecheck`, the e2e specs it
names, and its own commit. Order: M1 → M2 → M3 → M4 → M5 → M6 → M7. M3 and
M4 can swap. M8 can come any time after M4.

### M1. Memberships and the session's business

REMPIRE works exactly as before. One business is still all there is.

**Files**
- Create: `db/migrations/049_memberships.sql`, `src/lib/auth/memberships.ts`
- Modify:
  - `src/lib/auth/sessions.ts`, `src/lib/auth/current.ts`,
    `src/lib/auth/login.ts`, `src/lib/auth/rights-store.ts`;
  - `src/lib/business.ts`, `src/lib/push.ts`, `src/lib/bell.ts`;
  - the 18 files that call `currentBusiness()`.
- Test: `tests/memberships.test.ts`

**Interfaces**
- Produces:
  - `listMemberships(q, userId): Promise<Membership[]>`
  - `switchBusiness(q, sessionId, userId, businessId): Promise<boolean>`
  - `Membership = { businessId, slug, name, role, staffId, rights }`
  - `StaffUser` gains `businesses: Membership[]`. Its `businessId`, `role`,
    `staffId` and `rights` now come from the active membership.
- `currentBusiness()` is split in two:
  - `sessionBusiness()` (in `current.ts`) for `/admin` and `/b`;
  - `requestBusiness(slug)` for the public pages (M4).
- `BUSINESS_SLUG` only names the default business for REMPIRE's old
  addresses.

**Tests**
- `fills one membership per existing login`: same role, rights, staff link
  and notify as before.
- `refuses a switch to a business the login is not a member of`.
- `a switch changes requireAdmin().business`.
- `a staff_id from another business is rejected by the database`.
- `a session whose business was taken away falls back to one the login
  still has` (Review focus 4).
- `the newest used business opens after login`.

### M2. The switch

**Files**
- Create: `src/app/admin/(app)/business-switch.tsx`, `business-switch.css`
- Modify:
  - `sidebar.tsx`, `more/`, `src/app/b/(app)/layout.tsx`,
    `src/app/b/(app)/more/page.tsx`;
  - `frame-actions.ts` (`switchBusinessAction`);
  - every server action that takes a row id;
  - `src/lib/push.ts` (push title).
- Test: `e2e/businesses.spec.ts`, `tests/business-switch.test.ts`

**What it does**
- Who sees it:
  - an owner always, since «Добавить бизнес» is in the list;
  - anyone else only with 2+ businesses.
- The list is a dialog like the bell's. A dot shows unread bell items in the
  other businesses.
- After a switch, the page is the same section's start page, because ids
  differ between businesses.
- Every form carries its business id. The server refuses it when that id is
  not the session's business (Review focus 1).
- With 2+ businesses, pushes carry the business name. Their link carries
  `?biz=<slug>` and switches on open (Review focus 2).

**Tests**
- e2e, at 1920 and phone width:
  - the owner switches A → B, and the journal shows only B's barbers;
  - a barber with one business sees no switch.
- unit:
  - `a form from business A is refused after the session moved to B`;
  - `a push link for B switches the session to B`.

### M3. Name, logo and words from the business

**Files**
- Create: `src/lib/brand.ts`
- Modify: every hard-coded «REMPIRE», about 90 places. The biggest are:
  - `letters.ts` (46), `privacy-content.ts` (15), `i18n.ts`;
  - `outbox.ts`, `letter-kit.ts`, `og-cards.ts`, `components/brand.tsx`;
  - the client and staff manifests, both layouts, the error pages,
    `sidebar.tsx`, the page titles.
- Test: `tests/brand.test.ts`

**Interfaces**
- Produces: `brandOf(business): Brand`, where
  `Brand = { name, logoUrl | null, colour | null, staffWord: Record<Locale, { one, many }> }`.
- The staff word follows the business kind: «Барбер», «Тату-мастер»,
  «Мастер». It also changes the booking steps' words («Выбрать мастера»).
- The privacy page reads the business's legal name, registry code and
  address from its invoice issuer.

**Tests**
- `a business named Test Studio gets letters, SMS and titles with Test
  Studio and never REMPIRE`.
- `REMPIRE's letters are byte-for-byte the same as before`.
- `no REMPIRE literal in src outside brand defaults, comments and the
  seed`: a scan test, so a new hard-coded name fails CI.

### M4. Each business's link and app

**Files**
- Move `src/app/[locale]/` to `src/app/[biz]/[locale]/`.
- Modify: `src/proxy.ts`, `src/lib/hosts.ts` (B3's `hostRole`),
  `src/lib/business.ts`, `src/app/v/`, the visit pages, `settings/online/`.
- Create:
  - `src/app/[biz]/[locale]/manifest.webmanifest/route.ts` (replaces
    today's);
  - `src/app/[biz]/icon/[size]/route.tsx`.
- Test: `tests/business-routing.test.ts`, a new case in `e2e/book.spec.ts`

**What it does**
- **Built on B3's host function.** Since 25.11 `hostRole(host)` in
  `src/lib/hosts.ts` says what a host serves (`booking`, `staff` or `all`)
  from `SITE_URL` and `STAFF_URL`, and `src/proxy.ts` acts on it. M4
  extends that same function to return the business too, instead of
  writing a second host lookup:
  - REMPIRE's two hosts stay `SITE_URL`'s and `STAFF_URL`'s (no
    `business_hosts` rows for them), and they name the default business;
  - a `business_hosts` row (another business's own domain, M8) gives its
    business and its `purpose`, `booking` or `staff`;
  - `PLATFORM_HOST` gives no business: the path's first part does;
  - any other host stays `all`, as today.
- `proxy.ts` reads the host first:
  - **A business's own host** (REMPIRE's `SITE_URL` host, later a
    `business_hosts` row): every path belongs to that business, so
    `/ru/…` is rewritten to `/<its slug>/ru/…`.
  - **The neutral host** (`PLATFORM_HOST`): `/<slug>/…` passes through and
    `/<slug>` alone goes to the client's language. A bare `/` shows a plain
    page with no business on it.
  - **Today's staging host**: as now. `/ru/…` goes to the default
    business, so nothing changes until the hosts are set.
  - The host lookup is cached and dropped when a host is added (`'use
    cache'` with a tag).
- On staging this is tried on a second address on diipsolutions.eu (noindex,
  as `docs/launch.md` B3 suggests).
- The staff app's manifest takes its name and icon from the host: «REMPIRE
  Team» on `staff.rempire.ee`, the neutral name on `PLATFORM_HOST`.
- A visit token finds its own business, so `/v/<token>` works for every
  business.
- The manifest:
  - each business has `id` and `scope` set to `/<slug>/`, and its own name
    and icons;
  - REMPIRE keeps `id` and `scope` set to `/`, so its installed apps stay
    as they are.
- Icons are 192 and 512 maskable, drawn by `ImageResponse` from the logo,
  or from the name's first letter when there is no logo.
- «Онлайн-запись» shows the link, a copy button and the website button
  snippet. The QR plaque (kickoff decision 37) uses the same link.

**Tests**
- `/ru rewrites to the default business`.
- `/parnu/ru on the neutral host serves parnu`.
- `/ru on book.rempire.ee serves rempire, and /parnu there is not found`:
  one business's own host never shows another business.
- `a business that is not REMPIRE has no "rempire" in its pages, letters,
  manifest, icons or links`.
- `a draft business's link shows the soon page` (Review focus 5).
- `reserved slugs are refused` (Review focus 3).
- e2e: book a visit at the second business's link; its manifest has its own
  id, scope, name and icon.

### M5. «Добавить бизнес»

**Files**
- Create: `src/app/admin/(app)/new-business/` (one page per step) and
  `src/lib/admin/new-business.ts`.
- Test: `tests/new-business.test.ts`, `e2e/new-business.spec.ts`

**The steps.** Each step has a progress line «Шаг 2 из 6», «Назад», one
yellow «Дальше», and is saved on «Дальше».
1. **Название и вид.**
   - The name.
   - Four big tiles: Барбершоп, Тату-студия, Салон красоты, Другое.
   - The languages.
   - The link is shown live as he types (`<booking domain>/massage-studio`)
     and can be edited.
2. **Где вы.**
   - Address (the geocoder exists), phone, e-mail.
   - The logo, optional. The first letter of the name is shown until there
     is one.
   - The company on invoices and the privacy page: «Как у REMPIRE» by
     default, or another company's details.
3. **Часы работы.** «Как в REMPIRE» in one tap, or Mon–Sat 10–20 to edit,
   on the same grid as «График работы».
4. **Услуги.**
   - «Как в REMPIRE» in one tap, or a ready list for the kind.
   - Each row has name, time and price, editable in place. «Добавить
     услугу».
5. **Мастера.**
   - Add a person: name and e-mail; he gets the login code letter.
   - Or «Уже работает у вас»: pick someone from another business (the
     M6 link).
   - Each does all services unless he unticks some.
6. **Проверка.**
   - The live booking page, the link with its copy button, the website
     snippet.
   - «Открыть запись»: `draft` → `open`.

**Interfaces**
- `createDraftBusiness(q, ownerId, { name, kind, slug, locales }): Promise<{ id, slug }>`
  - Inserts the business and its location.
  - Every owner of the business the owner is in becomes an owner of the new
    one.
- `copySettings(q, fromId, toId)`, `copyServices(q, fromId, toId)`
  - They copy names, times, prices and settings, never ids, staff or
    clients.
- `serviceTemplates(kind, locale): ServiceDraft[]`
- `openBusiness(q, id)`
- `suggestSlug(q, name): Promise<string>`: the next free slug that is not
  reserved.

**Tests**
- `the draft is not bookable and not listed for clients`.
- `every owner becomes owner of the new business`.
- `copyServices copies prices and times, not ids`.
- `suggestSlug skips reserved and taken slugs`.
- e2e at phone width:
  - from «Добавить бизнес» to a booked test visit;
  - every step has one main button, labelled fields and no sideways
    scroll;
  - leaving at step 3 and coming back resumes at step 3.
- By hand: a non-technical person tries it on staging (`docs/test-plan.md`
  § 10).

### M6. One person in two businesses

**Files**
- Modify:
  - `src/app/admin/(app)/staff/`, `src/lib/admin/staff.ts`;
  - `src/lib/availability.ts`, `src/lib/admin/schedule.ts`;
  - `schedule/` (the warning).
- Test: `tests/staff-two-businesses.test.ts`

**What it does**
- The barber's card has «Работает также в», for owners only.
- Adding a business:
  - creates his staff row there (name, photo and bio copied; services
    picked there);
  - creates a `staff` membership with that business's default rights.
- Removing a business ends his membership. His past visits stay.
- Slots exclude the times he is booked in his other businesses.
- The schedule warns «В эти дни он работает в Pärnu» when shifts overlap.
- Invoices stay per business: each business's company invoices him for its
  own part.
- The same «Работает также в» works for a front-desk login. Dim's rule
  still holds: only an owner can give it.

**Tests**
- `his 12:00 visit in Pärnu removes his 12:00 slot in Tallinn`.
- `overlapping shifts warn and still save`.
- `removed from Pärnu, his app opens in Tallinn` (with M1).
- `a barber with one business sees no switch`.

### M7. Businesses stay apart, then the walk-through

**Files**
- Create: `tests/isolation.test.ts`
- Modify: `e2e/crawl.spec.ts`, `tools/seed-demo.mjs`
  - The seed gets a second business, «Demo Pärnu», with fake people whose
    names carry a marker.

**Tests**
- Unit: as A's owner, every list and load function in `src/lib/admin`
  returns no B marker. Every action given one of B's ids refuses.
- Crawl: every page as A, then as B after a switch. The other business's
  marker never appears.
- Then the live walk-through at 1920 and phone width (Claude's memory,
  `final-live-walkthrough`).

### M8. A business's own domain (optional, any time later)

Not in the wizard, to keep the wizard short. It lives in «Настройки →
Онлайн-запись → Свой адрес».

**Files**
- Create:
  - `src/lib/admin/own-domain.ts`;
  - `src/app/admin/(app)/settings/online/own-domain.tsx`.
- Test: `tests/own-domain.test.ts`

**What it does**
1. Renat types the domain, `book.massage-example.ee`.
2. The app adds it to the Vercel project through Vercel's API
   (`VERCEL_TOKEN`, `VERCEL_PROJECT_ID`). For e-mail it adds the domain in
   Resend through Resend's API (`RESEND_API_KEY`).
3. The page shows the DNS records to add, as one block to copy. It says,
   in plain words, «отправьте это тому, кто ведёт ваш домен».
4. «Проверить» asks Vercel and Resend. Each line turns green when it is
   live.
5. Once verified, the host's row turns `verified`, and from then on the
   letters link there. The neutral link keeps working, so printed QR codes
   never break.

**Tests**
- `a pending host serves nothing and links stay on the neutral domain`.
- `a verified host serves only its business`.
- `a host taken by another business is refused`.
- The Vercel and Resend calls are faked in tests, never made for real.

## What depends on round 16

| Card | Changes |
|---|---|
| `when` | Start after the Altegio switch (pick) or before it |
| `address` | M4: a neutral booking domain for every business, with its own domain later (pick); its own domain from the start; or everything under book.rempire.ee |
| `domain-owner` | Who buys the neutral domain and on whose account: Renat (pick, as decision 38) or Dim |
| `staff-app` | M4: REMPIRE's staff keep «REMPIRE Team», the others get a neutral staff app (pick), or one neutral app for all |
| `look` | Whether M3/M4 carry a brand colour |
| `senders` | M3: letters from the business's own name on the neutral domain, and SMS under one neutral sender name until its own is approved (pick); or its own address and SMS name from the start |
| `clients` | Separate per business (pick, no extra work) or shared (more work, privacy text) |
| `shop` | Shop sales on or off per business (`SHOP_SALES` becomes a business setting) |
| `overview` | One view across businesses later (pick) or in this work |

## Outside the code

**Once, before the first business that is not REMPIRE**
- The neutral booking domain:
  - bought once, on the owner's account;
  - its DNS pointed to Vercel;
  - added in Resend as the sending domain;
  - set as `PLATFORM_HOST`.
- One neutral SMS sender name, approved by Messaggio (1–5 working days).
- For M8 only: `VERCEL_TOKEN` and `VERCEL_PROJECT_ID`. Dim puts the values
  into Vercel; they are never written anywhere else.

**Per new business**
- Nothing: its link works on the neutral domain at once.
- Only if wanted:
  - its own domain: someone with access to its DNS adds the records M8
    shows;
  - its own SMS sender name: Messaggio approves it, 1–5 working days;
  - another company on its invoices: that company's details, typed into
    step 2.

## Size

About 7 working days, tests included:
- M1: 1 day.
- M2: half a day.
- M3: 1 day.
- M4: 1.5 days.
- M5: 1.5 days.
- M6: 1 day.
- M7: half a day.
- M8 (optional, later): 1 day.
