-- 033_notification_rights.sql: who opens «Настройки → Уведомления» (the
-- decision page, round 11: «a right for this page, given to whoever has
-- settings.location today»).
--
-- The catalogue already had the group «Уведомления» with two rights,
-- «Доступ к разделу SMS-уведомления» (notify.sms) and «… Email-уведомления»
-- (notify.email), waiting for a page (020_rights.sql; built from today,
-- src/lib/auth/rights-catalogue.ts). Either opens the page; each changes
-- its own channel (src/lib/admin/notification-store.ts).
--
-- A stored set may hold them already, as a preset's part that did nothing
-- yet (lockedPart), and may not: so here they follow «Доступ к настройкам
-- локации» exactly. A login that has it (the right and the group
-- «Настройки» on) gets the group and both rights; a login that has not
-- loses the two rights. A login with no set yet gets its set at its next
-- read (legacyRights): both rights are the owner's there, as
-- settings.location is.
--
-- Each login changed gets one audit row, as a save on «Доступ» writes, so
-- the rights' history shows it.
--
-- Never edit this file once it has run anywhere; add a new one.

with keys(k) as (values ('group:notify'), ('notify.sms'), ('notify.email')),
given as (
  select u.id, u.role, u.rights_preset as preset, u.rights
    from users u
   where u.rights is not null
     and 'settings.location' = any(u.rights)
     and 'group:settings' = any(u.rights)
     and exists (select 1 from keys where not (keys.k = any(u.rights)))
),
changed as (
  update users u
     set rights = (select array_agg(distinct x order by x) from unnest(g.rights || array(select k from keys)) as x),
         updated_at = now()
    from given g
   where u.id = g.id
  returning u.id
)
insert into audit (actor, entity, entity_id, action, before, after)
select 'migration', 'user', g.id, 'rights',
       jsonb_build_object('preset', g.preset, 'role', g.role),
       jsonb_build_object('preset', g.preset, 'role', g.role,
                          'on', (select jsonb_agg(k order by k) from keys where not (k = any(g.rights))),
                          'off', '[]'::jsonb, 'values', '{}'::jsonb)
  from given g
  join changed c on c.id = g.id;

with keys(k) as (values ('notify.sms'), ('notify.email')),
taken as (
  select u.id, u.role, u.rights_preset as preset, u.rights
    from users u
   where u.rights is not null
     and not ('settings.location' = any(u.rights) and 'group:settings' = any(u.rights))
     and u.rights && array['notify.sms', 'notify.email']::text[]
),
changed as (
  update users u
     set rights = array(select x from unnest(t.rights) as x where x not in ('notify.sms', 'notify.email') order by x),
         updated_at = now()
    from taken t
   where u.id = t.id
  returning u.id
)
insert into audit (actor, entity, entity_id, action, before, after)
select 'migration', 'user', t.id, 'rights',
       jsonb_build_object('preset', t.preset, 'role', t.role),
       jsonb_build_object('preset', t.preset, 'role', t.role,
                          'on', '[]'::jsonb,
                          'off', (select jsonb_agg(k order by k) from keys where k = any(t.rights)),
                          'values', '{}'::jsonb)
  from taken t
  join changed c on c.id = t.id;
