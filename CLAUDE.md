# REMPIRE Booking

Start with **`docs/kickoff.md`**. Logos, fonts and colours are in
**`docs/brand.md`**. It records the decisions made so far, the
accounts that already exist, what Altegio does today, the open questions and
the proposed phases. The questions for Renat are in
`docs/questions-for-renat.ru.md`, in Russian.

## People

- **Dim** (Diip Solutions, info@diipsolutions.eu) builds this.
  - Write to him in English, short and direct.
  - He works from his phone a lot. When there are several decisions to make,
    put them on one tappable Artifact page with a `db` capability and read
    the answers back with `ArtifactData`.
- **Renat** owns REMPIRE: a barbershop and tattoo studio at Mardi 1, Tallinn,
  plus the online shop rempireshop.com.
  - He speaks Russian and is not technical. Anything meant for him is plain
    Russian, mobile-first.
  - Dim forwards messages himself. Never send anything to Renat.
- **Barbers:** five today. Each one invoices through their own FIE or OÜ.

## What we are building

A booking system for rempire.ee to replace **Altegio**, with these parts:

- client booking;
- an admin for Renat (barbers, services, schedules, calendar);
- a PWA for each barber (their day, confirmations, vacations, notifications);
- a way for barbers to sell rempireshop products (with a 17 % commission);
- invoices to barbers, replacing **Isolta**;
- e-mail and SMS reminders.

Languages: RU, ET, EN.

It is built and shown first on Dim's domain (`*.diipsolutions.eu`, noindex),
then moved to rempire.ee.

Goal: as simple as Altegio or Fresha. Copy their flows and features freely.

- **The client booking looks and works as REMPIRE's Altegio widget does
  today** (Renat and Dim, 19.11.2026): the same colours, layout and order of
  steps, in our own code, icons and texts. See `docs/client-flow.md` and
  `docs/brand.md`, «Booking look».
- **The admin and the barber app follow Altegio's admin** (Dim, 19.11.2026):
  a dark frame, light pages, yellow for the main action, the calendar in
  its journal's colours. Invoices follow Isolta. See
  `docs/reference-looks.md`.
- Never Altegio's, Fresha's or Isolta's logo, name, texts or «Powered by».

## Hard rules

- **The shop is live.** It is `C:\Users\Dmitri.MARKIT\source\repos\rempire-web`
  (Next.js on Vercel + Postgres on Railway).
  - Read it freely.
  - Change it only on a branch, and push only with Dim's explicit OK: a push
    to `main` deploys the live shop.
  - Never write to the shop's production database, admin or settings without
    Dim's OK.
  - Never open its `.env*` files.
- **Altegio is the live booking system.** Walk its flows only up to the client
  details form. Never press «Book» or «Записаться», and never cancel or move
  anything.
- **No secrets.** No passwords, API keys or tokens in files, commits or chat.
  Write env var names only; Dim or Renat put the values into Vercel or Railway.
- **No real client data in the repo.** Clients' names and phones stay out;
  tests and seeds use fake data.
- **Telegram:** never touch `@rempireshop_bot`; it sends the shop's order
  pings.
- **Staging stays noindex** (meta, robots.txt and X-Robots-Tag) until it
  moves to rempire.ee.
  - All three read one switch, `src/lib/indexing.ts`. Only
    `ALLOW_INDEXING=yes`, set at the move, turns indexing on.
  - Run `npm run check:noindex -- <url>` after every staging deploy.

## Code

- **Next.js 16.4** (App Router, Turbopack, Cache Components), React 19.3,
  Tailwind 4, Vitest 5.
  - Read `AGENTS.md` before writing Next code. Its APIs differ from older
    versions; the docs for this exact version are in
    `node_modules/next/dist/docs/`.
- **Commands:**
  - `npm run dev`: port 3400. The shop uses 3300.
  - `npm test`
  - `npm run e2e`: Playwright, the barber app at phone width, on its own
    server (port 3420, fake data). `E2E_PROD=yes` after `npm run build`
    for the production build and offline. See `playwright.config.ts`.
  - `npm run typecheck`: runs `next typegen` first, for the global
    `LayoutProps` / `PageProps` types.
  - `npm run build`
  - `npm run check:noindex -- <url>`
- **Database:** plain SQL migrations + `pg`, as in the shop (Dim, 17.11).
  The draft schema is `docs/data-model.md`.
- **Repo:** `dimnovare/rempire-booking`, private.
