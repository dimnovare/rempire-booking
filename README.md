# REMPIRE Booking

Online booking for REMPIRE (Mardi 1, Tallinn). It replaces Altegio for
booking and Isolta for invoices to barbers.

- Client booking, Renat's admin, a PWA for each barber.
- Barbers sell rempireshop.com products, with a 17 % commission.
- Invoices to the barbers' companies.
- E-mail and SMS reminders.
- RU, ET, EN.

Staging: `rempire-booking.diipsolutions.eu`, kept out of search engines.
Later it moves to rempire.ee.

## Start here

- `docs/kickoff.md`: the decisions, the accounts, the phases.
- `docs/data-model.md`: the draft schema.
- `docs/client-flow.md`: the booking screens and taps.
- `CLAUDE.md`: the rules for working in this repo.

## Run it

```bash
npm install
npm run dev        # http://localhost:3400
npm test
npm run typecheck
```

Env var names are in `.env.example`. The values live in Vercel only.
