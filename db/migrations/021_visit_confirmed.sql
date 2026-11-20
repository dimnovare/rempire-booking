-- 021_visit_confirmed.sql: «Клиент подтвердил» (the owner, 19.11.2026: the
-- admin's visit window copies the tool we follow, whose four status chips
-- are «Ожидание», «Клиент пришёл», «Не пришёл» and «Подтвердил»).
--
-- The client said he will come. It is a flag on a visit that waits, not a
-- status of its own: everything that reads status = 'booked' (the journal's
-- colours, the reminders, the letters, the day's numbers, the barber app)
-- goes on as before. When it was confirmed; null: not confirmed.
--
--   «Ожидание»       status 'booked', confirmed_at null;
--   «Подтвердил»     status 'booked', confirmed_at set;
--   any other status clears it (src/lib/admin/visits.ts, adminSetStatus).
--
-- No index: it is read with the visit's own row.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table appointments add column confirmed_at timestamptz;
