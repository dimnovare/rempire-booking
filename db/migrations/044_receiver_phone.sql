-- 044_receiver_phone.sql: a phone on each receiver of REMPIRE's invoices,
-- as Isolta's contacts have one («Номер телефона»; Dim, 24.11.2026,
-- decisions round 15).
--
--   phone   as typed, a plausible number with its country code; one typed
--           without it is kept as +372… (src/lib/admin/location-form.ts,
--           cleanPhone, as the salon's own phones). '' for none. The Isolta
--           import fills it from Isolta's contact (src/lib/billing/isolta.ts).
--           For «Получатели» only: it is not printed on the invoice.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table invoice_receivers
  add column phone text not null default '' check (length(phone) <= 40);
