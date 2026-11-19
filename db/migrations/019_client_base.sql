-- 019_client_base.sql: the client list in full (the owner, 19.11.2026: the
-- list gets the search, segments, filters, column chooser and every bulk
-- action of the tool we follow, mass SMS included). docs/reference-looks.md,
-- «Клиенты».
--
-- 1. users.client_columns: the columns this login keeps in the client
--    table, beside its starred pages (017). Null: never chosen, so all of
--    them. The name is always shown and is not in the list
--    (src/lib/admin/client-columns.ts keeps the keys and drops one it does
--    not know).
--
-- 2. clients.mass_sent_at: when a mass message was last queued for him;
--    null: never. The list's filter «получал рассылку» reads it. It is set
--    by src/lib/admin/client-bulk.ts together with the outbox rows (kind
--    «mass», one per channel and client, the client in client_id as for a
--    hand-written message: 018), so it still says so after the outbox is
--    cleaned.
--
-- No index on either: the columns are read by the login's own row, and the
-- list reads a salon's few thousand clients by business anyway.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table users add column client_columns text[];

alter table clients add column mass_sent_at timestamptz;
