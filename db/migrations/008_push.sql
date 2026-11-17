-- 008_push.sql: Web Push for the barber app (Phase B, B5; docs/phase-b.md).
--
-- push_subscriptions is the shop's table (rempire-web
-- db/migrations/200_push_subscriptions.sql) with one change: a row belongs
-- to a login (user_id). The shop has one owner; here every barber and
-- Renat each have their own phones. A subscription is per browser profile,
-- so one login may have several rows (his iPhone, a tablet).
--
-- The endpoint is the key: the browser hands the same one back when the
-- same profile subscribes again, so «turn on» is idempotent. Rows the push
-- service disowns (404/410) are retired, not deleted, so «why did my phone
-- go quiet» has an answer and the same endpoint can come back.
--
-- The outbox (004_notifications.sql) already allows channel 'push'. A push
-- row goes to a login: user_id, with the same id in recipient.
--
-- users.notify: which kinds of push this login wants, {"own_online": true,
-- …}; a kind not in it has its default (src/lib/push-kinds.ts).
--
-- Never edit this file once it has run anywhere; add a new one.

create table push_subscriptions (
  endpoint       text primary key check (length(endpoint) between 20 and 2000),
  user_id        uuid not null references users (id) on delete cascade,
  p256dh         text not null check (length(p256dh) between 1 and 255),
  auth           text not null check (length(auth) between 1 and 255),
  -- the phone's own name for itself («iPhone», «Android»), for the list
  label          text not null default '' check (length(label) <= 100),
  created_at     timestamptz not null default now(),
  -- the last time the push service accepted a push to it
  last_ok_at     timestamptz,
  -- 'gone' (the push service said so) or 'user' (turned off in the app)
  retired_at     timestamptz,
  retired_reason text
);
create index push_subscriptions_user_idx on push_subscriptions (user_id) where retired_at is null;

alter table notifications add column user_id uuid references users (id) on delete cascade;
create index notifications_user_idx on notifications (user_id) where user_id is not null;

-- the evening plan goes once per login and day, however often the cron runs
create unique index notifications_plan_once_idx on notifications (user_id, kind, (payload->>'date'))
  where kind in ('day_plan', 'own_plan');

alter table users add column notify jsonb not null default '{}'::jsonb check (jsonb_typeof(notify) = 'object');
