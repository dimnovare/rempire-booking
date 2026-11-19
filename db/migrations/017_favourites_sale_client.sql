-- 017_favourites_sale_client.sql: the admin's sidebar and its tiles (Dim,
-- 19.11.2026; docs/reference-looks.md, «Sidebar and tiles»).
--
-- 1. «Избранное»: the pages a login has starred, in the order they were
--    added. Each login has its own. A page is one of the admin's sections by
--    its key («clients», «services»…: src/lib/admin/favourites.ts keeps the
--    list and drops a key it does not know), never an address.
--
-- 2. «Продажа товара» in the admin is the barber's own sale (010), made for
--    him at the front desk, and it may name the client who bought. Null for
--    every sale from the barber app and for a sale with no client named.
--
-- No index on either: the favourites are read by the login's own row, and
-- nothing reads sales by client yet.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table users add column favourites text[] not null default '{}';

alter table product_sales add column client_id uuid references clients (id);
