# The apps: one for staff, one for clients

*Decided with Dim in chat, 18.11.2026. Nothing here is built yet, except
where it says «today».*

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

## Today (checked 18.11)

- Only the barber area has an app manifest: `/b`, scope `/b`
  (`src/app/b/manifest.webmanifest/route.ts`). The client pages and `/admin`
  have none.
- Links between the areas: the barber app's «Ещё» links to `/admin` for an
  owner or admin. Nothing links from the admin to `/b` or to the booking
  page, and the booking page has no staff link.
- An owner or admin opens `/b` through `/b/pick` and sees a barber's app
  («Смотрю: …»). His changes apply at once, so the barber's side of
  «Запросы» shows only with a real barber login.
- A login keeps its barber (`users.staff_id`) only for the role «Барбер»
  (`createUser` in `src/lib/auth/login.ts`). «Доступ» adds logins and
  switches them off; it cannot change a role or a link.
- The client flow already remembers, on the device: name, phone and e-mail,
  the last barber and services («как в прошлый раз») and the link to the
  upcoming visit (`src/app/[locale]/booking-flow.tsx`).
- **Barber test login on staging:** `rempireshopinfo+barber@gmail.com`, role
  «Барбер», linked to Valentin, no password (the e-mail code). Added 18.11
  on Dim's request.

## What we build, in this order

1. **Staff: one app, by role.**
   - One start after the login: a barber lands on his day, the front desk on
     the salon calendar, an owner linked to a barber on his own day.
   - «Доступ»: link an owner or admin login to a barber, also for a login
     that already exists.
   - One icon and one install for the whole staff app.
2. **Renat's combination.**
   - One switch in the top bar, «Мой день | Салон», the same on a phone, a
     tablet and a PC.
   - Each side keeps its own short menu; the two menus never show together.
   - The app remembers the last side per device. A dot on «Салон» when
     requests wait.
   - Built straight on staging; Dim tries it on his own phone and PC.
3. **Client app.**
   - An icon and an app name.
   - It opens on the upcoming visit, or on «как в прошлый раз».
   - The install offer comes on the confirmation screen, after a booking,
     never before.
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
