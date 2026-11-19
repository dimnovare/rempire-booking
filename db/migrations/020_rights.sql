-- 020_rights.sql: access rights per login (the owner, 19.11.2026: «add all
-- switches»: the staff rights screen of the tool we follow, on top of
-- roles). docs/altegio-rights.md has the list; the catalogue of rights is
-- src/lib/auth/rights-catalogue.ts, the door src/lib/auth/rights.ts.
--
--   rights_preset  the role preset the set was last filled from: one of
--                  the list's eight (SM «Менеджер системы», VW «Только
--                  просмотр», SP «Специалист», AD «Администратор», CC
--                  «Колл-центр», AC «Бухгалтер», MG «Менеджер», OW
--                  «Владелец»). users.role follows it when rights are
--                  saved: OW → owner, SP → staff, the other six → admin.
--   rights         the switches that are on: a right's key
--                  («journal.phones») or a group's switch
--                  («group:journal»). Null: this login has no set yet.
--   rights_values  the few rights that carry a value, by key: whose
--                  columns and whose clients («all» or barbers' ids), how
--                  many past days of the calendar (null: no limit), and a
--                  right's period («all» or «today»).
--
-- No backfill here: the first read of a login after this migration writes
-- its set from its role and the salon's two switches as they stand
-- (src/lib/auth/rights-store.ts, legacyRights), so every login can do
-- exactly what it could the day before. The list lives in one place, the
-- catalogue, not in SQL as well.
--
-- A change of rights is an audit row (entity «user», action «rights») with
-- the keys that went on and off: the rights' history needs no table.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table users add column rights_preset text check (rights_preset in ('SM', 'VW', 'SP', 'AD', 'CC', 'AC', 'MG', 'OW'));
alter table users add column rights text[];
alter table users add column rights_values jsonb not null default '{}';
