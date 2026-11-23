-- 037_heartbeats.sql: when a background job last ran, and whether it went
-- well, so the uptime monitor can ask (/api/health/cron, src/lib/health.ts)
-- and an alert goes out when the messages stop (docs/test-plan.md § 11).
--
-- One row per job, overwritten on every run: `at` is the end of the last
-- run, `ok` whether it finished without an error, `detail` a few counts
-- (never a client's data).
--
-- Never edit this file once it has run anywhere; add a new one.

create table if not exists heartbeats (
  name   text primary key check (name ~ '^[a-z_]{1,40}$'),
  at     timestamptz not null default now(),
  ok     boolean not null default true,
  detail jsonb not null default '{}'::jsonb
);
