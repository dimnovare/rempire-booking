# The apps: one for staff, one for clients

*Decided with Dim in chat, 18.11.2026. All four steps were built the same
day. Open: the two apps need two addresses (below), found on Dim's Android
phone that evening.*

## Decisions (Dim, 18.11.2026)

| Topic | Decision |
|---|---|
| How many apps | **Two.** One staff app and the client booking site, which can also be installed. Not three |
| Staff | **One app; the login's role decides what opens.** A barber: his day. The front desk: the salon calendar. An owner linked to a barber: his own day |
| Renat | **Owner and barber at once.** The combination must stay simple on a phone, a tablet and a PC |
| Clients | They come through rempire.ee, as today or better. The booking site is also **installable**: open the app and book at once |
| Client notifications | **Considered now.** Whether a client gets an SMS, a notification or both is decided later, so it is one setting |
| QR page for the shop | **Not built yet.** Asked on Renat's Q&A page (question 9), with the per-barber code as one of the answers |
| Addresses | **Open**, decided at the move (below) |

## One app for Renat (Dim, 19.11.2026: variant A; replaces the side switch below)

Dim did not like where the «Мой день | Салон» switch sits or how it works for
an owner who also cuts: a strip on every phone screen, and two apps with two
bottom bars behind it. Three variants were drawn on the design canvas (boards
`SideA`, `SideA2`, `SideADesk`, `SideB`, `SideC`); he chose A.

- **«Мой день» is a tab, not a mode.** No switch anywhere.
- **Phone bar, owner or front desk linked to a barber:** Мой день · Журнал ·
  Клиенты · Запросы · Ещё. «Мой день» is his own day (the barber app's day
  and week) inside the same frame.
- **«Ещё» is grouped:** «Моё, как барбера» (Моё время, Продать товар, Мои
  расчёты), «Салон» (Барберы, Услуги, График работы, Счета, Каталог товаров,
  Записи), «Аккаунт» (Доступ и права, Язык, Выйти). «Доступ» and «Выйти» leave
  the top bar.
- **Wide screen:** the journal bar has «Мой день | Весь салон». «Мой день»
  shows his column only, with a panel beside it: who is in the chair, who is
  next, today's count and sum, and links to his time, his sums, his clients.
- **An owner or front desk not linked to a barber** has no «Мой день»; the bar
  stays Журнал · Клиенты · Запросы · Счета · Ещё. A barber's own app is opened
  from «Барберы» → the barber, for support.
- **A barber** keeps his bar (День · Неделя · Моё время · Продать · Ещё).
- The dot for waiting requests sits on «Запросы».

### As built (20.11.2026)

**Who gets what** is the login's kind (`appKind`, `src/lib/auth/side.ts`): a
barber; an owner or front desk linked to a barber («own»); one that is not
(«salon»). The tabs and the rows of «Ещё» for a login are one list each
(`barOf`, `moreOf`, `src/lib/admin/app-nav.ts`), cut by its rights.

- **The switch is gone:** its component, its row under a phone's top bar, its
  row in the sidebar, its styles and `/b/mine`. The mini month starts right
  under the sidebar's head.
- **Two root layouts stay, the frame's pieces are shared.** The salon's pages
  are `/admin`, the barber pages `/b`, each with its own root layout, copy and
  language provider; `/b` also has the service worker.
  - Shared: the bottom bar (`src/components/app-bar.tsx`) and the top bar's
    look (`.one-top`, `admin.css`). `src/app/b/(app)/layout.tsx` draws the
    one app's frame for an owner or front desk and the barber's own for a
    barber (`src/app/b/frame-server.ts`).
  - The price: a tap between a tab of one half and a tab of the other loads a
    whole page, as the switch did. Merging the two layouts would end that; it
    was not done here, because it moves every staff page under one root and
    the e2e suite counts on a fresh page between the halves.
- **Phone, linked to a barber:** Мой день · Журнал · Клиенты · Запросы · Ещё
  on every screen of both halves. The top bar is the mark and the name, 56px.
  - «Мой день» is `/b` and `/b/week`: the barber's day with the board's head
    («Мой день», the day with its count and sum, «День | Неделя», «+ Запись»)
    and a visit as a card in the journal's colours. The week strip, «Дальше»
    with «Позвонить» and «Пришёл», free time and the visit's sheet are the
    barber's day as it was.
  - «Запросы» has a red dot while requests wait.
- **«Ещё»** (`/admin/more`): who is signed in (the linked barber's photo or
  the initial, the name, «Владелец и барбер»), then three groups.
  - «Моё, как барбера»: Моё время, Продать товар, Мои расчёты. The barber
    pages `/b/time`, `/b/sell`, `/b/money`, in the same frame, «Ещё» lit.
  - «Салон»: Барберы, График работы, Услуги, Каталог товаров, Записи, Счета
    (for a linked login only: otherwise it is a tab) and «Продажа товара».
    The order is the sections' own, not the board's.
  - «Аккаунт»: Доступ и права, Уведомления, Язык, Выйти. «Уведомления» is not
    on the board: it opens this device's notifications and the install guide
    (`/b/more`), which had no other way in once the switch went. «Язык» opens
    the three languages in a sheet. «Выйти» also turns this device's push off.
- **Phone, not linked:** Журнал · Клиенты · Запросы · Счета · Ещё; «Ещё» has
  «Салон» and «Аккаунт».
- **A barber's own app, for support:** «Барберы» → the barber → «Открыть его
  приложение» (not on the login's own barber). It opens his day in the
  barber's frame with one line under the top bar, «Вы смотрите приложение
  <имя> · Назад в салон», which leads back to his page.
  - Any salon page ends the look (`src/proxy.ts` drops `rb_view_as`), and so
    does the app's start. What is changed there applies at once, as before.
  - `/b/pick`, the old list of barbers, is left only as the page `/b` falls
    back to for a login with no barber. Nothing links to it.
- **A barber:** nothing changed.
- **Wide screen (from 900px), linked to a barber:** the journal's bar has
  «Мой день | Весь салон» before «Продать».
  - «Мой день»: his column alone (also on a day off, so he can still book
    himself), a 64px head with his hours, and the panel «Моё»: who is in the
    chair and until when, who is next, today's count and sum (the sum only
    with «Показывать статистику»). The panel is about today whatever day is
    shown. «Неделя» is his own week. The day's numbers and the clients' panel
    are back with «Весь салон»; the status filter and the scale stay.
  - Its links: «Моё время» is his page under «Барберы», «Мои расчёты» his
    month under «Счета», «Мои клиенты» the client base on the clients who
    came to him (`/admin/clients?barber=<id>`; a barber's id is no client's
    data, and what is typed in the search is still never in the address).
  - The choice is kept for the browser tab; a new tab opens the way the
    device left it (the `rb_mine` cookie, so the server draws it right the
    first time), «Мой день» the first time.
  - His phone-wide pages are not used there: `/b`, `/b/week` and `/b/sell`
    send a wide screen to the journal, `/b/time` and `/b/money` to his pages
    in the salon (`src/app/b/(app)/wide-own.tsx`). `/b/more` stays, and
    «Доступ» has a link to it.
  - A login not linked to a barber never sees the control.
- **Where the app opens** (`/b/start`, `startPath`): a barber on his day; a
  linked login on what the device had open last of the two halves (`rb_side`,
  as before), «Мой день» the first time; a login not linked in the journal.
  The server does not know the width: when it sends a linked login to `/b`
  on a wide screen, `/b` itself sends it on to the journal with «Мой день»
  chosen.
- **Words** in RU, ET and EN, per login. The journal's tab reads «Журнал» in
  Russian now («Календарь» before).
- **Tests:** `tests/app-nav.test.ts`, `tests/barber-shell.test.ts`,
  `e2e/sides.spec.ts` (both phones, a tablet upright, 1440px; the pictures
  are `e2e/.out/screens/*-a-*.png`).

Not checked on a real phone or in an installed app. Differs from the boards:
no bell in the phone's top bar (from 900px the sidebar's head has one,
24.11, `docs/reference-looks.md`); the tower mark, not a letter;
«Мой день» keeps the barber day's week strip, «Дальше» and free time; the
order of «Салон» and the extra rows in «Ещё»; the journal's bar keeps the
filter and the scale in «Мой день».

## The staff app, as built (18.11): its side switch is replaced (20.11)

*The switch, `/b/mine` and the «Барбер» half of it are gone: see «One app for
Renat» above. What is said below about a login linked to a barber, the
manifest and `/b/start` still holds, with the new start rule.*

One app with two sides: «Мой день», the barber app at `/b`, and «Салон»,
the admin at `/admin`.

- **One start, `/b/start`** (`src/app/b/start/route.ts`,
  `src/lib/auth/side.ts`). The installed app opens there, and so does a login
  that asked for no page.
  - A barber lands on his day.
  - Renat and the front desk land on the side the device had open last
    (the `rb_side` cookie, kept by `src/proxy.ts`).
  - The first time: his own day if the login is linked to a barber, else
    the salon. *Since 20.11 a login not linked always lands in the journal.*
- **The side switch** (`src/components/side-switch.tsx`), for an owner or
  admin only; a barber never sees it. *Removed 20.11.*
  - It reads «Мой день | Салон» for a login linked to a barber, and
    «Барбер | Салон» for one that is not.
  - A phone and a tablet upright: a row under the top bar. From 900px:
    beside the logo. The same place on both sides.
  - A dot on «Салон» when requests wait for an answer.
  - «Мой день» (`/b/mine`) always opens his own day, also after he looked
    at another barber's app.
- **A login linked to a barber** (`users.staff_id`, any role).
  - «Доступ» → «Добавить вход»: «Он же барбер» for an owner or admin.
  - «Доступ» → «Входы»: the same choice on every owner or admin login, his
    own too; it saves by itself (`setUserStaff`).
  - A barber's own login keeps its barber: switch it off and add a new one.
  - Pushes for a barber's column already go to every login linked to it
    (`queuePush`), so Renat gets his own column's too.
- **In the barber app** an owner or admin sees his own column by default.
  The name in the top bar opens the list of barbers (`/b/pick`), himself
  first. What he changes there applies at once, as before. *Since 20.11 a
  barber's app is opened from «Барберы», and the name is no link.*
- **One install.** The manifest (`/b/manifest.webmanifest`) is linked from
  both sides: `start_url` `/b/start`, scope `/`, id `/b` as before.
- **Tests:** `tests/auth.test.ts`, `tests/barber-shell.test.ts`,
  `e2e/sides.spec.ts` (phone, tablet and PC widths, with screenshots). The
  demo login `boss@example.test` is an owner linked to the barber Renat.

Not checked on a real phone yet: the installed app's start.

## The client app, as built (18.11)

The booking site itself, installable. No separate pages.

- **Its own manifest**, `/<locale>/manifest.webmanifest`, linked from every
  client page: one app in three languages (id `/`), named «REMPIRE», opening
  on the booking page of the language it was added in.
- **Its own icon:** the tower, white on black (`/icons/…`,
  `src/app/[locale]/apple-icon.tsx`); the pages themselves are light since
  19.11 (`docs/client-flow.md`). The staff app is the other way round,
  dark on white, and is named «REMPIRE Team», so one phone tells them apart.
- **«Ваш визит» on top of the booking page** (`.next` in
  `booking-flow.tsx`): the visit this device booked, with the day, the time,
  the barber and the services, and the link to move or cancel it.
  - The device remembers it; `GET /api/visit/<token>` says how it stands
    now, so a visit cancelled or moved elsewhere is not shown stale. The
    answer holds no name and no phone.
  - Under it, as before: «Как в прошлый раз» in the bottom bar.
- **The install offer** (`install-offer.tsx`): on the confirmation screen
  only, after a booking, on a phone, never inside the installed app.
  - Android: Chrome's own prompt behind «Добавить на экран», when Chrome
    offers it; else one line about the browser's menu.
  - iPhone: the two Share steps.
  - «Не сейчас» hides it on that device for good.
- **Tests:** `tests/client-app.test.ts`, `e2e/app.spec.ts` (both phones:
  book, the offer, the visit on top, cancel, gone).

Not checked on a real phone yet: the install itself, on an iPhone and on
Android.

## Client notifications, as built (18.11)

The reminder before a visit as a notification on the client's own phone.

- **Renat's switch**, «Запросы» → «Напоминание клиенту перед визитом»
  (`settings.client_reminder`):
  - **SMS:** every client gets the SMS; clients are not offered the
    notification.
  - **Уведомление:** a client who turned it on gets the notification and no
    SMS; everyone else gets the SMS.
  - **Оба** (the default until Dim and Renat choose): everyone gets the
    SMS; a client who turned the notification on gets that as well.
- **The client turns it on** with «Напомнить уведомлением» on the
  confirmation screen and on the visit page (`remind-me.tsx`), and off
  again on the visit page.
  - No client account: the visit's own link turns the phone on
    (`POST` and `DELETE /api/visit/<token>/push`), for a visit still ahead.
  - **A phone is tied to that one visit, never to the client**
    (`client_push_subscriptions`, migrations 012 and 013; security review,
    18.11). The reminder carries the visit's change link, and anyone can
    book with someone else's phone number, so one visit's link must not
    reach that person's other visits.
  - A regular client still taps once: a phone that is on already is added
    to each new booking by the confirmation screen itself.
  - On «Уведомление», whoever holds a visit's link can move its reminder
    from SMS to a notification on his own phone. That is the visit he could
    already change or cancel.
  - An iPhone gets notifications only in the installed app; in Safari one
    line says to add REMPIRE to the home screen first.
  - Shown only when the server has the push keys and the switch is not on
    «SMS».
- **Sending** (`src/lib/outbox.ts`, `src/lib/client-push.ts`): an outbox row
  per visit, kind `client_reminder`, a minute before the SMS's time.
  - On «Уведомление» the SMS of a visit whose notification went out is
    skipped. If the phone is gone or the push fails, the SMS still goes.
  - A visit booked without the SMS reminder is still reminded by the
    notification.
  - A tap opens the client's own change link (`/v/…`).
- **The worker** is `public/sw.js`: push only, started when a client turns
  the reminder on. The keys are the staff app's (`VAPID_*`).
- **Tests:** `tests/client-push.test.ts`; `e2e/app.spec.ts` (the switch;
  the block itself only with `E2E_VAPID=yes`, which gives the test server a
  throwaway key pair).

Not checked: a real notification on a real phone. No test subscribes a
phone, because that needs a real push service.

## The rest, today (checked 18.11)

- The booking page has no staff link, and the admin has no link to the
  booking page.
- The client flow already remembers, on the device: name, phone and e-mail,
  the last barber and services («как в прошлый раз») and the link to the
  upcoming visit (`src/app/[locale]/booking-flow.tsx`).
- **Barber test login on staging:** `rempireshopinfo+barber@gmail.com`, role
  «Барбер», linked to Valentin, no password (the e-mail code). Added 18.11
  on Dim's request.

## What we build, in this order

1. **Staff: one app, by role.** *Built 18.11, above.*
2. **Renat's combination.** *Built 18.11, above.* Dim tries it on staging,
   on his own phone and PC; then we adjust.
3. **Client app.** *Built 18.11, above.*
4. **Client notifications.** *Built 18.11, above.*

**Not now:** the QR page (Renat's answer first), the final addresses.

## Addresses (open)

Dim's candidates, 18.11:

- **Clients:** `broneeri.rempire.ee`, or `rempire.ee/en/barbershop/booking`.
- **Staff:** a separate address; Dim's first idea is `rempire.ee/admin`.

What each costs:

- **Subdomains** (one for clients, one for staff): one DNS line each. No
  route changes.
- **Paths on rempire.ee:** our app sits behind the existing site.
  - It needs a routing rule in rempire.ee's Cloudflare, whose login is still
    pending.
  - The staff app is one installable app only if all its pages share one
    prefix, so the barber pages (`/b` today) move under `/admin`.
  - A client app under `/en/barbershop/booking` is tied to one language.
- **The rule either way:** the two apps never claim overlapping addresses.
  Android may not offer the second install, and links can open in the wrong
  app.
- **On staging** both apps share one address for now. That is fine on an
  iPhone. **On Android it is not** (Dim's phone, 18.11): with the client app
  installed, Chrome says the staff app is installed already, and the other
  way round. Until the staff app has its own address, an Android phone holds
  one of the two.
- **Next:** a second staging address for the staff app, so the two apps can
  be tested side by side. It needs a DNS line and a domain in Vercel (Dim's
  OK), the address added to the Google login, and the proxy sending each
  address its own pages.
