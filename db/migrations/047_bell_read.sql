-- 047_bell_read.sql: each row of the bell is read on its own, as in the
-- product we follow (Dim, 25.11.2026: «The bell opens differently in real
-- Altegio»). Opening the bell no longer reads everything: a row is read
-- when it is clicked, by its own «read» mark, or by «Прочитать все» of its
-- group (src/lib/bell.ts).
--
--   bell.read_at   when this login read the row; null: unread, a yellow
--                  dot on the row and the red dot on the bell.
--
-- The rows the old mark had read (users.bell_seen_at, 046) stay read. That
-- column stays, unused, so the build before this one still runs while the
-- new one is deployed.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table bell add column read_at timestamptz;

update bell b
   set read_at = u.bell_seen_at
  from users u
 where u.id = b.user_id
   and u.bell_seen_at is not null
   and b.created_at <= u.bell_seen_at;

create index bell_unread_idx on bell (user_id) where read_at is null;
