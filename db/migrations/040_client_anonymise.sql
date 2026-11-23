-- 040_client_anonymise.sql: «Обезличить клиента», for a client who asks to
-- be erased but has a history (visits, product sales, clients merged into
-- him), which deleting refuses (src/lib/admin/clients.ts, deleteClient). The
-- privacy policy promises it (src/lib/privacy-content.ts): his visits are
-- not erased, his name and contacts are.
--
-- 1. clients.anonymised_at: when he was anonymised (anonymiseClient in
--    src/lib/admin/clients.ts). His row stays, so his visits, sales and the
--    barbers' invoices keep their client; everything on it that says who he
--    is goes. The name cannot be empty (001), so it becomes one fixed mark,
--    «—» (src/lib/client-anon.ts), and every page shows it as «Обезличенный
--    клиент» in the reader's own language. The check below holds an
--    anonymised row to that: no name, no phone, no e-mail, no birthday, no
--    note, no card number, no category, no key of the old tool. A client
--    who is anonymised is in no list, no search and no mass message.
--
-- 2. notifications.recipient may be '' (no more than that): a message that
--    went to him keeps its row in «Сообщения» (when, which kind, its
--    status, what it cost), but no longer his phone or his address.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table clients add column anonymised_at timestamptz;

alter table clients add constraint clients_anonymised_check check (
  anonymised_at is null
  or (
    name = '—'
    and phone_e164 is null
    and phone2_e164 is null
    and email is null
    and birth_day is null
    and birth_month is null
    and birth_year is null
    and staff_note = ''
    and card_no = ''
    and labels = '{}'
    and altegio_id is null
  )
);

alter table notifications drop constraint notifications_recipient_check;
alter table notifications add constraint notifications_recipient_check check (recipient = '' or length(recipient) between 3 and 254);
