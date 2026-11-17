-- 003_staff_auth.sql: staff logins for Renat's admin and, later, the barber
-- app (Phase A4, docs/phase-a.md). Clients are not users.
--
--   * a password (scrypt, tools/password.mjs), or a 6-digit e-mail code as
--     the backup, or Google (google_sub, once the OAuth client exists);
--   * a session is a random token in an httpOnly cookie; only its sha-256 is
--     stored here, so a copy of this table opens nothing;
--   * auth_attempts rate-limits password and code tries per e-mail and per IP.
--
-- Also: a walk-in client may have no phone (the admin books them by name).
--
-- Never edit this file once it has run anywhere; add a new one.

create table users (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses (id),
  -- always stored lower-case
  email         text not null unique check (email = lower(email) and length(email) between 3 and 254),
  name          text not null default '' check (length(name) <= 120),
  -- scrypt$N$r$p$salt$hash (tools/password.mjs); null = code or Google only
  password_hash text,
  -- Google's stable user id, never the e-mail
  google_sub    text unique,
  -- owner = Renat; admin = front desk; staff = a barber (Phase B app)
  role          text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  staff_id      uuid references staff (id),
  locale        text not null default 'ru' check (locale in ('ru', 'et', 'en')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id),
  -- sha-256 of the cookie's token
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- slides forward while the device is used (src/lib/auth/sessions.ts)
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  user_agent   text not null default '' check (length(user_agent) <= 300),
  ip           text not null default '' check (length(ip) <= 64)
);
create index sessions_user_idx on sessions (user_id);

-- The 6-digit backup code by e-mail: 10 minutes, 5 tries, then a new code.
create table login_codes (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  -- sha-256 of email + code
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   int not null default 0,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index login_codes_email_idx on login_codes (email, created_at desc);

create table auth_attempts (
  id    bigint generated always as identity primary key,
  at    timestamptz not null default now(),
  kind  text not null check (kind in ('password', 'code', 'code_send')),
  email text not null default '',
  ip    text not null default '',
  ok    boolean not null
);
create index auth_attempts_email_idx on auth_attempts (email, at desc);
create index auth_attempts_ip_idx on auth_attempts (ip, at desc);

-- A walk-in booked by name only. Several clients with no phone are fine:
-- unique (business_id, phone_e164) ignores nulls.
alter table clients alter column phone_e164 drop not null;
