-- 048_user_delete.sql: «Доступ» → «⋯» → «Удалить вход» (Dim, 25.11.2026,
-- design artifact 53PfD3DxCRkbDyjwLVvBHB). A deleted login leaves the list
-- and can never log in again, but its row stays: visits, sales, invoices,
-- requests and the change history point at it and keep its name.
--
--   users.deleted_at   when it was deleted; null: a login in the list.
--   users.deleted_was  what deleting took away, to put back on «Вернуть»
--                      (the toast, src/lib/auth/login.ts → restoreUser):
--                      {email, google_sub, active}.
--
-- Deleting frees the e-mail for a new login: the row's `email` becomes
-- «deleted-<id>@deleted.invalid» (unique, and no code or password ever
-- reaches it), `google_sub` is cleared, `active` is false and its sessions
-- end. Every list of logins asks `deleted_at is null`.
--
-- Never edit this file once it has run anywhere; add a new one.

alter table users add column deleted_at timestamptz;
alter table users add column deleted_was jsonb;
alter table users add constraint users_deleted_ck check ((deleted_at is null) = (deleted_was is null));
