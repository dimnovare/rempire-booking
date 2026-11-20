-- 036_service_categories.sql: «Услуги» as the table of the admin we follow
-- (Dim, decisions round 11; the design boards «Услуги, таблица» and «Услуга,
-- окно»). Its services stand in foldable categories («Барберинг · 6
-- услуг»), each with a pencil, and one service's window picks its
-- «Категория».
--
-- A category is a name in three languages and a place in the list. A
-- service has one, or none (it then stands under «Без категории»). A
-- category is never deleted here: a service keeps pointing at it.
--
-- Every business that has services gets one category, «Барберинг», with
-- all of them in it, so the list opens as it did, in one group. Renat
-- renames it with its pencil and adds others from a service's window.
--
-- Never edit this file once it has run anywhere; add a new one.

create table service_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  name        jsonb not null,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index service_categories_business_idx on service_categories (business_id, sort);

alter table services add column category_id uuid references service_categories (id);

with owners as (
  select distinct business_id from services
),
made as (
  insert into service_categories (business_id, name, sort)
  select business_id, '{"ru": "Барберинг", "et": "Barbering", "en": "Barbering"}'::jsonb, 0 from owners
  returning id, business_id
)
update services s
   set category_id = m.id
  from made m
 where m.business_id = s.business_id
   and s.category_id is null;
