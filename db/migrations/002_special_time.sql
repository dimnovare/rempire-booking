-- Special time (Renat via Dim, 17.11.2026): hours a barber sets himself, any
-- time of day, each window at its own higher price. Adding the window is the
-- barber's promise to work it, so clients book it at once.
--
-- Inside his normal hours it replaces the normal price for that time; outside
-- them it adds bookable time. «Every Wednesday» in the barber app writes one
-- row per week, so a row is always one concrete window.
create table special_time (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  staff_id    uuid not null references staff (id),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null check (ends_at > starts_at),
  -- on top of the barber's usual price for the visit
  extra_cents int not null check (extra_cents between 0 and 100000),
  note        text not null default '',
  -- 'staff', 'admin', 'demo', or a user id
  created_by  text not null default 'staff',
  created_at  timestamptz not null default now()
);
create index special_time_staff_idx on special_time (staff_id, starts_at);

-- The special-time extra of a visit, kept apart from the service prices
-- (Renat Q16: whether it goes to the barber whole). total_cents includes it.
alter table appointments add column extra_cents int not null default 0 check (extra_cents >= 0);
