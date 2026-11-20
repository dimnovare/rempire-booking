-- 031_location_images.sql: the salon's logo and gallery, uploaded in the
-- admin (Dim, 20.11.2026: «Настройки → Бренд» and «Галерея», as the widget's
-- settings have them; docs/altegio-pages.md, «Настройки»). Until now the
-- salon's page (028) changed only by SQL.
--
-- As the barbers' portraits (007): the browser shrinks a picture first and
-- the bytes are kept here, in the database. A logo and eight photos of a
-- few hundred KB each is a few MB in all: still no storage service and no
-- keys. If that ever grows, move the bytes to a bucket and keep this
-- table's shape as the pointer.
--
-- locations.photos (028) stays the one list every page reads: an upload
-- adds /api/salon/image/<id> to it, and the seeded /brand/rempire-photo.svg
-- keeps working. locations.logo is the same for the logo: '' is «none», and
-- the booking pages keep REMPIRE's own mark.
--
-- Each upload is a new row with a new address, so a file never changes in
-- place and its address can be cached for good. A replaced logo and a
-- removed photo are deleted here.
--
-- Never edit this file once it has run anywhere; add a new one.

create table location_images (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations (id) on delete cascade,
  kind        text not null check (kind in ('logo', 'photo')),
  -- image/jpeg, image/png or image/webp, told from the first bytes
  mime        text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes       bytea not null check (octet_length(bytes) between 1 and 600000),
  created_at  timestamptz not null default now()
);
create index location_images_location_idx on location_images (location_id, kind);

alter table locations add column logo text not null default '' check (length(logo) <= 300);

-- the widget allows eight photos; the admin says so too, this is the floor
-- under it (a case, so the length is only asked of an array)
alter table locations add constraint locations_photos_max
  check (case when jsonb_typeof(photos) = 'array' then jsonb_array_length(photos) <= 8 else false end);
