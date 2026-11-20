-- 023_reviews.sql: the clients' reviews (Dim, 20.11.2026: «Import now, show
-- ★ on the booking page»). Altegio holds 51 from the last 12 months; they
-- come over by scripts/import-reviews.ts, and later ours are written here
-- too. The booking page's stars on each barber are the average of his
-- reviews that are not hidden; the admin's «Отзывы» lists them all.
--
--   rating       1 to 5 stars, as Altegio gives them.
--   body         what the client wrote; '' for stars alone.
--   author_name  the name as the review shows it (Altegio prints one per
--                review). It stays as written: a client found by phone is
--                linked by client_id, but his card's name is not copied in.
--   client_id    the client, when he is known (found by phone on import).
--   staff_id     the barber it is about; null is «О компании», which the
--                booking page does not count for anyone.
--   appointment_id  the visit it is about, when known (ours, later).
--   created_at   when the client left it (Altegio's date on import).
--   source       'altegio' (imported) or 'ours'.
--   source_ref   an imported review's own key: the importer's hash of its
--                date, name and text, so a second run updates and never
--                doubles. Required for 'altegio'.
--   hidden       taken off the booking page by the salon (Altegio's
--                «Удалить»): still listed in the admin, never counted.
--
-- Who hid or showed one again is an audit row (entity «review»).
--
-- staff.rating and staff.review_count (001_core.sql) were kept for this
-- day; nothing ever wrote them. The reviews are the one place now
-- (docs/one-place.md), so the two columns go.
--
-- Never edit this file once it has run anywhere; add a new one.

create table reviews (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses (id),
  rating         smallint not null check (rating between 1 and 5),
  body           text not null default '' check (length(body) <= 4000),
  author_name    text not null default '' check (length(author_name) <= 120),
  client_id      uuid references clients (id),
  staff_id       uuid references staff (id),
  appointment_id uuid references appointments (id),
  created_at     timestamptz not null,
  source         text not null default 'ours' check (source in ('altegio', 'ours')),
  source_ref     text check (source_ref is null or length(source_ref) between 8 and 200),
  hidden         boolean not null default false,
  added_at       timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint reviews_imported_have_ref check (source <> 'altegio' or source_ref is not null)
);

-- the importer's upsert: one row per imported review
create unique index reviews_source_ref_idx on reviews (business_id, source, source_ref);
-- the booking page: each barber's average and count, over the shown ones only
create index reviews_staff_rating_idx on reviews (business_id, staff_id) include (rating) where not hidden;
-- the admin's list, the newest first
create index reviews_business_time_idx on reviews (business_id, created_at desc);
-- a client's reviews
create index reviews_client_idx on reviews (client_id) where client_id is not null;

alter table staff drop column rating;
alter table staff drop column review_count;
