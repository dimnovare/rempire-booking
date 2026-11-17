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
- **Created:** 17.11.2026. **Expires:** 17.11.2027.
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

Both records were added on 17.11.2026, in Dim's Cloudflare account.

| Type | Name | Value | Proxy |
|---|---|---|---|
| CNAME | `rempire-booking` | `55332b869503f557.vercel-dns-016.com` | DNS only |
| TXT | `_vercel` | `vc-domain-verify=rempire-booking.diipsolutions.eu,5cf5de1510048b887d20` | — |

- The TXT record is there because `diipsolutions.eu` is also linked to
  Dim's own Vercel account.
- If `_vercel` already has TXT records (for `rempireshop.diipsolutions.eu`),
  **add** this one beside them. Never replace them.
- After the records exist, Vercel → project → Settings → Domains →
  **Refresh** on the domain. It turns «Valid Configuration», and the TLS
  certificate follows within a minute.

## Deploying

- Every push to `main` runs CI. If it passes, the `deploy` job runs
  `vercel deploy --prod`: Vercel builds the app on its own machines and
  deploys it to the project's Production, which is staging.
  - Vercel builds it, not GitHub, because `DATABASE_URL` is a **Secret** in
    Vercel. Secrets are readable only inside Vercel's own build; `vercel
    pull` on a CI runner hands them back empty, and the migrations would
    quietly skip.
  - After `next build`, `postbuild` migrates the database and loads the
    demo data (`--build-env SEED_DEMO=yes`). If either fails, the build
    fails and the previous deployment stays live.
- Then it checks noindex on the live domain.
- To run it by hand: Actions → CI → Run workflow.
- Check by hand: `npm run check:noindex -- https://rempire-booking.diipsolutions.eu`.

## Database (Railway, 17.11.2026)

| Thing | Value |
|---|---|
| Account | the shop's Railway workspace «rempireshop's Projects» (Hobby), Dim's choice |
| Project | `rempire-booking-staging`, its own project. The shop's project «rempire» is not touched |
| Service | `Postgres` (image `postgres-ssl:18`), region EU West (Amsterdam), as the shop |
| Public access | on: TCP proxy, which sets `DATABASE_PUBLIC_URL`. Vercel needs it |
| Data | demo data only (`tools/seed-demo.mjs`). No real clients |

### Env vars in Vercel (project `rempire-booking`, Production)

| Name | Type | Put there by | Value |
|---|---|---|---|
| `DATABASE_URL` | Secret | Dim, 17.11.2026 | Railway → `rempire-booking-staging` → Postgres → Variables → `DATABASE_PUBLIC_URL` (not `DATABASE_URL`: that one is the private host, which Vercel cannot reach) |
| `DATABASE_SSL_CA` | Config | Claude, 17.11.2026 | the database's own CA certificate, PEM. Public, not a secret |
| `DB_DRIVER`, `SEED_DEMO` | — | CI, per deploy | `auto`, `yes` |
| `ALLOW_INDEXING` | — | nobody | stays unset on staging |

- Paste the Railway value as it is. Do not add `?sslmode=…`: `pg` lets the
  URL's `sslmode` replace the TLS settings the code chose.

### TLS to the database

- Railway's Postgres makes its own CA on first start; `root.key` never leaves
  the volume. Its certificate names only `localhost` and
  `postgres.railway.internal`, never the public proxy host
  (`*.proxy.rlwy.net`).
- So the code checks that the chain ends in `DATABASE_SSL_CA` and skips only
  the host name (`sslFor()` in `src/lib/db.ts` and `tools/migrate.mjs`). That
  CA signs this one database and nothing else, so the chain alone proves
  which server answered.
- Tested 17.11.2026 against the proxy, without logging in: CA without the
  name check → authorized; CA with the name check →
  `ERR_TLS_CERT_ALTNAME_INVALID`; Node's public store →
  `SELF_SIGNED_CERT_IN_CHAIN`.
- `DATABASE_SSL_NO_VERIFY=1` is not set and not needed.
- CA: `CN=root-ca`, SHA-256
  `35:0E:23:F0:F1:90:C3:ED:D0:01:5B:8E:01:B9:E2:C5:2D:33:E2:67:4C:66:90:01:4B:53:75:A5:2A:9D:41:E7`,
  expires **14.02.2029**.
- **When the connection fails with a certificate error** (the CA expired, or
  the volume was recreated), read the new CA and replace `DATABASE_SSL_CA`:
  - Railway → `rempire-booking-staging` → Postgres → Console:
    `cat /var/lib/postgresql/data/certs/root.crt`
    (`export-ssl-ca` from Railway's docs is not in this image).
  - Copy only the block from `-----BEGIN CERTIFICATE-----` to
    `-----END CERTIFICATE-----`. Never copy `root.key` or `server.key`.
