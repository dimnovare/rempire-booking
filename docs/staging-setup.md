# Staging setup

*17.11.2026. Staging is `https://rempire-booking.diipsolutions.eu`,
deployed by GitHub Actions to Rempire's Vercel team (Dim's choice,
kickoff §2).*

## Why a token

- Rempire's Vercel team signs in as GitHub `rempireshop` (shop
  `docs/accounts.md`).
- Dim's own Vercel login is not a member. On Pro, a member is a paid seat.
- So CI deploys with one token created on the team's account. It is kept
  only in this repo's GitHub secrets.

## What exists (17.11.2026)

| Thing | Where | Value |
|---|---|---|
| Vercel project | team `rempire` (Pro) | `rempire-booking`, created empty in the dashboard |
| Project ID | GitHub repo variable `VERCEL_PROJECT_ID` | `prj_nLKAnNmLgDACTJI8UA4wWWMPXq30` |
| Team ID | GitHub repo variable `VERCEL_ORG_ID` | `team_WrOxPphbwEkqCmwaiqi26mks` |
| Domain | the project's Production | `rempire-booking.diipsolutions.eu` |
| Region | `vercel.json` | `fra1`, as the shop |

IDs are not secrets. The token is.

## The token

- **Name:** `rempire-booking-ci`.
- **Scope:** the `rempire-booking` project only, not the whole team. It
  cannot touch the shop's `rempire-web`.
- **Expires:** 17.11.2027.
- **Created by Dim:** Vercel → Account Settings → Tokens → Create. Vercel
  shows it only once.
- **Stored by Dim:** GitHub → this repo → Settings → Secrets and variables
  → Actions → New secret.
  - Name `VERCEL_TOKEN`:
    <https://github.com/dimnovare/rempire-booking/settings/secrets/actions/new>
  - Nobody else types or reads the value: not Claude, not chat, not a file.
- **On expiry or a leak:**
  - delete it in Vercel;
  - create a new one with the same scope;
  - replace the secret.

## DNS (Cloudflare, zone `diipsolutions.eu`)

| Type | Name | Value | Proxy |
|---|---|---|---|
| CNAME | `rempire-booking` | `55332b869503f557.vercel-dns-016.com` | DNS only |
| TXT | `_vercel` | `vc-domain-verify=rempire-booking.diipsolutions.eu,5cf5de1510048b887d20` | — |

- The TXT record is there because `diipsolutions.eu` is also linked to
  Dim's own Vercel account.
- If `_vercel` already has TXT records (for `rempireshop.diipsolutions.eu`),
  **add** this one beside them. Never replace them.

## Deploying

- Every push to `main` runs CI. If it passes, the `deploy` job builds with
  `vercel build` and deploys to the project's Production, which is
  staging.
- Then it checks noindex on the live domain.
- To run it by hand: Actions → CI → Run workflow.
- Check by hand: `npm run check:noindex -- https://rempire-booking.diipsolutions.eu`.

## Not yet

- **Database:** a project of its own on the shop's Railway account (Dim's
  choice). It comes with the first migration in Phase A.
  - Its `DATABASE_URL` goes into Vercel by hand, by Dim or Renat.
- **Env vars:** none needed yet. `ALLOW_INDEXING` stays unset on staging.
