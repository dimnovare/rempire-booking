# Phase B: the real-phone test

*For Dim, 17.11.2026. About an hour: one barber, one iPhone (iOS 16.4 or
later) and one Android phone. Staging only:
`https://rempire-booking.diipsolutions.eu/b`. Use the demo clients; type no
real client's name or phone into staging.*

## Before

- [ ] VAPID keys in Vercel: run `npx web-push generate-vapid-keys` once and
      put `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`
      (`mailto:` + your address) into the booking project. Redeploy. Never
      the shop's keys, and never change them later: that cuts off every
      phone.
- [ ] A login for the barber in the admin's «Доступ» (role barber, his
      column), and Renat's owner login on his own phone.

## 1. Install (10 min)

- [ ] iPhone, Safari: open `/b`, log in with the e-mail code, Share →
      «На экран „Домой“», open it from the tower icon. It opens full screen.
- [ ] Android, Chrome: open `/b`, log in, install from the banner or the
      menu, open it from the icon.
- [ ] iPhone, if the login page offers Google (only once Google login is
      set up): it comes back into the installed app (B1's open point). If
      it stays in Safari, write it down.

## 2. Push (10 min)

- [ ] «Ещё» → «Включить уведомления» is green → allow. Renat does the same.
- [ ] In the admin, book a visit in the barber's column: his phone shows
      «Новая запись» within a minute. Move it, then cancel it: a push each.
- [ ] Lock screen: the client's name and the time, never the phone number.

## 3. His day (10 min)

- [ ] Today's visits in order, the next one on top with «Позвонить».
- [ ] «Пришёл», «Готово», «Не пришёл»; the week strip; pull down to refresh.

## 4. Booking from the phone (10 min)

- [ ] «+» books a walk-in now; a tap on free time books into that gap.
- [ ] Move a visit. Cancel one: it needs a reason, and Renat's push carries
      it.

## 5. His time (15 min)

- [ ] «Моё время» → «Перерыв» for an hour today: the admin calendar shows
      it at once.
- [ ] «Отпуск» next week: Renat gets «…: изменение».
- [ ] Renat sets «Перерывы, выходные, особое время, часы» to «С моего ОК»
      in the admin's «Запросы». The barber asks for a day off: Renat gets
      «Запрос: …», approves it with a short answer, the barber gets
      «Запрос согласован» with that answer.
- [ ] A new price for one service waits for Renat (the default). Renat
      declines it: the price stays.
- [ ] Set the switch back to «Сразу» unless Renat has answered question 2.

## 6. A client (5 min)

- [ ] Open a visit → «Карточка клиента»: past visits, «Позвонить»,
      «Записать снова».
- [ ] Write a note about the client: Renat sees it on that visit in the
      admin.

## 7. In the evening (no work)

- [ ] 20:00: the barber gets tomorrow's plan, Renat the salon's.

## Send back

The phone model and its iOS or Android version, what did not work, and a
screenshot of it.
