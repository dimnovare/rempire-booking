-- 009_staff_requests.sql: a barber's own changes to his time and prices
-- (Phase B, B4; docs/phase-b.md).
--
-- One row per change a barber makes from his app: a break, days off, sick
-- days, special time, his weekly hours, his price or time for a service.
-- Renat's switches (businesses.settings barber_self_time, barber_self_price;
-- src/lib/settings.ts) say whether a change applies at once or waits for
-- his answer in the admin's «Запросы»:
--   requested  waits for Renat
--   approved   Renat said yes (and it applied then)
--   declined   Renat said no
--   applied    applied at once (the switch says so); Renat sees it in the list
--   withdrawn  the barber took it back before the answer
-- `payload` is what was asked, as src/lib/barber/requests.ts writes it
-- (moments as epoch milliseconds), so the list says it in any language.
--
-- Days off that wait hold their time already: time_off.status = 'requested'
-- (001_core.sql), which online booking and the admin treat as taken, so no
-- client books into a vacation while Renat has not answered yet. A «no»
-- turns it 'declined' and the time is free again.
--
-- Never edit this file once it has run anywhere; add a new one.

create table staff_requests (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  staff_id    uuid not null references staff (id),
  kind        text not null check (kind in ('time_off', 'special', 'hours', 'price')),
  payload     jsonb not null check (jsonb_typeof(payload) = 'object'),
  note        text not null default '' check (length(note) <= 300),
  status      text not null default 'requested' check (status in ('requested', 'approved', 'declined', 'applied', 'withdrawn')),
  -- the time_off row a days-off request holds until the answer
  time_off_id uuid references time_off (id) on delete set null,
  answer_note text not null default '' check (length(answer_note) <= 300),
  created_by  uuid references users (id) on delete set null,
  created_at  timestamptz not null default now(),
  decided_by  uuid references users (id) on delete set null,
  decided_at  timestamptz
);
create index staff_requests_open_idx on staff_requests (business_id, created_at) where status = 'requested';
create index staff_requests_recent_idx on staff_requests (business_id, created_at desc);
create index staff_requests_staff_idx on staff_requests (staff_id, created_at desc);
