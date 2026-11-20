-- 035_review_moderation.sql: the clients' own reviews, written on the
-- salon's page («Оцените и напишите отзыв»; Dim, 20.11.2026, decision page
-- round 11). A new one waits for the salon: it shows only once Renat
-- approves it in «Отзывы».
--
--   pending   sent from the site, not looked at yet. It is hidden too (023),
--             so every count and list that reads «not hidden» leaves it out
--             until it is approved (pending and hidden off) or turned down
--             (pending off, hidden stays).
--   ip_hash   for the limit of reviews from one address: an HMAC of the
--             address and the salon's day, keyed with review_salt below.
--             No address is kept in clear, the same address gives another
--             hash the next day, and the hash itself is cleared after two
--             days (src/lib/reviews.ts, submitReview).
--
-- review_salt: one random key, made here by the database and never written
-- in a file.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table reviews
  add column pending boolean not null default false,
  add column ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  add constraint reviews_pending_hidden check (not pending or hidden);

-- the admin's «new» first, and the count of them
create index reviews_pending_idx on reviews (business_id, created_at desc) where pending;
-- the limit per address, and clearing the old hashes
create index reviews_ip_idx on reviews (ip_hash, created_at) where ip_hash is not null;

create table review_salt (
  id   boolean primary key default true check (id),
  salt text not null check (length(salt) >= 32)
);
insert into review_salt (salt) values (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
