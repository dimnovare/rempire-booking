-- 032_location_socials.sql: the salon's Facebook and Instagram on its page
-- (Dim, 20.11.2026: «take those from rempireshop or rempire.ee»). Both are
-- the barbershop's own, as rempire.ee links them; the shop's Instagram
-- (rempire.shop) is the shop's, not the salon's. Altegio's «Контакты» has
-- them empty, so the widget showed none.
--
-- Only where nothing is filled yet: what Renat typed in «Настройки →
-- Контакты» (031) stays.
--
-- Never edit this file once it has run anywhere; add a new one.

update locations l
   set facebook  = case when l.facebook = '' then 'https://www.facebook.com/Rempire.Official.Tallinn' else l.facebook end,
       instagram = case when l.instagram = '' then 'https://www.instagram.com/rempire.official/' else l.instagram end
  from businesses b
 where b.id = l.business_id and b.slug = 'rempire';
