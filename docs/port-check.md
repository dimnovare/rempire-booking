# Port check: what Altegio and Isolta have, what REMPIRE used, what we have

*Dim, 20.11.2026: «Check the live Altegio again and live Isolta again and make
sure that each functionality that was used should/could be ported to us as
well. If something is unknown or unclear, ask (or we ask Renat).»*

Sources: the re-scans of 20.11.2026 (`docs/altegio-pages.md` part 4,
`docs/isolta-pages.md` part 3; both looking only, no writes) and our code as
of commit 9b2d675. Figures are the salon's own totals, never a client's.

**Verdict:** ✅ we have it · ➕ to build · ❓ to decide (Dim) or to ask
(Renat) · — not used there, not carried over.

## Altegio (last 30 days unless said)

### Daily work

| Function | Used at REMPIRE | Ours | Verdict |
|---|---|---|---|
| Journal: day, week, visit window, new visit, time off | 762 visits | built in Altegio's look | ✅ |
| Visit statuses | 88 % stay «Ожидание», 12 % «Пришёл», none «Не пришёл» | four chips, «Подтвердил» as a flag | ✅ |
| Payment of a visit (cash / card), which writes the finance entries | 81 payments, **all from Jevgeni's login**; the other four barbers record none | not built (decision 29: small, after Renat's answer) | ❓ Renat |
| «Записи» (every visit in one table) | used | built | ✅ |
| Booking from Altegio's staff phone app | **21 %** of bookings | the barber app books (`/b`, book sheets) | ✅ every barber needs our app before the switch |
| Online booking widget | **65 %** of bookings | built in the widget's look | ✅ |
| — its settings | step 30 min «Оптимальный»; no minimum notice; clients move and cancel online with no limit; «Любой специалист» on; name and phone required, comment and e-mail optional; no SMS code | copied 20.11: 30 min from the barber's start plus a start where a visit ends, no notice, in the booking and the barber app | ✅ (round 10) |
| Altegio.me client app | **12 %** of bookings | our booking page (can be saved to the home screen) | ✅ at the switch; ❓ Renat (his page, «app») |
| Google Maps «Book online» | on | at the switch our link goes into the Google Business Profile | ✅ planned |
| Altegio.me MCP (clients book from AI assistants) | installed, 0 changes by it | — | — (decided 19.11) |

### Clients, staff, services

| Function | Used | Ours | Verdict |
|---|---|---|---|
| Client base and card | 3 207 clients | built, all fields, 7 tabs, bulk actions | ✅ import from Renat's export |
| Categories, importance classes, auto-labels, discounts | defaults only | labels | — |
| Reviews | **51 in 12 months**, newest 20.11, though review requests are off | built 20.11: ★ and count per barber on the booking page, «Отзывы» with «Скрыть», an importer (names masked on staging) | ✅ (round 10); the import itself is still to run |
| Staff list and work schedule | 5 barbers; 500 shift hours 1–20.11 | built | ✅ |
| Rights per person | tuned per barber | 213 switches per login | ✅ |
| Positions, leave types | empty / system types | — | — |
| Salaries (8 pages) | nothing set | — | — |
| Services | 1 category, 12 services, names in EN and ET | built, RU / ET / EN | ✅ |

### Messages (1 853 a month: 596 SMS, 1 094 e-mail, about 163 push)

| Message | Altegio | Ours | Verdict |
|---|---|---|---|
| Reminder by SMS, 2 h before | on | on (120 min) | ✅ |
| Reminder by e-mail, 12 h before | on | built 20.11 | ✅ |
| Booking made (widget or journal), e-mail and app | on | e-mail with the visit and an .ics | ✅ |
| Booking moved | — | e-mail | ✅ (ours is extra) |
| Booking cancelled | on | e-mail | ✅ |
| Booking confirmed by the salon (the feed's ✓) | on, but the ✓ was never pressed (35 692 unconfirmed) | — | — |
| Birthday greeting, 10:00 | **on** | built 20.11: e-mail and push, SMS only if neither went | ✅ (round 10) |
| «Come back» after a no-show (type 72) | **on** | built 20.11: e-mail, push, SMS, 2 min after «Не пришёл» | ✅ (round 10) |
| Review request 3 h after | off | — | ❓ Renat (his page, «reviews») |
| Discount new / ending, schedule ending | off | — | — |
| To the barber: new booking, cancellation | on (app, e-mail) | push to the barber | ✅ |
| To the admin: online cancellation | on | push to the owner | ✅ |

### Reports and dashboards

| Page | Used | Ours | Verdict |
|---|---|---|---|
| «Визиты»: today's upcoming visits and the booking feed (the reports' landing) | automatic | built 20.11, `/admin/dashboard` | ✅ (round 10) |
| «Основные показатели»: sales, attendance, fill rate, with charts | data every month | built 20.11, `/admin/analytics`; sales are visit prices, as no payments are recorded | ✅ (round 10) |
| «Сообщения» | data | built 20.11, `/admin/messages`: every SMS, letter and notification, with its status, channel and carrier; contacts masked without «Показывать номера телефонов в сообщениях» | ✅ (decision 29) |
| «Изменения данных» (change log) | 1 097 entries in two months | built 20.11, `/admin/changes` (owner only): the audit table, before → after field by field | ✅ (decision 29) |
| Client, staff, service, fill-rate, finance, P&L and till reports | data (automatic) | — | ❓ Renat (his question «Касса, отчёты и скидки») |
| Events, promotions, calls, stock reports | empty | — | — |

### Not used at REMPIRE (not carried over)

Stock and goods operations; online payments, payment policy, deposits;
suppliers and own payment items; salaries; loyalty cards, certificates,
abonements, client accounts, promotions (the referral flag is on, but both
of its promos are «Не применять»); resources; telephony; webhooks and API
keys; group bookings; personal domain; branded app; chain plans and custom
fields. The chain «Chain Rempire» has one location (❓ Renat: is a second
one, the tattoo studio, planned?).

### Licence

€92.99 a month (5 staff), active to **04.12.2026**, renews by itself on
**02.12.2026**. Dim, round 10: switch before 2 December (Renat asked on his
page).

## Isolta

| Function | Used at REMPIRE | Ours | Verdict |
|---|---|---|---|
| Issue invoices | 422 since 2020, 6–7 a month (12 in August), newest #422 of 10.11 | built; the 422 imported as history at the switch (`scripts/import-isolta-invoices.ts`, Isolta's data export) | ✅ the series goes on at **423** (the last number is set once at the switch) |
| Drafts | 58 (5–12 a year) | built | not imported; ❓ Renat (his page, «drafts») |
| Send by e-mail | the only way: 130 sends, 129 «Открыт.» | built (send, send again) | ✅ |
| «Opened» mark on a sent invoice | shown in the action log | built 20.11: Resend webhook, a line in the invoice's events | ✅ once open tracking and `RESEND_WEBHOOK_SECRET` are set |
| E-invoices, printing service | not activated | — | — |
| Payments | **never recorded**: all 422 stand as overdue | «Платежи» built, hidden (round 10, `PAYMENTS_SHOWN`) | ❓ Renat (his page, «paid») |
| Reminders | none | — (decided) | — |
| Credit invoices | none since 2020 | built | ✅ |
| Note, attachments, detail fields, default texts | empty | — | — |
| Lines | one free-text line («teenused»), qty 1, no VAT | free text, services, shop goods | ✅ |
| Payment terms | 5 or 14 days | per receiver | ✅ ❓ Renat: what decides it |
| Group invoices, contact groups | none | — | — (decided) |
| «Сводка по выбранным инвойсам» | a view | built | ✅ |
| Export | not seen | .xlsx | ✅ |
| Contacts and their action log | 18 contacts | «Получатели», events | ✅ |
| Sales, client and product reports | data (counts, receivables) | «Отчёты», by receiver | ✅ ❓ Renat: what the accountant needs |
| Products | empty | a view over shop goods and services | ✅ |
| Add-ons (eTasku) | not connected | — | — |
| Company, logo, bank account, numbering | filled | «Настройки» | ✅ |
| Users | one login | our logins and rights | ✅ |
| Dashboard | the month figures are read | built; layout brought to the re-scan's measures (20.11) | ✅ |
| Plan | Pro, €94.80 + VAT a year | — | read 20.11 in «Заказ»: period 20.11.2025–20.11.2026, renews by itself; cancel a month ahead, so the next year (to 20.11.2027) was already past the cancel date |

## Open points

Dim answered round 10 on 20.11 (`docs/kickoff.md`, decision 36). Renat's
questions page was rewritten the same day (set 3) with what only he knows.
