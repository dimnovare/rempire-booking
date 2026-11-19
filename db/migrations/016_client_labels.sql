-- 016_client_labels.sql: client categories (Dim, decisions round 8,
-- 19.11.2026: build Altegio's «Клиенты» now, «a list of every client with
-- phone, visit history, notes and categories»).
--
-- A category is a free word the salon types itself: «VIP», «дети». A
-- client has as many as needed, in the order they were added. No table of
-- their own: the list to pick from is the words in use
-- (src/lib/admin/clients.ts cleans them: trimmed, at most 30 characters,
-- no word twice, at most 12 a client).
--
-- No index: a salon's clients are a few thousand rows, and the list reads
-- them by business anyway. The import from Altegio will fill the same
-- column later.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table clients add column labels text[] not null default '{}';
