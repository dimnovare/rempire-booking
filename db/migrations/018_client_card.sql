-- 018_client_card.sql: the client's card in full (the owner, 19.11.2026: the
-- card gets every field of the tool we follow, and seven of its nine tabs:
-- not loyalty, not accounts). docs/reference-looks.md, «Клиенты».
--
-- 1. More fields on a client. Every column that was there stays.
--
--    The birthday is three numbers, not a date: the year may be unknown
--    («14.03»), and a date cannot say that. Day and month come together;
--    the year is null when nobody knows it. 29 February is allowed here;
--    whether that year had one is checked by src/lib/admin/clients.ts.
--
--    discount_pct is stored and shown only. It changes no price anywhere:
--    not a booking's total, not a product sale, not an invoice.
--
--    no_online: an online booking with this client's phone (either of the
--    two) is refused (src/lib/booking.ts); the staff can still book him.
--
--    marketing_opt_out is kept for the day we send advertising; today
--    nothing reads it. push_opt_out joins sms_opt_out and email_opt_out
--    (001): the channels he accepts. notify_off lists the kinds of message
--    he does not want («confirmation», «reminder», «moved», «cancelled»:
--    src/lib/client-notify.ts); the outbox queues none of them for him.
--
-- 2. client_photo: his picture, kept as staff_photo (007) keeps a barber's:
--    in the database, shrunk by the browser first. Unlike a barber's it is
--    never public: only /admin/clients/<id>/photo serves it, to a login.
--
-- 3. client_comments: the dated history beside the one shared note
--    (clients.staff_note stays as «Примечание»). Who wrote is kept by id
--    and by name, so a comment still says who after a login is gone.
--
-- 4. client_files: a client's papers, in the database: 5 MB each and 20 a
--    client at most, nine kinds (src/lib/admin/client-card.ts checks the
--    extension, the declared type and the first bytes). Never public: only
--    /admin/clients/<id>/files/<file id> serves one, to a login, as a
--    download.
--
-- 5. notifications.client_id: a message written by hand on the card
--    (kind «manual») belongs to no visit, so it names its client here.
--    Rows about a visit keep finding their client through the visit.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table clients
  add column phone2_e164       text check (phone2_e164 is null or phone2_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  add column birth_day         smallint,
  add column birth_month       smallint,
  add column birth_year        smallint,
  add column gender            text check (gender is null or gender in ('male', 'female')),
  add column importance        text check (importance is null or importance in ('bronze', 'silver', 'gold')),
  add column card_no           text not null default '' check (length(card_no) <= 40),
  add column discount_pct      smallint not null default 0 check (discount_pct between 0 and 100),
  add column no_online         boolean not null default false,
  add column marketing_opt_out boolean not null default false,
  add column push_opt_out      boolean not null default false,
  add column notify_off        text[] not null default '{}';

alter table clients add constraint clients_birthday_check check (
  (birth_day is null and birth_month is null and birth_year is null)
  or (
    -- day and month come together (a null would let the rest of this pass unread)
    birth_day is not null and birth_month is not null
    and birth_month between 1 and 12
    and birth_day between 1 and (case when birth_month = 2 then 29 when birth_month in (4, 6, 9, 11) then 30 else 31 end)
    and (birth_year is null or birth_year between 1900 and 2100)
  )
);

create table client_photo (
  client_id  uuid primary key references clients (id) on delete cascade,
  -- image/jpeg, image/png or image/webp, told from the first bytes
  mime       text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes      bytea not null check (octet_length(bytes) between 1 and 600000),
  updated_at timestamptz not null default now()
);

create table client_comments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  client_id   uuid not null references clients (id) on delete cascade,
  author_id   uuid references users (id) on delete set null,
  author_name text not null default '' check (length(author_name) <= 120),
  body        text not null check (length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index client_comments_client_idx on client_comments (client_id, created_at desc);

create table client_files (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses (id),
  client_id     uuid not null references clients (id) on delete cascade,
  -- the name it came with, cleaned: no path, no control characters
  name          text not null check (length(name) between 1 and 200),
  mime          text not null check (mime in (
                  'image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain',
                  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  size          int not null check (size between 1 and 5242880),
  bytes         bytea not null check (octet_length(bytes) between 1 and 5242880),
  uploaded_by   uuid references users (id) on delete set null,
  uploaded_name text not null default '' check (length(uploaded_name) <= 120),
  created_at    timestamptz not null default now()
);
create index client_files_client_idx on client_files (client_id, created_at);

alter table notifications add column client_id uuid references clients (id) on delete set null;
create index notifications_client_idx on notifications (client_id) where client_id is not null;
