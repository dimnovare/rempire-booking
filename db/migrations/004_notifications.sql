-- 004_notifications.sql: the outbox for e-mail, SMS and push (Phase A6
-- groundwork, docs/phase-a.md). A row is one message to one recipient.
--
--   * the booking code adds rows; a cron (/api/cron/outbox) sends the due
--     ones, claiming them with `for update skip locked`, so two runs never
--     send one message twice;
--   * moving a visit cancels its queued rows and adds new ones;
--   * cost_cents and segments let Renat see the SMS bill.
--
-- Never edit this file once it has run anywhere; add a new one.

create table notifications (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses (id),
  appointment_id uuid references appointments (id),
  channel        text not null check (channel in ('sms', 'email', 'push')),
  -- confirmation, reminder, moved, cancelled, login_code, …
  kind           text not null check (length(kind) between 1 and 40),
  -- an E.164 phone or an e-mail address
  recipient      text not null check (length(recipient) between 3 and 254),
  locale         text not null default 'ru' check (locale in ('ru', 'et', 'en')),
  -- what the text is built from at send time (names, times), never a secret
  payload        jsonb not null default '{}'::jsonb,
  send_at        timestamptz not null default now(),
  status         text not null default 'queued'
                 check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled', 'skipped')),
  -- a claimed row is retried after this if the sender died mid-way
  locked_until   timestamptz,
  provider       text,
  provider_ref   text,
  segments       int check (segments is null or segments >= 0),
  cost_cents     int check (cost_cents is null or cost_cents >= 0),
  attempts       int not null default 0,
  last_error     text,
  sent_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index notifications_due_idx on notifications (send_at) where status in ('queued', 'sending');
create index notifications_appointment_idx on notifications (appointment_id);
