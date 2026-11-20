-- 028_location_profile.sql: the salon's own page on the booking site (Dim,
-- 20.11.2026). «REMPIRE ▾» opens it, as the widget REMPIRE's clients know
-- opens its «about» page (docs/client-flow.md, «The salon's page»). The
-- fields are the ones that widget's settings have under «Контакты»,
-- «Бренд» and «Галерея» (docs/altegio-pages.md, «Настройки»):
--
--   schedule   the opening hours as one line the salon writes itself,
--              {"ru": …, "et": …, "en": …}; '{}' shows no line.
--   website    the site as the salon writes it («www.rempire.ee»); the
--              page links it, adding https:// when there is none.
--   about      the salon's own words, {"ru": …, "et": …, "en": …}.
--   photos     the gallery: a JSON array of image addresses, in order
--              (the widget allows 8).
--   lat, lng   where the map's pin goes; both or neither. No pin, no map.
--   instagram, facebook   a profile's address or name.
--   whatsapp, viber       a number.
--   telegram              a name (@…) or an address.
--   '' is «not set»: the page leaves that row out.
--
-- The country and the postcode are not kept: the address line says where.
-- The salon's reviews (reviews.staff_id is null, 023) are counted, not
-- stored here.
--
-- REMPIRE's own public values are filled in below for a database that has
-- REMPIRE already (staging). A new demo database gets the same values from
-- tools/seed-demo.mjs (DEMO.location). The address stays as it is.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table locations
  add column schedule  jsonb not null default '{}'::jsonb check (jsonb_typeof(schedule) = 'object'),
  add column website   text not null default '' check (length(website) <= 200),
  add column about     jsonb not null default '{}'::jsonb check (jsonb_typeof(about) = 'object'),
  add column photos    jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  add column lat       double precision check (lat between -90 and 90),
  add column lng       double precision check (lng between -180 and 180),
  add column instagram text not null default '' check (length(instagram) <= 200),
  add column facebook  text not null default '' check (length(facebook) <= 200),
  add column whatsapp  text not null default '' check (length(whatsapp) <= 40),
  add column telegram  text not null default '' check (length(telegram) <= 200),
  add column viber     text not null default '' check (length(viber) <= 40);

alter table locations add constraint locations_pin_check check ((lat is null) = (lng is null));

update locations l
   set phone    = case when l.phone = '' then '+372 5623 7237' else l.phone end,
       website  = 'www.rempire.ee',
       schedule = '{"ru": "пн–сб 10:00–19:00", "et": "E–L 10:00–19:00", "en": "Mon–Sat 10:00–19:00"}'::jsonb,
       about    = jsonb_build_object(
                    'en', 'Barbers from Estonia, operating in the capital city Tallinn. Come and visit us at REMPIRE and together we will add some crisp to your individuality!',
                    'ru', 'Барберы из Эстонии, работаем в столице, Таллине. Приходите к нам в REMPIRE, и вместе мы придадим вашей индивидуальности чёткости!',
                    'et', 'Barberid Eestist, tegutseme pealinnas Tallinnas. Tule meile külla REMPIRE salongi ja koos lisame sinu isikupärale teravust!'),
       photos   = '["/brand/rempire-photo.svg"]'::jsonb,
       lat      = 59.430883,
       lng      = 24.761967
  from businesses b
 where b.id = l.business_id and b.slug = 'rempire';
