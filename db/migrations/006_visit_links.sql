-- 006_visit_links.sql: more than one change-or-cancel link per visit (A6).
--
-- The booking screen's link is appointments.manage_token_hash (001). A letter
-- or an SMS sent later cannot reuse it: only its sha-256 is kept. So each
-- message mints a link of its own at send time and keeps only the hash here;
-- the raw token exists only in the message itself. A visit booked in the
-- admin (no manage_token_hash) gets its links this way too.
--
-- Never edit this file once it has run anywhere; add a new one.

create table visit_links (
  token_hash     text primary key,
  appointment_id uuid not null references appointments (id) on delete cascade,
  -- what the link went out in: email, sms, …
  purpose        text not null check (length(purpose) between 1 and 40),
  created_at     timestamptz not null default now()
);
create index visit_links_appointment_idx on visit_links (appointment_id);
