# Phase B: the barber app, the build plan

*17.11.2026. Scope is kickoff §10 B. Phase A's parts that need no
outside account are done (`docs/phase-a.md`). A7 waits on the Altegio login,
and A6's SMS and A8 wait on the SMS provider, so Phase B can start now.
Dim's answers to the open choices are on the Phase B decisions page (see
`booking-decisions-page` in Claude's memory). Until he answers, the
recommended option there is the plan.*

**Done when** one real barber works a whole day in it on his own phone:
he sees his day, gets a push for a new booking, blocks an hour and asks for
a day off. Renat sees all of it in the admin.

## What it is

- **A PWA**, not a native app (kickoff decision 3). It is the same Next app
  at **`/b`** on the booking host: one deploy, one database, one login.
  Installed from the browser to the home screen, it opens full screen with
  the tower icon.
- **For barbers**, the `staff` role with a `staff_id`. Renat already
  creates these logins under «Доступ». An owner or admin who opens `/b`
  picks a barber, so Renat can see what a barber sees.
- **Russian first.** Each login has its own `users.locale`. Whether ET/EN
  come too follows Dim's answer on the admin's languages (asked by the admin
  redesign session, about 270 strings): the barber app uses the same text
  tables, so the two are decided together.
- **Phone first**, in the admin's look (`admin.css`, black and lime, square
  edges).

## Dim's answers (17.11.2026, decisions page round 5)

| Question | Answer |
|---|---|
| Start now | **Yes**, while A7 and A8 wait on outside accounts |
| Client phone | **Shown, tap to call**, for his own visits only |
| Money | **Prices and his day's total** |
| Other barbers | **Only his own column** |
| Client notes | **One shared note** per client; all barbers and Renat see it |
| Barber books visits | **Yes**, in his own column |
| What he changes without Renat | **Ask Renat** (his question 2 on the questions page). Until he answers: time applies at once and prices wait for Renat's OK, as a switch |
| Barber notifications | **Push now**; Telegram only if Renat wants it (his question 3) |
| Day's plan | **20:00 the evening before** |
| Renat's notifications | **Ask Renat** (question 4 «Уведомления тебе», added 17.11). Each kind is a **toggle in Renat's settings** (Dim's idea); his answer sets the defaults. Until then: requests and barber cancels on |

## Milestones

| # | What | Needs from outside | Status |
|---|---|---|---|
| B1 | **Shell and login:** `/b` behind the staff login; the web app manifest (`start_url` and `scope` `/b`, `display: standalone`, tower icons 192, 512 and maskable, from the favicon set); a service worker (app shell, push); a one-screen install guide for iPhone (Share → «На экран „Домой“») and Android; a 90-day session per device. Check on a real iPhone that Google login comes back into the installed app (`docs/data-model.md`); if it does not, the app offers the password and the e-mail code first. | a barber's phone for the test | built; real-phone test open |
| B2 | **My day and my week:** today as a timeline of visits (time, client, services, price, the client's note), the next visit on top, free gaps shown; a week strip; arrived / done / no-show; pull to refresh. Only his own column, unless Dim decides otherwise. | | built |
| B3 | **Book and change:** a walk-in or the client's next visit, in his own column, with the same rules as the admin (no double booking, special-time price); move; **emergency cancel** with a reason. The client gets the «moved» or «cancelled» letter A6 already sends, and later the SMS. Renat gets a push. Built as: «+» or a tap on free time; the free times for the chosen services, or «Другое время» (outside his hours or over a break after a second «yes», as in the admin); his own clients only in the search; «Записать снова» four weeks on; move within his column; cancel only with a reason (Renat's push carries it, phone digits taken out). | | built |
| B4 | **His time:** block an hour; ask for a vacation or sick day; add special time with its own extra; his weekly hours. Whatever needs Renat's OK (Renat Q2) goes to a new **«Запросы»** list in the admin as `time_off.status = requested`. Renat taps approve or decline, and the barber gets a push. Until Renat answers, the starting setting is Dim's pick on the decisions page (recommended: time applies at once, prices wait for Renat). | Renat Q2 | |
| B5 | **Push:** new VAPID keys, never the shop's; `push_subscriptions` copied from the shop's `200_push_subscriptions.sql`; `channel = 'push'` in the outbox, so the cron and the retries are shared. Events: a new, moved or cancelled booking; the day's plan (recommended: 20:00 the evening before); a request answered. Renat gets his own, each kind a toggle in his settings (online booking, client's move or cancel, barber's cancel, request, the salon's plan for tomorrow); defaults from his answer to question 4. iPhone needs iOS 16.4 or later and the app installed to the home screen; the app says so where push can't work. Renat's switches live in «Ещё» of the `/b` app (he installs it too); with a column of his own (`users.staff_id`) he also gets his column's pushes. | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in Vercel | built; off until the keys are in Vercel |
| B6 | **Clients:** the client's card from a visit, with the shared note (`clients.staff_note`), the visit's own note, past visits with this barber, «book again», and a tap to call if allowed. | | |
| B7 | **Telegram** (only if Renat wants it, Q3): a new bot of REMPIRE's own, never `@rempireshop_bot`; each barber links his chat once from the app; the same events as push. | Renat Q3; a bot token from Renat | waits |

B1 comes first. B2 and B5 can then run side by side, and B3, B4 and B6
build on B2.

## Data

Migrations start at **008**: the admin redesign uses 007
(`007_staff_photo.sql`). Mostly Phase A's tables. New:

- `push_subscriptions` (`user_id`, `endpoint` unique, `keys jsonb`,
  `last_ok_at`), as in the shop.
- `notifications.channel = 'push'` already exists in the outbox's check;
  push rows carry a `user_id` (a migration adds it) instead of an
  appointment's client.
- `time_off.status` is already there (`requested` / `approved` /
  `declined`).
- Later, for Telegram: `users.telegram_chat_id`.

Every change a barber makes writes an `audit` row, as the admin's do.

## Rules

- **A barber sees and changes only his own visits and time**, enforced in
  the server actions and not just hidden in the screens
  (`requireStaff()` next to `requireAdmin()`).
- **Client data:** a barber sees what he needs for his visits. The phone
  number is a decision on the page. Nothing from other barbers' clients.
- **Push text never carries the client's phone.** Lock screens are public.
- **The VAPID keys are a pair.** Generate them once
  (`npx web-push generate-vapid-keys`; Dim runs it and puts the values in
  Vercel). Changing them cuts off every subscribed phone.
- **No push without keys:** the «Включить уведомления» button is never
  green when the keys are missing, as in the shop's `src/lib/push.ts`.

## Waiting on

| What | For |
|---|---|
| Dim's answers on the Phase B decisions page | B2–B6 details |
| VAPID keys in Vercel (Dim) | B5 |
| Renat Q2: what a barber changes himself | B4 approvals |
| Renat Q3: Telegram or push | B7 |
| One barber with an iPhone and one with Android, for an hour | B1 and B5 tests |
