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

`{locale}` is `ru`, `et` or `en`. The language button is top right on every
step: Altegio has a client-account icon there, and we have no client
accounts.

## Steps

Each step ends on one «Продолжить» at the bottom, as in Altegio.

1. **Barber.** The salon's mark, name and address (the name opens a sheet
   with the address and the phone). «Любой свободный барбер», then each
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

## What differs from Altegio, on purpose

| Altegio | Ours | Why |
|---|---|---|
| Their texts; «Комментарий к записи» in Russian inside the English page | Our own texts in RU, ET, EN | Dim: our texts |
| A client-account icon | The language button | No client accounts |
| «Powered by Altegio» | Nothing | Never their name |
| A «Service» category chip above the list | No chip | REMPIRE has one category; a chip that does nothing is noise |
| The reminder: 16 choices, from 1 hour to 7 days | The salon's time, or none | That is what the SMS queue does today |
| Privacy policy and user agreement links at the tick | The tick alone | No policy page yet (open) |
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
- **Moving a visit** is still «book the new time, then cancel this one».
  A real move from the client's link is not built.
- **Special time in percent** («+50 %», Renat): today the extra is a sum in
  euros (`special_time.extra_cents`).
- **A privacy policy page** to link at the consent tick.
- **«The main page»** after the goodbye is the booking start. Once booking
  sits on rempire.ee it may be the site's home.
