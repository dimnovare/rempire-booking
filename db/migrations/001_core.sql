-- 001_core.sql: who, what, when. Businesses, locations, staff, services,
-- working hours, time off, clients and appointments (docs/data-model.md).
--
-- Rules for every table here:
--   * money in integer cents (EUR), durations in whole minutes;
--   * a moment is timestamptz; a working hour is local wall-clock time read
--     in the location's time zone (src/lib/tz.ts converts);
--   * texts a client reads are jsonb {"ru": …, "et": …, "en": …};
--   * appointments are never deleted, they are cancelled.
--
-- Recorded by name in _migrations (tools/migrate.mjs): never edit this file
-- once it has run anywhere; add a new one.

create extension if not exists btree_gist;

create table businesses (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  timezone       text not null default 'Europe/Tallinn',
  default_locale text not null default 'ru' check (default_locale in ('ru', 'et', 'en')),
  -- slot_step_min, horizon_days, cancel_cutoff_min, reminder_min, …
  -- (src/lib/settings.ts holds the defaults).
  settings       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create table locations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  slug        text not null,
  name        text not null,
  address     text not null default '',
  phone       text not null default '',
  timezone    text not null default 'Europe/Tallinn',
  active      boolean not null default true,
  sort        int not null default 0,
  unique (business_id, slug)
);

create table staff (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses (id),
  location_id  uuid not null references locations (id),
  -- the barber's own link: /{locale}/b/{slug}
  slug         text not null,
  display_name text not null,
  -- the label under the name: {"ru": "Барбер", "et": "Barber", "en": "Barber"}
  role         jsonb not null default '{}'::jsonb,
  bio          jsonb not null default '{}'::jsonb,
  photo_url    text,
  -- from the reviews (Altegio import first); null shows no stars
  rating       numeric(3, 2) check (rating is null or rating between 0 and 5),
  review_count int not null default 0 check (review_count >= 0),
  bookable     boolean not null default true,
  active       boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  unique (business_id, slug)
);

create table services (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses (id),
  slug             text not null,
  name             jsonb not null,
  description      jsonb not null default '{}'::jsonb,
  duration_min     int not null check (duration_min between 5 and 720),
  price_cents      int not null check (price_cents >= 0),
  -- «30–35 €»: the top of the range; null for one price
  price_max_cents  int check (price_max_cents is null or price_max_cents >= price_cents),
  -- tidy-up time after the visit, blocked but not shown to the client
  buffer_after_min int not null default 0 check (buffer_after_min between 0 and 120),
  online           boolean not null default true,
  active           boolean not null default true,
  sort             int not null default 0,
  unique (business_id, slug)
);

-- Who does which service, at their own price and time. A null column means
-- «the service's default».
create table staff_services (
  staff_id        uuid not null references staff (id),
  service_id      uuid not null references services (id),
  duration_min    int check (duration_min is null or duration_min between 5 and 720),
  price_cents     int check (price_cents is null or price_cents >= 0),
  price_max_cents int check (price_max_cents is null or price_max_cents >= 0),
  active          boolean not null default true,
  primary key (staff_id, service_id)
);

-- The weekly template. Several rows a day are allowed; a break is the gap
-- between two rows. weekday is ISO: 1 = Monday … 7 = Sunday.
create table staff_hours (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff (id),
  weekday    smallint not null check (weekday between 1 and 7),
  starts     time not null,
  ends       time not null check (ends > starts),
  valid_from date,
  valid_to   date check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create index staff_hours_staff_idx on staff_hours (staff_id, weekday);

-- One day that differs from the template: a swapped shift, a short day.
-- intervals = [["10:00","14:00"], …]; [] is a day off.
create table staff_day_overrides (
  staff_id  uuid not null references staff (id),
  day       date not null,
  intervals jsonb not null default '[]'::jsonb check (jsonb_typeof(intervals) = 'array'),
  note      text not null default '',
  primary key (staff_id, day)
);

create table time_off (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff (id),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null check (ends_at > starts_at),
  kind       text not null default 'block' check (kind in ('vacation', 'sick', 'block')),
  -- 'approved' until Renat answers Q9 (do barbers need approval)
  status     text not null default 'approved' check (status in ('requested', 'approved', 'declined')),
  note       text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index time_off_staff_idx on time_off (staff_id, starts_at);

create table clients (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses (id),
  name          text not null check (length(name) between 1 and 120),
  phone_e164    text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email         text,
  locale        text not null default 'ru' check (locale in ('ru', 'et', 'en')),
  sms_opt_out   boolean not null default false,
  email_opt_out boolean not null default false,
  staff_note    text not null default '',
  source        text not null default 'online' check (source in ('online', 'admin', 'import')),
  altegio_id    text,
  merged_into   uuid references clients (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, phone_e164)
);

create table appointments (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses (id),
  location_id     uuid not null references locations (id),
  staff_id        uuid not null references staff (id),
  client_id       uuid not null references clients (id),
  starts_at       timestamptz not null,
  -- the end the client sees
  ends_at         timestamptz not null check (ends_at > starts_at),
  -- ends_at plus the services' tidy-up buffer: what the chair is busy for
  blocked_until   timestamptz not null check (blocked_until >= ends_at),
  -- 'pending' only if barbers must accept first (Renat Q10)
  status          text not null default 'booked'
                  check (status in ('pending', 'booked', 'arrived', 'done', 'cancelled', 'no_show')),
  source          text not null default 'online' check (source in ('online', 'admin', 'import')),
  -- the client picked «anyone»
  any_staff       boolean not null default false,
  client_comment  text not null default '' check (length(client_comment) <= 1000),
  staff_note      text not null default '',
  -- null = no SMS reminder (the client switched it off)
  reminder_min    int check (reminder_min is null or reminder_min > 0),
  total_cents     int not null default 0 check (total_cents >= 0),
  locale          text not null default 'ru' check (locale in ('ru', 'et', 'en')),
  -- sha-256 of the secret in the client's change-or-cancel link
  manage_token_hash text unique,
  -- one «Book» intention; a double tap finds the first booking
  idempotency_key text unique check (idempotency_key is null or length(idempotency_key) between 8 and 200),
  rebooked_from   uuid references appointments (id),
  cancelled_at    timestamptz,
  -- 'client', 'admin', or a user id
  cancelled_by    text,
  altegio_id      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- No double booking, enforced by the database. Time off lives in its own
  -- table, so src/lib/booking.ts also locks the staff row around its check.
  constraint appointments_no_overlap
    exclude using gist (staff_id with =, tstzrange(starts_at, blocked_until) with &&)
    where (status <> 'cancelled')
);
create index appointments_staff_time_idx on appointments (staff_id, starts_at);
create index appointments_business_time_idx on appointments (business_id, starts_at);
create index appointments_client_idx on appointments (client_id, starts_at desc);

-- The services of one visit. Name, time and price are copied at booking, so a
-- later price change never rewrites history.
create table appointment_services (
  appointment_id uuid not null references appointments (id),
  position       smallint not null check (position >= 0),
  service_id     uuid not null references services (id),
  name           jsonb not null,
  duration_min   int not null check (duration_min > 0),
  price_cents    int not null check (price_cents >= 0),
  primary key (appointment_id, position)
);

-- Who changed what. Written by the admin and by the client's change link.
create table audit (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor     text not null,
  entity    text not null,
  entity_id uuid,
  action    text not null,
  before    jsonb,
  after     jsonb
);
create index audit_entity_idx on audit (entity, entity_id, at desc);
