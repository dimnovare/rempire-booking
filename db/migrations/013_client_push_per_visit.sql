-- 013_client_push_per_visit.sql: a client's phone is tied to the visit whose
-- link turned the reminder on, not to the client (security review, 18.11).
--
-- 012 tied a phone to the client: one visit's link then got the reminders
-- of every later visit of that client, each with that visit's own change
-- link. A visit link opens one visit and must never open another. Anyone
-- can book with someone else's phone number and so hold a link «of» that
-- client; that link must not lead to the client's other visits.
--
-- Now a row is one browser for one visit. The same browser may hold several
-- rows, one per visit it was turned on for; the booking page adds the row
-- for a new booking by itself when the phone is on already
-- (src/app/[locale]/remind-me.tsx).
--
-- 012 ran on staging for an hour with no phone subscribed; whatever rows it
-- has were tied to a client and are not kept.
--
-- Never edit this file once it has run anywhere; add a new one.

delete from client_push_subscriptions;

alter table client_push_subscriptions drop constraint client_push_subscriptions_pkey;
drop index client_push_subscriptions_client_idx;
alter table client_push_subscriptions drop column client_id;
alter table client_push_subscriptions add column appointment_id uuid not null references appointments (id) on delete cascade;
alter table client_push_subscriptions add primary key (endpoint, appointment_id);
create index client_push_subscriptions_visit_idx on client_push_subscriptions (appointment_id) where retired_at is null;
