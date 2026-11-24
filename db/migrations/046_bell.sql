-- 046_bell.sql: the bell in the admin's sidebar head, as the product we follow
-- has one (Dim, 24.11.2026; docs/reference-looks.md, «Sidebar and tiles»).
--
-- It shows the same events the staff pushes carry (src/lib/push.ts,
-- src/lib/push-kinds.ts), to every login that would get the push, with a
-- phone or without one. One row per login and event, written in the same
-- transaction as the change and with the same rules as the push (the
-- login active, of the right role or column, not the one who made the
-- change, wanting the kind in users.notify), minus «has a live phone».
-- The outbox rows of the pushes are not touched: a push is still queued
-- only for a login with a phone.
--
--   kind            a push kind: visit_new, own_online, day_plan, …
--   payload         what the push row carries (a snapshot at the change);
--                   the words are built when the bell is read, by the same
--                   pushText as the push, in the reader's language. The
--                   evening plan keeps its numbers as they were at 20:00.
--   appointment_id  the visit it is about, if any («Обезличить клиента»
--                   takes his name out of these rows as out of the push rows)
--
-- users.bell_seen_at: when this login last opened the bell. A row newer
-- than it is unread, and the bell wears its red dot.
--
-- The bell lists the newest 30 of the last 30 days; the cron deletes rows
-- older than that (src/lib/bell.ts, pruneBell).
--
-- Never edit this file once it has run anywhere; add a new one.

create table bell (
  id             bigint generated always as identity primary key,
  business_id    uuid not null references businesses (id),
  user_id        uuid not null references users (id) on delete cascade,
  kind           text not null check (length(kind) between 1 and 40),
  payload        jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  appointment_id uuid references appointments (id) on delete cascade,
  created_at     timestamptz not null default now()
);
create index bell_user_idx on bell (user_id, created_at desc);
create index bell_created_idx on bell (created_at);

-- the evening plan once per login and day, however often the cron runs (as notifications_plan_once_idx, 008)
create unique index bell_plan_once_idx on bell (user_id, kind, (payload->>'date'))
  where kind in ('day_plan', 'own_plan');

alter table users add column bell_seen_at timestamptz;
