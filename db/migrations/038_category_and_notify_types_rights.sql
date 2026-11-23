-- 038_category_and_notify_types_rights.sql: two rights come alive (Dim,
-- decisions rounds 12 and 13: «same as Altegio»), and nobody loses what he
-- could do the day before.
--
--   services.edit.category  «Категория услуги», under «Редактирование
--                           услуг»: was in the catalogue, locked; until
--                           now «Редактирование услуг» covered categories
--                           (src/lib/admin/services.ts). A login that has
--                           «Редактирование услуг» (and the group
--                           «Услуги») gets it.
--   notify.types            «Доступ к разделу Типы уведомлений», new in
--                           the group «Уведомления»: the door of the page
--                           «Уведомления» (notification-store.ts). Until
--                           now either «SMS-» or «Email-уведомления»
--                           opened it, so a login that has either gets it.
--
-- A login with no set yet gets its set at its next read (legacyRights):
-- both follow the preset there. Each login changed gets one audit row, as a
-- save on «Доступ» writes, so the rights' history shows it.
--
-- Never edit this file once it has run anywhere; add a new one.

with given as (
  select u.id, u.role, u.rights_preset as preset, u.rights
    from users u
   where u.rights is not null
     and 'services.edit' = any(u.rights)
     and 'group:services' = any(u.rights)
     and not ('services.edit.category' = any(u.rights))
),
changed as (
  update users u
     set rights = (select array_agg(distinct x order by x) from unnest(g.rights || array['services.edit.category']) as x),
         updated_at = now()
    from given g
   where u.id = g.id
  returning u.id
)
insert into audit (actor, entity, entity_id, action, before, after)
select 'migration', 'user', g.id, 'rights',
       jsonb_build_object('preset', g.preset, 'role', g.role),
       jsonb_build_object('preset', g.preset, 'role', g.role,
                          'on', '["services.edit.category"]'::jsonb,
                          'off', '[]'::jsonb, 'values', '{}'::jsonb)
  from given g
  join changed c on c.id = g.id;

with given as (
  select u.id, u.role, u.rights_preset as preset, u.rights
    from users u
   where u.rights is not null
     and u.rights && array['notify.sms', 'notify.email']::text[]
     and not ('notify.types' = any(u.rights))
),
changed as (
  update users u
     set rights = (select array_agg(distinct x order by x) from unnest(g.rights || array['notify.types']) as x),
         updated_at = now()
    from given g
   where u.id = g.id
  returning u.id
)
insert into audit (actor, entity, entity_id, action, before, after)
select 'migration', 'user', g.id, 'rights',
       jsonb_build_object('preset', g.preset, 'role', g.role),
       jsonb_build_object('preset', g.preset, 'role', g.role,
                          'on', '["notify.types"]'::jsonb,
                          'off', '[]'::jsonb, 'values', '{}'::jsonb)
  from given g
  join changed c on c.id = g.id;
