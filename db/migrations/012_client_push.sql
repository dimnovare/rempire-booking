-- 012_client_push.sql: Web Push for clients (docs/apps.md, step 4): the
-- reminder before a visit as a notification on the client's phone, instead
-- of or beside the SMS (businesses.settings.client_reminder).
--
-- A row is one browser of one client, as push_subscriptions (008) is one
-- browser of one login. The client turns it on after a booking; the visit's
-- own link says whose phone it is, so no client account is needed. The
-- endpoint is the key: the same browser subscribing again is the same row,
-- and a shared phone belongs to whoever booked on it last. Rows the push
-- service disowns (404/410) or the client turns off are retired, not
-- deleted.
--
-- The reminder itself is an outbox row (004): channel 'push', kind
-- 'client_reminder', the client's id in recipient, no user_id.
--
-- Never edit this file once it has run anywhere; add a new one.

create table client_push_subscriptions (
  endpoint       text primary key check (length(endpoint) between 20 and 2000),
  business_id    uuid not null references businesses (id),
  client_id      uuid not null references clients (id) on delete cascade,
  p256dh         text not null check (length(p256dh) between 1 and 255),
  auth           text not null check (length(auth) between 1 and 255),
  -- the phone's own name for itself («iPhone», «Android»)
  label          text not null default '' check (length(label) <= 100),
  created_at     timestamptz not null default now(),
  -- the last time the push service accepted a push to it
  last_ok_at     timestamptz,
  -- 'gone' (the push service said so) or 'user' (turned off on the phone)
  retired_at     timestamptz,
  retired_reason text
);
create index client_push_subscriptions_client_idx on client_push_subscriptions (client_id) where retired_at is null;
