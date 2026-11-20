-- 022_client_messages.sql: the client messages the tool we follow sends
-- and we did not (Dim, 20.11.2026: «All three now, as Altegio does»;
-- docs/altegio-pages.md, «Уведомления, per type»). src/lib/outbox.ts
-- plans and sends them; the business switches each one on or off
-- (src/lib/settings.ts), the client each kind (src/lib/client-notify.ts).
--
--   reminder_email  the reminder by e-mail, 12 hours before (type 1). Planned
--                   from the visits like the SMS reminder; no index here, it
--                   is found by its visit (004's appointment index).
--   birthday        the greeting at 10:00 on the client's birthday (type 3):
--                   e-mail and notification, SMS only when neither went.
--                   One row per client, channel and day, so a cron run that
--                   plans it again adds nothing: the unique index below.
--   no_show         «Приглашение недошедших» (type 72): when a visit is
--                   marked «Не пришёл». One per visit and channel; a row
--                   cancelled because the status went back does not count,
--                   so the visit can be invited once it is a no-show again.
--
-- The kinds are free text in notifications.kind (004), so no column changes.
-- The birthday index lets the 10:00 run find the day's clients without
-- reading the whole client base.
--
-- Never edit this file once it has run anywhere; add a new one.

create unique index notifications_birthday_once
  on notifications (client_id, channel, (payload->>'date'))
  where kind = 'birthday';

create unique index notifications_no_show_once
  on notifications (appointment_id, channel)
  where kind = 'no_show' and status <> 'cancelled';

create index clients_birthday_idx
  on clients (business_id, birth_month, birth_day)
  where birth_day is not null and merged_into is null;
