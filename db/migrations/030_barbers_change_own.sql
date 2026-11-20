-- 030_barbers_change_own.sql: what a barber changes himself, without a
-- request to Renat. Renat answered on 18.11.2026 («Что барбер меняет
-- сам»): all four, his own schedule, vacation and days off, the prices and
-- the times of his services.
--
-- In the rights (020_rights.sql) that is «Изменять график работы…»
-- (journal.schedule: his time) and «Изменять услуги сотрудников и их
-- длительность» (services.staff, inside the «Услуги» group: his prices and
-- times). Every barber's login («Специалист») gets the three keys; a
-- barber still sees and changes only his own column (journal.staff).
-- Each login gets one audit row, as a save on «Доступ» writes, so the
-- rights' history shows the change.
--
-- The two old salon-wide switches go: a barber's login added later starts
-- with both «now» (src/lib/auth/rights-store.ts, legacyRights).
--
-- Never edit this file once it has run anywhere; add a new one.

with keys(k) as (values ('journal.schedule'), ('group:services'), ('services.staff')),
barbers as (
  select u.id, u.role, u.rights
    from users u
   where u.rights_preset = 'SP'
     and u.rights is not null
     and exists (select 1 from keys where not (keys.k = any(u.rights)))
),
changed as (
  update users u
     set rights = (select array_agg(distinct x order by x) from unnest(b.rights || array(select k from keys)) as x),
         updated_at = now()
    from barbers b
   where u.id = b.id
  returning u.id
)
insert into audit (actor, entity, entity_id, action, before, after)
select 'migration', 'user', b.id, 'rights',
       jsonb_build_object('preset', 'SP', 'role', b.role),
       jsonb_build_object('preset', 'SP', 'role', b.role,
                          'on', (select jsonb_agg(k order by k) from keys where not (k = any(b.rights))),
                          'off', '[]'::jsonb, 'values', '{}'::jsonb)
  from barbers b
  join changed c on c.id = b.id;

update businesses
   set settings = settings - 'barber_self_time' - 'barber_self_price'
 where settings ? 'barber_self_time' or settings ? 'barber_self_price';
