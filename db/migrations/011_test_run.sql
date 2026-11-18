-- The staging test run with Renat and the barbers (docs/test-run.md, R2).
--
-- 1. A sale made while SHOP_SALES is off is booking's own: sync_status
--    'test', never sent to the shop. Statements and invoice drafts still
--    count it.
-- 2. Invoices issued on staging take their numbers from a counter of their
--    own (test = true) and print as TEST-…, so the real series Renat set
--    from Isolta is never used up by a test.
-- 3. «Сообщить о проблеме»: what a tester saw, saved where Claude reads it.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table product_sales drop constraint product_sales_sync_status_check;
alter table product_sales add constraint product_sales_sync_status_check
  check (sync_status in ('queued', 'sending', 'synced', 'failed', 'none', 'test'));

alter table invoice_counters add column test boolean not null default false;
alter table invoice_counters drop constraint invoice_counters_pkey;
alter table invoice_counters add primary key (issuer_id, year, test);

create table problem_reports (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  -- the login that sent it; null if the session was gone
  user_id     uuid references users (id),
  -- who and where, as they were at that moment
  email       text not null default '' check (length(email) <= 254),
  role        text not null default '' check (length(role) <= 20),
  app         text not null check (app in ('admin', 'b')),
  path        text not null default '' check (length(path) <= 500),
  text        text not null check (length(text) between 1 and 4000),
  user_agent  text not null default '' check (length(user_agent) <= 400),
  -- Renat or Claude ticks it off; never deleted
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index problem_reports_business_idx on problem_reports (business_id, created_at desc);
