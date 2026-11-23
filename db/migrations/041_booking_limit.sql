-- 041_booking_limit.sql: a limit per address on the online booking and on
-- the client's own move of a visit (docs/test-plan.md § 11 «Spam bookings»).
--
-- One row for each online booking or move that went through. The address
-- is kept only as a code: an HMAC of it and the salon's day, keyed with
-- review_salt (035), as for the reviews. Rows older than two days are
-- deleted on the way (src/lib/booking-limit.ts). The admin's and the
-- barber's own bookings never come here.
--
--   kind   'book'  a new visit from the booking page (POST /api/bookings)
--          'move'  the client moved his visit (POST /api/visit/<token>/move)
--
-- Never edit this file once it has run anywhere; add a new one.

create table booking_limit (
  id          bigint generated always as identity primary key,
  business_id uuid not null references businesses (id),
  at          timestamptz not null,
  kind        text not null check (kind in ('book', 'move')),
  ip_hash     text not null check (ip_hash ~ '^[0-9a-f]{64}$')
);
create index booking_limit_ip_idx on booking_limit (business_id, ip_hash, kind, at);
create index booking_limit_at_idx on booking_limit (at);
