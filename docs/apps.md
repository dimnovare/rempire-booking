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

## The staff app, as built (18.11)

One app with two sides: «Мой день», the barber app at `/b`, and «Салон»,
the admin at `/admin`.

- **One start, `/b/start`** (`src/app/b/start/route.ts`,
  `src/lib/auth/side.ts`). The installed app opens there, and so does a login
  that asked for no page.
  - A barber lands on his day.
  - Renat and the front desk land on the side the device had open last
    (the `rb_side` cookie, kept by `src/proxy.ts`).
  - The first time: his own day if the login is linked to a barber, else
    the salon.
- **The side switch** (`src/components/side-switch.tsx`), for an owner or
  admin only; a barber never sees it.
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
  first. What he changes there applies at once, as before.
- **One install.** The manifest (`/b/manifest.webmanifest`) is linked from
  both sides: `start_url` `/b/start`, scope `/`, id `/b` as before.
- **Tests:** `tests/auth.test.ts`, `tests/barber-shell.test.ts`,
  `e2e/sides.spec.ts` (phone, tablet and PC widths, with screenshots). The
  demo login `boss@example.test` is an owner linked to the barber Renat.

Not checked on a real phone yet: the installed app's start, and the switch
inside an installed app.

## The client app, as built (18.11)

The booking site itself, installable. No separate pages.

- **Its own manifest**, `/<locale>/manifest.webmanifest`, linked from every
  client page: one app in three languages (id `/`), named «REMPIRE», opening
  on the booking page of the language it was added in.
- **Its own icon:** the tower, white on black (`/icons/…`,
  `src/app/[locale]/apple-icon.tsx`). The staff app is the other way round,
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
  - No client account: the visit's own link says whose phone it is
    (`POST` and `DELETE /api/visit/<token>/push`). The phone then belongs to
    that client, for every later visit too
    (`client_push_subscriptions`, migration 012).
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
