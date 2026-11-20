-- 025_mail_opened.sql: «Открыт.» on a sent invoice (Dim, decisions round
-- 10, 20.11.2026: build it). Isolta logs when the receiver opens the
-- invoice e-mail; we learn it from Resend's «email.opened» webhook
-- (src/app/api/webhooks/resend/route.ts), matched to the letter by the id
-- Resend gave it (provider_ref).
--
-- The first open only; null: not opened, or not known (open tracking off
-- for the sending domain, or a mail app that blocks images).
--
-- Never edit this file once it has run anywhere; add a new one.

alter table notifications add column opened_at timestamptz;

-- the webhook finds the letter by Resend's id
create index notifications_provider_ref on notifications (provider, provider_ref) where provider_ref is not null;
