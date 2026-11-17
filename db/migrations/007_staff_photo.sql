-- 007_staff_photo.sql: a barber's portrait, uploaded in the admin (Dim, 17.11.2026).
--
-- Until now staff.photo_url was typed in as a link to a file in /public. Renat
-- cannot put a file there, so the admin takes the photo itself: the browser
-- shrinks it to a small JPEG (well under 200 KB) and it is kept here, in the
-- database. With a handful of barbers that is a few hundred KB in all, and it
-- needs no storage service and no keys. If photos ever grow (galleries, the
-- tattoo studio's work), move them to a bucket then and keep this table's
-- shape as the pointer.
--
-- staff.photo_url stays the one thing every page reads: an upload sets it to
-- /api/staff-photo/<staff id>?v=<when>, and old links to /public keep working.
--
-- Never edit this file once it has run anywhere; add a new one.

create table staff_photo (
  staff_id   uuid primary key references staff (id) on delete cascade,
  -- image/jpeg, image/png or image/webp, told from the first bytes
  mime       text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes      bytea not null check (octet_length(bytes) between 1 and 600000),
  updated_at timestamptz not null default now()
);
