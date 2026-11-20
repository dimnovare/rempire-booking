# Client flow: Altegio's path, our words

*19.11.2026, built. It replaces design v2 (17.11), which had REMPIRE's own
dark look and a shorter path.*

## Why it changed

Renat, 19.11.2026, after trying the staging booking:

> «По поводу оформления, оставить все так же как в оригинале (цвета,
> последовательность, дизайн).»

In his voice notes he added: all light, «чтобы не давило»; he likes the
colours, the order and how it clicks. Dim's ruling the same day:
**Altegio's visuals, our texts.** The same colours, layout, order of steps
and wording sense, in our own code and icons. Never Altegio's logo, name or
«Powered by».

- **Reference:** the live widget, `b353848.alteg.io/company/337850/…`,
  walked up to the details form (nothing booked) and measured. The numbers
  are in `docs/brand.md`, «Booking look».
- **Drawing Dim approved:** <https://claude.ai/artifact/5F78oNUN8bRrPQzoBcFLyr>
  (a clickable phone prototype).
- **Code:** `src/app/[locale]/booking-flow.tsx`, `src/app/globals.css`.

## Entry points

| From | Link | Lands on |
|---|---|---|
| A barber's «book now» on rempire.ee | `/{locale}?b={staff-slug}` | Step 1, that barber picked (as rempire.ee's links to Altegio do) |
| Any other «book now», the installed app | `/{locale}` | Step 1; the barber of the last booking on this device is picked |
| The link in a confirmation, an SMS or a reminder | `/{locale}/visit/{token}` | The visit page |
| «Перенести» on the visit page | `/{locale}/visit/{token}/move` | Step 3 alone, for that visit |
| A shared or reloaded salon page | `/{locale}/about` | The salon's page, step 1 under it |

`{locale}` is `ru`, `et` or `en`. The language button is top right on every
step: Altegio has a client-account icon there, and we have no client
accounts.

## Steps

Each step ends on one «Продолжить» at the bottom, as in Altegio.

1. **Barber.** The salon's mark, name and address (the name opens the
   salon's page, below). «Любой свободный барбер», then each
   barber with photo, role, stars and review count, and a radio. An «i»
   opens the barber's own words when `staff.bio` has any. «Продолжить»
   waits until one is picked.
2. **Services.** That barber's services with his own time and price, each
   with a tick box; several can be ticked. With «любой» the price is a
   range, and a service nobody does together with the ticked ones is
   greyed. The bar with the count, the time and the price comes with the
   first tick.
3. **Day and time.** A month calendar, Monday first, that stays on top; the
   month's name folds it to one week. Full days are grey: tapping one says
   «На этот день свободного времени нет» and offers the nearest date. Times
   are pills under «Утро / День / Вечер», each foldable. «Продолжить» comes
   once a time is picked.
   - The page opens on the nearest day with a free time, not on a full
     «today»: one dead end less than Altegio.
   - Special time carries its extra on the pill («+20 €») and one line of
     legend under the times.
4. **Details.** The visit with a pencil on the barber, the day and the
   services; «Ваши данные»: name, phone, e-mail, comment, the reminder
   (SMS at the salon's time, or none) and a consent tick; the total;
   «Записаться».
5. **«Вы записаны».** The visit again, then «Добавить в календарь»,
   «Перенести или отменить», «Записаться снова», the reminder as a
   notification (when the salon offers it) and the install offer.
6. **«Скоро увидимся».** After «Добавить в календарь» (Renat, 19.11): a
   goodbye by name, and after a few seconds the start again by itself, so
   nobody wonders what else to press. The start then shows «Ваш визит».

## The salon's page («REMPIRE ▾»)

*20.11.2026, built.* Dim: the small sheet with the address did not match
the widget, where the same tap opens a whole «about» page. Ours now opens
one too, in the widget's order (screenshots of it at 375 px, 20.11):

1. A back arrow on the grey band; scrolled down, a white bar with the
   back arrow, the small mark and the name.
2. The mark over the white panel's edge; the name.
3. «★ 4,9 · 7 отзывов»: the average and the count of the reviews about the
   salon itself; a tap scrolls down to them. Not there when there are none.
4. The address (opens the maps app) and the hours line.
5. «Контакты»: every phone (each a `tel:` link, the main one first, its
   label in grey under it) and the site; Instagram, Facebook, WhatsApp,
   Telegram and Viber by name when set (none is today).
6. «О компании» and the salon's own words.
7. «Фото»: a strip of photos (today the logo on black).
8. «Как нас найти»: the address again, the postcode and the country under
   it, and a map with the pin. The map is our own picture of
   OpenStreetMap's tiles (`src/components/osm-map.tsx`, no key, no map
   library), its tiles loaded only when scrolled near, «© OpenStreetMap» a
   link of its own; the rest of the map is one tap into the phone's maps
   app (Google Maps at the pin). No pin, no map.
9. «Отзывы», «7 отзывов» (or «Отзывов пока нет»), the card «Оцените и
   напишите отзыв» with five empty stars, then the reviews, the newest
   first: initials in a grey circle, the name as signed, the stars, the
   date, the text; six, then «Ещё отзывы» for six more.
10. «Записаться» at the bottom: the booking start (a visit being moved goes
    back to its times).

- **Opening and closing:** it opens over whatever step is on, and the
  address becomes `/{locale}/about` (a pushed entry). The back arrow, the
  phone's back and Escape close it, and the step is as it was, scrolled
  where it was. Opened by its own address, the booking start is under it.
- **Data:** `locations` (migrations 028 and 034): `schedule` and `about`
  per language, `website`, `photos`, `lat`/`lng`, `phones` (the main one
  also in `phone`), `country`, `postcode`, the socials and messengers.
  REMPIRE's public values are filled in by the migrations and by the demo
  seed. The reviews are `reviews` with no barber and not hidden
  (`src/lib/reviews.ts`, `salonReviews`; `/api/salon/reviews`): the name
  as signed, no client and no phone.
- **Writing a review** (decision page round 11): a tap on a star of the
  card opens the sheet (`src/app/[locale]/salon-review.tsx`): the stars and
  their word, «О ком отзыв» (the salon or a barber), «Имя», «Отзыв»,
  «Отправить» and «Отзыв появится после проверки салоном»; sent, «Спасибо
  за отзыв!». POST `/api/salon/reviews` keeps it waiting (pending and
  hidden, migration 035) until the owner presses «Одобрить» in «Отзывы»,
  where the new ones come first with «Новый». No captcha, no phone, no
  e-mail: a field no person sees, a few seconds' minimum, no links, three
  an hour and five a day from one address (kept only as a day's hash,
  cleared after two days) and fifty a day for the whole site.
- **The admin:** «Настройки → Контакты» (the address found on the map with
  «Найти», the pin dragged, several phones), «Бренд» and «Галерея».

## Moving and cancelling (the visit's own link)

REMPIRE's Altegio is set to «Разрешить клиентам переносить записи онлайн»
and «… отменять записи онлайн», both «Без ограничений» (read in its
settings, 19.11). Ours does the same from `/{locale}/visit/{token}`:

- **«Перенести»** opens `/{locale}/visit/{token}/move`: the day and time
  step alone. The barber and the services stay as booked; the visit's own
  time does not stand in its way; the time it has now is greyed. «Перенести
  сюда» moves the visit itself (the same record, the same link), and its
  page then says «Визит перенесён».
  - Only a time the booking page would offer is taken, at the price shown
    (special time is priced again for the new time).
  - The barber hears of it by push; the client gets the «moved» letter if
    the booking had an e-mail.
  - Code: `src/lib/client-move.ts`, `/api/visit/{token}/slots` and
    `/api/visit/{token}/move`.
- **«Отменить визит»**: two taps, at any time before the visit.
- A salon that sets `cancel_cutoff_min` above 0 closes both inside that
  time, and the page says to call.

## What differs from Altegio, on purpose

| Altegio | Ours | Why |
|---|---|---|
| Their texts; «Комментарий к записи» in Russian inside the English page | Our own texts in RU, ET, EN | Dim: our texts |
| A client-account icon | The language button | No client accounts |
| «Powered by Altegio» | Nothing | Never their name |
| A «Service» category chip above the list | No chip | REMPIRE has one category; a chip that does nothing is noise |
| The reminder: 16 choices, from 1 hour to 7 days | The salon's time, or none | That is what the SMS queue does today |
| Privacy policy and user agreement links at the tick | The tick alone | No policy page yet (open) |
| The salon's page: an Apple map you can pan; a review form | An OpenStreetMap picture, one tap to the maps app; no form | No map keys; no review form of ours yet |
| Change or cancel until the salon's cutoff | At any time before the visit | Renat, 19.11: no «позвоните в салон». `cancel_cutoff_min` is 0 |

## Kept from before

- **«Ваш визит»** on step 1: the visit this device booked, until it is over
  or cancelled, with the way to change it.
- **A returning client:** name, phone and e-mail are filled in; the barber
  of last time is picked.
- **A time taken meanwhile:** the details show the nearest free times, and
  what was typed stays.
- **Desktop:** the same 600 px column, centred, as Altegio's.

## Open

- **The «booked» screen** is ours in the same look: Altegio's cannot be seen
  without booking. A screenshot from Renat makes it exact.
- **A privacy policy page** to link at the consent tick. Checked 19.11:
  rempire.ee has none; Altegio's widget links Altegio's own policy
  (`alteg.io/en/info/privacy`); the shop has one
  (`rempireshop.com/…/policies/privacy-policy`), but it speaks of the shop
  and its orders only. Booking needs its own short text.
- **«The main page»** after the goodbye is the booking start. Once booking
  sits on rempire.ee it may be the site's home.
