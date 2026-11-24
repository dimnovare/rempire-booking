-- 043_staff_online_hours.sql: «Изменить время для онлайн-записи», the sixth
-- item behind a barber's head in the journal (docs/altegio-pages.md,
-- «Журнал»; Dim, 24.11.2026, decisions round 15).
--
-- For one barber and one local day: the hours in which clients may book
-- him online, one or more wall-clock spans inside his working hours that
-- day, as the day overrides keep theirs: [["12:00","15:00"], …], an end of
-- midnight as "23:59". No row is the usual: all his working hours.
--
-- Only the client's booking reads it (src/lib/availability.ts: the booking
-- page, «Любой», the booking itself and the client's own move): a visit he
-- books starts and ends inside these spans. The salon's own bookings (the
-- journal, the barber's app) are not limited by it.
--
-- A table of its own, not a column of staff_day_overrides: a day that
-- follows the weekly hours has no override row, and giving it one would
-- tie that day to today's hours.
--
-- Never edit this file once it has run anywhere; add a new one.

create table staff_online_hours (
  staff_id   uuid not null references staff (id),
  day        date not null,
  spans      jsonb not null check (jsonb_typeof(spans) = 'array' and jsonb_array_length(spans) between 1 and 6),
  updated_at timestamptz not null default now(),
  primary key (staff_id, day)
);
