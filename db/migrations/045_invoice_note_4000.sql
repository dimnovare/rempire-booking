-- 045_invoice_note_4000.sql: an invoice's own note («Заметка к счёту») holds
-- up to 4000 characters, as Isolta's «Заметка (не будет видна на инвойсе)»
-- does (Dim, 24.11.2026, after decisions round 15). It was 300
-- (010_sales_invoices.sql, the column check of invoices.note).
--
--   invoices.note   the staff's own words about the invoice: shown on its
--                   page, copied by «Сделать копию счёта», filled from
--                   Isolta's free text by the import (src/lib/billing/
--                   isolta.ts), and never printed (src/lib/billing/pdf.ts).
--
-- Only this column: the issuer's foot text (invoice_issuers.note, printed
-- under the totals of every invoice) and the other notes keep their 300.
-- The check is the one Postgres named for the column in 010.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table invoices drop constraint invoices_note_check;
alter table invoices add constraint invoices_note_check check (length(note) <= 4000);
