# Staging setup

*17.11.2026. Staging is `https://rempire-booking.diipsolutions.eu`,
deployed by GitHub Actions to Rempire's Vercel team (Dim's choice,
kickoff §2).*

## Why a token

- Rempire's Vercel team signs in as GitHub `rempireshop` (shop
  `docs/accounts.md`).
- Dim's own Vercel login is not a member. On Pro, a member is a paid seat.
- So CI deploys with one token created on the team's account, kept only in
  this repo's GitHub secrets.

## One-time steps

1. **Create the token** (Dim, signed in to Vercel as the Rempire team):
   - Account Settings → Tokens → Create.
   - Name `rempire-booking-ci`.
   - Scope: the **Rempire** team.
   - Expiration: **1 year**. Write the expiry date below.
   - Copy it. Vercel shows it only once.
2. **Save it in GitHub** (Dim):
   - Open <https://github.com/dimnovare/rempire-booking/settings/secrets/actions/new>.
   - Name `VERCEL_TOKEN`, then paste the value.
   - Nobody else types or reads the value: not Claude, not chat, not a file.
3. **Run the deploy:**
   - Actions → CI → Run workflow, or push to `main`.
   - The first run creates the Vercel project `rempire-booking`, deploys it
     and adds the domain.
   - Its «Staging domain and its DNS» step prints the DNS record Vercel
     wants.
4. **DNS** (Cloudflare, zone `diipsolutions.eu`):
   - Add a CNAME `rempire-booking` with the value that step printed.
   - Proxy **off** («DNS only»), as for the shop's records.
5. **Check:**
   - The next run's «noindex on staging» step must say `noindex OK`.
   - By hand: `npm run check:noindex -- https://rempire-booking.diipsolutions.eu`.

If the team's slug is not `rempire`, set it as a repo variable instead of
changing the workflow: Settings → Secrets and variables → Actions →
Variables → `VERCEL_SCOPE`.

## What the token can reach

A Vercel token is scoped to a whole team, so this one can also reach the
shop's project `rempire-web`.

- It lives only in this private repo's secrets.
- Only the `deploy` job uses it, on pushes to `main`. Pull requests never
  see it.
- Anyone with push access to this repo can therefore deploy to the Rempire
  team. Today that is Dim only.
- When it expires, or if it leaks:
  - delete it in Vercel (Account Settings → Tokens);
  - create a new one;
  - replace the GitHub secret.

| Token | Created | Expires |
|---|---|---|
| `rempire-booking-ci` | | |

## Not yet

- **Database:** a project of its own on the shop's Railway account (Dim's
  choice). It comes with the first migration in Phase A.
  - Its `DATABASE_URL` goes into Vercel by hand, by Dim or Renat.
- **Env vars:** none needed yet. `ALLOW_INDEXING` stays unset on staging.
