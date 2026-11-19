# One place for each thing

*Dim, 19.11.2026: «we need to consolidate stuff which is similar or the
same, and not have 3 different places for products». Altegio, Isolta and
the shop each have their own list of products, services and people. Ours
has one of each; every screen that Altegio or Isolta shows reads that one
list.*

## The map

| Thing | Altegio | Isolta | The shop | **Ours: the one place** |
|---|---|---|---|---|
| **Products** | «Товары» and the tile «Каталог товаров»: its own goods list and stock. Empty at REMPIRE | «Товары/услуги»: saved invoice lines. Empty at REMPIRE | The live catalogue: names, prices, stock, photos, barcodes | **The shop's catalogue.** Booking reads it through the partner API (`docs/phase-c.md`); nothing is typed twice and nothing links out. «Каталог товаров» shows it inside our app |
| **Selling a product** | The tile «Продажа товара» (looked at 19.11): date and time, who sold, from which store, the goods, the client; «Сохранить без оплаты» or «Сохранить и оплатить». Also the «Товары» tab of a visit | — | An order; the stock goes down | **One sale** (`product_sales`), made from the tile, from a visit's «Товары» tab or from the barber app's «Продать». It is the barber's sale we already have: the shop's price, 17 % to the barber, or for himself at the purchase price |
| **Services (the cuts)** | «Услуги», and the tile «Список услуг» | The other half of «Товары/услуги» | — | **«Услуги»**, with each barber's own price and duration. Booking, the visit window and the tile read it |
| **A line on an invoice** | — | Typed by hand, or picked from «Товары/услуги» | — | **Picked from the two lists above** (a shop product, a service) or typed. Our «Товары/услуги» is a view over both, not a third list |
| **Payment for a cut** | In the visit: «Оплатить», cash or card. It writes a finance operation by itself | — | — | **A paid mark on the visit** (cash or card) and the day's total (round 9: «small», after Renat's answer) |
| **Other money in or out** | The tile «Новый платёж»: a finance operation typed by hand (payment item, till, payer, sum): rent, supplies, salary. REMPIRE has none | — | — | **Not built.** The tile stays hidden |
| **An invoice to a barber** | — | «Инвойсы» | — | **«Счета»** |
| **Who gets invoices** | — | «Контакты»: the companies Renat invoices (the barbers' FIE and OÜ) | — | **«Получатели»**, apart from clients. A barber is linked to his receiver |
| **Clients** | «Клиентская база» | — | The shop's own customers | **«Клиенты»**. The shop's customers stay in the shop |
| **Barbers** | «Сотрудники» | — | — | **«Барберы»**: schedule, services, access, receiver |
| **Messages** | «Уведомления»: templates and channels | The invoice's e-mail | Order e-mails | **One outbox** for booking and invoices. The shop keeps its own order e-mails |

## The four tiles, answered

- **«Продажа товара»** is the same as our barber's sale. Verified by opening
  it (closed without saving).
- **«Новый платёж»** is not the payment for a cut. It is a hand-typed finance
  operation (Altegio's help, «New transaction»). A cut is paid inside the
  visit.
- **«Список услуг»** is the list of cuts, the same data as «Услуги».
- **«Каталог товаров»** is Altegio's own goods list; for us it is the shop's
  catalogue.

## Integrations connected in Altegio (looked at 19.11)

Four, all free:

| Integration | What it does | For us |
|---|---|---|
| Google Maps, «Book online» button (listed twice) | A booking button on the salon's Google Maps card that opens Altegio | **At the move:** put our booking address into the Google Business Profile as the booking link. Without it the button dies with Altegio |
| Altegio.me | Altegio's free phone app for clients | Our installable client app replaces it (`docs/apps.md`) |
| Altegio.me MCP | Clients book through an AI assistant. This is the «Altegio.me MCP» system user in the staff list | Not carried over. Can be built later as our own |

Not connected there: WhatsApp, a branded app, telephony, online payments.
SMS goes through Messaggio as a notification channel, not as an integration.
