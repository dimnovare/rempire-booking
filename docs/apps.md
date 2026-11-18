# The apps: one for staff, one for clients

*Decided with Dim in chat, 18.11.2026. Steps 1 to 3 (the staff app and the
client app) were built the same day; step 4 (client notifications) is not
built yet.*

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
4. **Client notifications.**
   - The client opts in after booking.
   - One setting: SMS, notification or both. The default is decided later.
   - On an iPhone a notification works only once the app is installed; on
     Android also from the browser.

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
  iPhone; on Android, both apps installed on one phone may behave oddly.
