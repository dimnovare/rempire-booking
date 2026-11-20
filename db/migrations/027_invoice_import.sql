-- 027_invoice_import.sql: REMPIRE's old invoices from Isolta, kept as
-- history (Dim, 20.11.2026: «Import the issued ones as history»). The
-- importer is scripts/import-isolta-invoices.ts (src/lib/billing/isolta.ts).
--
-- An imported invoice is an ordinary issued invoice of ours:
--   * its number is Isolta's, as it was («1» … «422»), in the issuer's
--     series; our own numbers go on after Isolta's last one from the
--     counter Renat set (invoice_counters), which the import never touches;
--   * free = true, its period its own day: one Isolta invoice is not the
--     month's own invoice of a barber (invoices_period_idx stays free);
--   * staff_id is null: the barber's running statement and his app count
--     only what we invoiced (Isolta never recorded a payment, so every old
--     invoice would read as still owed);
--   * status 'issued' («просрочен» in the list once past its due day, as
--     in Isolta), 'paid' when Isolta had a payment date, 'credited' when an
--     imported credit invoice took it back;
--   * both parties and every line as the Finvoice file printed them; the
--     totals are Isolta's own, never counted again.
--
-- source / source_ref say where a row came from: 'ours' (null ref) or
-- 'isolta' with Isolta's own invoice id. The unique index makes the import
-- idempotent: a second run finds every row and inserts nothing twice.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table invoices add column source text not null default 'ours' check (source in ('ours', 'isolta'));
alter table invoices add column source_ref text check (source_ref is null or length(source_ref) between 1 and 64);
alter table invoices add constraint invoices_source_pair_check check ((source = 'ours') = (source_ref is null));
create unique index invoices_source_ref_idx on invoices (business_id, source, source_ref) where source_ref is not null;
