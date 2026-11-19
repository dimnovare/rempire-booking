-- 014_special_time_pct.sql: special time priced in percent (Renat via Dim,
-- 19.11.2026: «+50 %»).
--
-- 002 gave a window a fixed extra in euros (extra_cents). A window can now
-- be the other way instead: extra_pct, a whole percent of the visit's price
-- (the barber's own prices for the visit's services), 1 to 300. One window
-- is one or the other, never both.
--
-- The code that adds a window asks for exactly one of the two above zero
-- (src/lib/slots.ts cleanExtra). The table only refuses both at once: 002
-- allowed a window at +0 €, such rows may exist, and the build before this
-- one still writes extra_cents alone while this migration is already in.
--
-- A visit keeps its extra as money (appointments.extra_cents, worked out
-- when it is booked or moved), so nothing changes there.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table special_time add column extra_pct int not null default 0 check (extra_pct between 0 and 300);
alter table special_time add constraint special_time_one_extra check (extra_cents = 0 or extra_pct = 0);
