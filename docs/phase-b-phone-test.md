# Phase B: the real-phone test

*For Dim, 17.11.2026. About 30 minutes: one barber, one iPhone (iOS 16.4 or
later) and one Android phone. Staging only:
`https://rempire-booking.diipsolutions.eu/b`. Use the demo clients; type no
real client's name or phone into staging.*

Only what a real phone can show is left here. The rest runs without a phone
and passed on 17.11:

- `npm test`: who gets which push, its words (never a phone number), the
  outbox, the 20:00 plan.
- `npm run e2e` (Playwright, an Android and an iPhone screen, fake data on
  an in-memory database): every screen and sheet of `/b` at 320 and 360 px;
  his day, the week, booking, moving and cancelling; «Моё время» with
  Renat's «Запросы» (approve with an answer, decline, withdraw); the client
  card, notes, «Записать снова»; «Ещё», the language, logging out; Renat
  looking at a barber's day; the service worker showing a push and opening
  its day on a tap.
- `E2E_PROD=yes npm run e2e` after `npm run build`: the same in the
  production build on Android, plus the day opened offline.

## Before

- [x] VAPID keys in Vercel (17.11). Never change them: that cuts off every
      phone.
- [ ] A login for the barber in the admin's «Доступ» (role barber, his
      column), and Renat's owner login on his own phone.

## 1. Install (5 min)

- [ ] iPhone, Safari: open `/b`, log in with the e-mail code (the letter
      comes within a minute), Share → «На экран „Домой“», open it from the
      tower icon. It opens full screen; nothing sits under the notch or the
      home bar.
- [ ] Android, Chrome: open `/b`, log in, install from the banner or the
      menu, open it from the icon.
- [ ] iPhone, only if the login page offers Google: it comes back into the
      installed app. If it stays in Safari, write it down.

## 2. Push (10 min)

- [ ] In the installed app: «Ещё» → «Включить уведомления» → the phone asks
      → allow. Renat does the same on his phone.
- [ ] In the admin, book a visit in the barber's column: his phone shows
      «Новая запись» within a minute, with the app closed and the screen
      locked. Move it: the line is replaced, not doubled. Cancel it from the
      barber's phone with a reason: Renat's phone shows it with the reason.
- [ ] Lock screen: the client's name and the time, never the phone number.
      Android: the small status-bar icon is the tower, not a grey square.
- [ ] A tap on the push, with the app closed: it opens on that visit's day.

## 3. In his hand (10 min)

- [ ] «Позвонить» opens the phone's dialler with the number.
- [ ] Pull down on his day to refresh. Scroll the day and the week; open and
      close a few sheets. Nothing jumps or sticks.
- [ ] A sheet with a text field (a note, a cancel reason): the keyboard does
      not hide the field or the button.
- [ ] Airplane mode, then open the app from the icon: his day as last
      loaded, with «Нет интернета», the logo and the photos. Back online:
      the day comes back fresh.

## 4. In the evening (no work)

- [ ] 20:00: the barber gets tomorrow's plan, Renat the salon's.

## Send back

The phone model and its iOS or Android version, what did not work, and a
screenshot of it.
