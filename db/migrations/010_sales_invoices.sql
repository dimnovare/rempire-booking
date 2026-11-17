-- 010_sales_invoices.sql: barbers sell shop products, REMPIRE invoices the
-- barbers (Phase C; docs/phase-c.md, docs/data-model.md § Phase C).
--
-- Rules for every table here:
--   * money is integer cents (EUR) and rates are basis points (2400 = 24 %,
--     1700 = 17 %); never floats;
--   * an amount a barber pays carries its VAT inside (gross); the net and
--     VAT parts are split per line at the line's rate (src/lib/money.ts);
--   * nothing is deleted. A sale tapped by mistake is undone within a few
--     minutes (status 'undone', it never reaches the shop); after that a
--     wrong sale is reversed by a minus row (reverses_id). A draft invoice
--     is discarded, never deleted. An issued invoice is never edited: a
--     correction is a credit invoice (kind 'credit', credit_of);
--   * an invoice number is handed out only at «Выставить», from
--     invoice_counters, never for a draft.
--
-- The shop stays the one place for products, prices and stock: a sale keeps
-- what was sold at the price of that moment, and the shop's own ids
-- (shop_product_id + shop_variant, the shop's stock_levels key), never a
-- catalogue of its own.
--
-- Never edit this file once it has run anywhere; add a new one.

-- REMPIRE's company (or companies) on the invoice. One is the default.
create table invoice_issuers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  legal_name  text not null check (length(legal_name) between 1 and 160),
  reg_code    text not null default '' check (length(reg_code) <= 20),
  -- KMKR number; empty = not VAT-registered, so its invoices carry no VAT
  vat_number  text not null default '' check (length(vat_number) <= 20),
  -- the VAT rate it charges when VAT applies
  vat_bp      int not null default 2400 check (vat_bp between 0 and 10000),
  address     text not null default '' check (length(address) <= 300),
  email       text not null default '' check (length(email) <= 254),
  phone       text not null default '' check (length(phone) <= 40),
  iban        text not null default '' check (length(iban) <= 42),
  bank_name   text not null default '' check (length(bank_name) <= 80),
  -- the number: prefix, then (if yearly) the year and a dash, then the
  -- serial padded to `digits`: «RB2026-0042», «1045»
  prefix      text not null default '' check (prefix ~ '^[A-Za-z0-9/-]{0,12}$'),
  digits      int not null default 0 check (digits between 0 and 8),
  yearly      boolean not null default false,
  -- one line printed under the totals of every invoice (a contract, a note)
  note        text not null default '' check (length(note) <= 300),
  is_default  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index invoice_issuers_default_idx on invoice_issuers (business_id) where is_default;

-- Who an invoice goes to: a barber's FIE or OÜ, or a person. Decision 13:
-- each receiver has its own VAT setup.
create table invoice_receivers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  -- the barber it bills; null for anyone else
  staff_id    uuid references staff (id),
  -- the company that invoices it; null = the default issuer
  issuer_id   uuid references invoice_issuers (id),
  kind        text not null default 'fie' check (kind in ('person', 'fie', 'ou')),
  legal_name  text not null check (length(legal_name) between 1 and 160),
  reg_code    text not null default '' check (length(reg_code) <= 20),
  vat_number  text not null default '' check (length(vat_number) <= 20),
  address     text not null default '' check (length(address) <= 300),
  email       text not null default '' check (length(email) <= 254),
  -- 'vat': the issuer's VAT applies; 'none': no VAT on its invoices
  vat_mode    text not null default 'vat' check (vat_mode in ('vat', 'none')),
  terms_days  int not null default 7 check (terms_days between 0 and 120),
  -- the letter's language; the PDF is Estonian with English (and Russian) lines
  locale      text not null default 'et' check (locale in ('ru', 'et', 'en')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- a barber's sales and rent go to his one active receiver
create unique index invoice_receivers_staff_idx on invoice_receivers (staff_id) where active and staff_id is not null;

-- A barber's chair rent from a date on. A change is a new row from its own
-- date, so an old month keeps its rent; the row in force on the 1st of a
-- month is that month's rent.
create table chair_rents (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses (id),
  staff_id     uuid not null references staff (id),
  amount_cents int not null check (amount_cents between 0 and 10000000),
  -- monthly only, until Isolta shows anything else
  period       text not null default 'month' check (period in ('month')),
  valid_from   date not null,
  created_by   uuid references users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (staff_id, valid_from)
);

-- What a barber sold from his app (C3), or what Renat corrected.
create table product_sales (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses (id),
  -- minted on the phone before the first send: the same sale sent twice is
  -- one row here and one order in the shop (its idempotency key there)
  ref              text not null unique check (ref ~ '^[A-Za-z0-9_-]{8,64}$'),
  staff_id         uuid not null references staff (id),
  -- client: to a client at the shop price, 17 % to the barber;
  -- self: for himself, at the purchase price, no commission (decision 16)
  mode             text not null check (mode in ('client', 'self')),
  shop_product_id  text not null check (length(shop_product_id) between 1 and 120),
  shop_variant     text not null default '' check (length(shop_variant) <= 120),
  name             text not null check (length(name) between 1 and 200),
  barcode          text check (barcode is null or length(barcode) <= 64),
  -- a minus row has a negative qty
  qty              int not null check (qty <> 0 and qty between -99 and 99),
  -- per unit, what the barber owes for it, VAT inside
  unit_cents       int not null check (unit_cents between 0 and 10000000),
  -- the shop's price that moment, VAT inside (= unit_cents for a client sale)
  list_cents       int not null check (list_cents between 0 and 10000000),
  -- self: the shop's purchase price (VAT not inside) it came from
  purchase_cents   int check (purchase_cents is null or purchase_cents between 0 and 10000000),
  vat_bp           int not null check (vat_bp between 0 and 10000),
  -- the 17 % and what it was taken from (Renat Q1; settings.commission_basis)
  commission_bp    int not null default 0 check (commission_bp between 0 and 10000),
  commission_basis text check (commission_basis is null or commission_basis in ('net-paid', 'gross-paid', 'gross-list')),
  -- the barber's share, for the whole row (signed like qty)
  commission_cents int not null default 0,
  -- qty × unit_cents (signed)
  total_cents      int not null,
  -- a minus row: the sale it takes back (one per sale)
  reverses_id      uuid references product_sales (id),
  note             text not null default '' check (length(note) <= 300),
  -- 'undone': taken back by the barber within the undo window
  status           text not null default 'done' check (status in ('done', 'undone')),
  undone_at        timestamptz,
  -- the trip to the shop: queued → sending → synced; failed after the last
  -- try; 'none' for rows the shop never hears about (minus rows, undone)
  sync_status      text not null default 'queued' check (sync_status in ('queued', 'sending', 'synced', 'failed', 'none')),
  -- not sent before the undo window is over
  sync_after       timestamptz not null default now(),
  sync_attempts    int not null default 0,
  sync_locked      timestamptz,
  sync_error       text,
  shop_order_ref   text,
  synced_at        timestamptz,
  created_by       uuid references users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index product_sales_staff_idx on product_sales (staff_id, created_at desc);
create index product_sales_business_idx on product_sales (business_id, created_at desc);
create index product_sales_sync_idx on product_sales (sync_after) where sync_status in ('queued', 'sending');
create unique index product_sales_reverses_idx on product_sales (reverses_id) where reverses_id is not null;

create table invoices (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses (id),
  issuer_id    uuid not null references invoice_issuers (id),
  receiver_id  uuid not null references invoice_receivers (id),
  staff_id     uuid references staff (id),
  kind         text not null default 'invoice' check (kind in ('invoice', 'credit')),
  credit_of    uuid references invoices (id),
  -- draft → issued → paid; credited when a credit invoice took it back
  -- (paid_at still says whether its money came); discarded: a draft Renat
  -- threw away
  status       text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'credited', 'discarded')),
  -- null while a draft: handed out at «Выставить»
  number       text check (number is null or length(number) between 1 and 40),
  -- the month it bills, first and last day
  period_from  date not null,
  period_to    date not null check (period_to >= period_from),
  issued_on    date,
  due_on       date,
  -- both parties as printed, frozen at «Выставить»
  seller       jsonb,
  buyer        jsonb,
  locale       text not null default 'et' check (locale in ('ru', 'et', 'en')),
  net_cents    int not null default 0,
  vat_cents    int not null default 0,
  gross_cents  int not null default 0,
  note         text not null default '' check (length(note) <= 300),
  sent_at      timestamptz,
  paid_at      timestamptz,
  created_by   uuid references users (id) on delete set null,
  issued_by    uuid references users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((status = 'draft' or status = 'discarded') = (number is null)),
  check ((kind = 'credit') = (credit_of is not null))
);
create unique index invoices_number_idx on invoices (issuer_id, number) where number is not null;
-- one live invoice per receiver and month; a credited one makes room for the next
create unique index invoices_period_idx on invoices (receiver_id, period_from) where kind = 'invoice' and status in ('draft', 'issued', 'paid');
create unique index invoices_credit_idx on invoices (credit_of) where credit_of is not null;
create index invoices_business_idx on invoices (business_id, period_from desc);

create table invoice_lines (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references invoices (id),
  position       int not null check (position between 0 and 999),
  kind           text not null check (kind in ('rent', 'product', 'self', 'other')),
  text           text not null check (length(text) between 1 and 200),
  qty            int not null check (qty <> 0 and qty between -999 and 999),
  -- per unit, VAT inside
  unit_cents     int not null check (unit_cents between -10000000 and 10000000),
  -- the 17 % on a client sale: less to pay, VAT inside (signed like qty)
  discount_cents int not null default 0,
  vat_bp         int not null check (vat_bp between 0 and 10000),
  gross_cents    int not null,
  net_cents      int not null,
  vat_cents      int not null,
  sale_id        uuid references product_sales (id),
  -- a rent line: the month it bills (its first day)
  rent_month     date,
  -- taken off a draft by Renat: not printed, not counted, its sale or month
  -- free for the next invoice (a line is never deleted)
  dropped        boolean not null default false,
  unique (invoice_id, position)
);
create index invoice_lines_sale_idx on invoice_lines (sale_id) where sale_id is not null;
create index invoice_lines_rent_idx on invoice_lines (rent_month) where rent_month is not null;

-- The last number handed out, per issuer and year (year 0: a series that
-- does not start again each year). One `insert … on conflict do update …
-- returning` hands out the next one, so two invoices issued at once never
-- share a number and none is skipped (the shop's 141_invoices.sql).
create table invoice_counters (
  issuer_id uuid not null references invoice_issuers (id),
  year      int not null check (year = 0 or year between 2000 and 2999),
  last      int not null default 0 check (last >= 0),
  primary key (issuer_id, year)
);
