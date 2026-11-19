-- A free invoice (Dim, 19.11.2026). Renat's whole routine in Isolta is «new
-- invoice → pick who gets it», several a month to one receiver if he likes.
--
-- The month's own invoice stays one per receiver and month: the rent and the
-- sales go into one place (invoices_period_idx). A free one stands beside it:
-- its period is the day it was made, and it carries only the lines typed into
-- it, never the rent or a sale.
alter table invoices add column free boolean not null default false;

drop index invoices_period_idx;
create unique index invoices_period_idx on invoices (receiver_id, period_from)
  where kind = 'invoice' and not free and status in ('draft', 'issued', 'paid');
