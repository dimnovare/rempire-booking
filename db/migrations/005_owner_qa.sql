-- Renat's questions page (/ru/q/<token>): answers save as he types, and
-- every change is kept, so a later addition never overwrites what he said
-- first. The link's token is stored only as its SHA-256 (hex).
-- 005 because the admin branch already uses 003 and 004.

create table qa_forms (
  id          uuid primary key,
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label       text not null,
  created_at  timestamptz not null default now()
);

-- The current answer to each field («commission.vat», «extra.note»…).
create table qa_answers (
  form_id     uuid not null references qa_forms (id) on delete cascade,
  field       text not null check (field ~ '^[a-z_]{1,30}\.[a-z_]{1,30}$'),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (form_id, field)
);

-- Every value a field has had, oldest first.
create table qa_answer_log (
  id          bigserial primary key,
  form_id     uuid not null references qa_forms (id) on delete cascade,
  field       text not null,
  value       jsonb not null,
  saved_at    timestamptz not null default now()
);
create index qa_answer_log_form on qa_answer_log (form_id, saved_at);
