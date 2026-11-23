-- 039_review_request.sql: «Запрос отзыва после визита» (Dim, decisions
-- round 13: «build it, off as at REMPIRE today»; the tool's types 6 / 20).
-- src/lib/outbox.ts planReviewRequests queues it from every run, once the
-- visit is marked «Пришёл» and ended three hours ago (the salon's setting
-- in «Уведомления», src/lib/admin/notifications.ts): one row per visit and
-- channel, never two, as the invitation after a missed visit has it
-- (022_client_messages.sql).
--
-- Nothing else changes in the database: the switch (off until switched on)
-- and the delay live in businesses.settings, the client's own switch in
-- clients.notify_off, as for every other message.
--
-- Never edit this file once it has run anywhere; add a new one.

create unique index notifications_review_request_once
  on notifications (appointment_id, channel)
  where kind = 'review_request' and status <> 'cancelled';
