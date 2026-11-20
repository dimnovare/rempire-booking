-- 034_location_contacts.sql: «Настройки → Контакты» the way the tool we
-- follow has it (Dim, 20.11.2026, decision page round 11): the address is
-- found on a map, the pin can be dragged, the country and the postcode come
-- with it, and «+ Добавить номер» adds phones.
--
--   phones    the salon's numbers in order: [{"number": "+372 …", "label": ""}].
--             The first is the main one. Five at most; the label is the
--             owner's own word for a number («Тату»), '' for none.
--   phone     (001) stays the main number, the one place that shows a single
--             phone reads it: the booking site, the letters, the SMS, the
--             visit page. Once `phones` has numbers, `phone` is its first
--             (the check below); a row with '[]' has only `phone`, as before
--             (the demo seed writes it so), and the pages read it as a list
--             of one (src/lib/admin/location.ts, src/lib/catalog.ts).
--   country   ISO 3166-1 alpha-2, upper case: the geocoder looks there first.
--             'EE' unless set.
--   postcode  as written; '' for none.
--
-- The existing phone moves into `phones` here, as the first and only one.
-- REMPIRE's postcode is filled where its address is Mardi 1.
--
-- geocoder_gate: one row, the moment the app last asked OpenStreetMap's
-- Nominatim for an address. Nominatim allows one request a second for the
-- whole app; every server instance takes its turn from this row first
-- (src/lib/geocode.ts).
--
-- Never edit this file once it has run anywhere; add a new one.

alter table locations
  add column phones   jsonb not null default '[]'::jsonb,
  add column country  text not null default 'EE' check (country ~ '^[A-Z]{2}$'),
  add column postcode text not null default '' check (length(postcode) <= 20);

update locations
   set phones = jsonb_build_array(jsonb_build_object('number', phone, 'label', ''))
 where phone <> '';

update locations l
   set postcode = '10145'
  from businesses b
 where b.id = l.business_id and b.slug = 'rempire' and l.postcode = '' and l.address ilike '%mardi 1%';

-- a list of five at most (a case, so the length is only asked of an array)
alter table locations add constraint locations_phones_list
  check (case when jsonb_typeof(phones) = 'array' then jsonb_array_length(phones) <= 5 else false end);
-- the main number is the list's first, whenever the list has one
alter table locations add constraint locations_phone_first
  check (case when jsonb_typeof(phones) = 'array' and jsonb_array_length(phones) > 0 then phones -> 0 ->> 'number' = phone else true end);

create table geocoder_gate (
  id      boolean primary key default true check (id),
  last_at timestamptz not null default '-infinity'
);
insert into geocoder_gate default values;
