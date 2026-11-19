# Reference looks: Altegio's admin and Isolta's invoices

*19.11.2026. Dim: the admin and the barber app go «light in Altegio colors:
calendar etc. same coloring, same look and functionality», and the invoices
go «as Isolta as possible, even the colors and the buttons». The client
booking's own reference is in `docs/brand.md`, «Booking look».*

Both were read in Renat's own accounts, in the browser Dim keeps signed in,
**looking only**: nothing was saved, moved, cancelled, created or sent.
Client names and phones seen there are not written down anywhere.

The rule stays as for the booking: their colours, layout and order, in our
own code, icons and words. Never their logo or name.

## Altegio's admin (`app.alteg.io`, 1920 px wide)

### Frame

| Part | What it is |
|---|---|
| Sidebar | 220 px, `#22222e`. Top: the salon's mark and name, a bell. A mini month: each day in a ring coloured by how full it is (red full, yellow partly, green free), today a white disc. Four dark tiles, 2 × 2 (`#14141c`, 12 px corners): «Продажа товара», «Новый платёж», «Список услуг», «Каталог товаров». «Избранное»: the owner's own short list of pages. Bottom: who is signed in, the way out, and one yellow bar «Администрирование» that opens the whole menu. |
| Page | Ground `#f7f9fc`, content on white. Font Inter. Text `#2b3134`, second lines `#676a6c` and `#71757f`. |
| Page head | A small square menu button, the title (20 px, 500), a star to pin the page, a thin breadcrumb under it. |
| Buttons | 32 px high, 8 px corners, 12 px / 500. Plain: white with a 1 px `#e0e3eb` line. The one main action of a page: yellow (`#ffcb00`, dark text): «Добавить», «Создать», «Найти», «Сохранить». |
| Lists | Rows on `#f7f9fc` with 8 px corners; a search field with an icon on top; tabs with a yellow line under the open one. |

### The journal (the day calendar)

- A column per barber: a small square photo (4 px corners), the name
  (12 px / 500), the role under it (12 px, `#71757f`).
- The time axis on both sides: the hour large with small «00», the half
  hour as a small grey «30». Thin grey lines per quarter.
- **A visit:** a 15 px strip on top with the time in white 9 px, then the
  body: the client's name and phone (10 px / 700), the services (9 px / 700,
  `#273a49`). 4 px corners.

  | Kind | Strip | Body | Name |
  |---|---|---|---|
  | Booked online by the client | `#907b9f` | `rgba(195,165,214,.8)` | `#765c88` |
  | Made by the staff | green (about `#1cb58e`) | the label's colour: orange or teal in Renat's journal | dark |

- **Now:** a dark tag with the time in yellow (`#2b3134`, `#ffcb00`) and a
  line across; the visit running now has an orange glow.
- **A break:** a pale grey block (`rgba(224,227,235,.55)`) with its times.
- Top bar, left to right: the menu button, «Сегодня», ‹ ›, the date (20 px);
  then «Продать», the day's cash, «День | Неделя», a filter, zoom, the
  barbers shown, the layout.

### The menu behind «Администрирование»

Журнал · Услуги · Сотрудники (список, должности) · График работы · Записи ·
Клиенты (база, категории, лояльность) · Онлайн-запись (формы и ссылки,
настройки) · Товары и склад · Финансы (операции, счета и кассы,
контрагенты, статьи) · Отчёты (основные показатели, записи, события).

### What REMPIRE has set there

- **Online booking → «Правила отмены и переноса записей»:** clients may
  move a visit online, with no time limit; clients may cancel online, with
  no time limit.
- **The consent tick** links Altegio's own privacy policy
  (`alteg.io/en/info/privacy`) and user agreement, not a text of REMPIRE's.
- **The barber's side** in Altegio is the same journal with fewer rights,
  and Altegio's phone app for staff (the store links sit bottom left). It
  cannot be opened from Renat's owner login.

## Isolta's invoices (`secure.isolta.com`)

### Frame

| Part | What it is |
|---|---|
| Sidebar | 259 px, indigo `#312e6b`, white text 16 px. The open page is a darker pill (`#252442`, 8 px corners, 48 px high). Рабочий стол · Инвойсы · Контакты · Товары/услуги · Отчёты · Add-ons · Настройки; «Выход» at the bottom. |
| Page | Ground `#f3f3f7`; a white bar on top (88 px, soft shadow) with the title and the page's buttons; content in white cards with 8 px corners. Font Figtree. Text `rgba(11,11,20,.87)`. |
| Buttons | 40 px high, 8 px corners, 14 px / 500. Main: indigo `#312e6b` with light text («+ Новый инвойс», «Предварительно просмотреть и отправить инвойс»). Others: white with an indigo line («Сводка…», «Инструменты», «Заметка к инвойсу», «Приложения»). |

### The list («Инвойсы»)

- A search field, a status filter («Все инвойсы») and a date range.
- One table: status, receiver, invoice number, reference number, date, due
  date, without VAT, with VAT. Rows 52 px. The status is an outlined pill:
  «Черновик» orange, «Просрочен» red. 10 rows a page.

### One invoice (the editor)

Renat's whole routine (Dim, 19.11): «Инвойсы» → «Новый инвойс» → pick who
gets it → send.

- Head: «Инвойс 423», then «Предварительно просмотреть и отправить
  инвойс» (main), «Заметка к инвойсу», «Приложения», «Инструменты»; a
  small «‹ Sales invoice list» back button under it.
- Left: the sender (logo, name, address), then **one search field for the
  receiver** that opens the list of contacts (companies and people).
- Right, a small table: invoice number, reference number for the payment,
  the date, payment terms (14 days), the due date, our and your reference.
- Below: the lines (item number, name, unit price, amount, unit, discount,
  total), with the currency on the right.

## What this means for us

1. **Admin and barber app: built 19.11.2026** (`src/app/admin/admin.css`,
   `src/app/b/barber.css`, the two layouts).
   - Pages light in Inter; the frame dark (`#22222e`): on a phone the top
     bar and the sections at the bottom, from 900 px the admin's sections
     as a sidebar on the left. The barber app stays a phone-wide column.
   - Yellow (`#ffcb00`) for the one main action and the current choice;
     other buttons white with a grey line; 8 px corners, cards 12 px.
   - The calendar in the journal's colours: a visit booked online violet,
     one made by the staff green over teal, a strip with the time on top;
     «now» a dark tag with yellow time; breaks pale grey; special time a
     dashed amber frame.
   - **Not built:** the sidebar's mini month, the four tiles and
     «Избранное»; the journal's large hour numbers.
2. **Invoices: built 19.11.2026** (`src/app/admin/(app)/invoices/`, the
   «Счета» block of `admin.css`).
   - **The section wears Isolta's colours:** in «Счета» the frame turns
     indigo (`#312e6b`), the main button is indigo, the ground lilac-grey
     (`#f3f3f7`), sheets white with 8 px corners. Only tokens change
     (`:root:has(.adm-inv)`); the rest of the admin keeps Altegio's. The
     font stays Inter: Figtree has no Cyrillic.
   - **«Счета» (the list):** a search, a status filter, one table: status
     as an outlined pill (draft orange, overdue red, issued indigo, paid
     green), receiver, number, date, due date, without and with VAT.
   - **«Новый счёт»:** one field to find the receiver; his name opens the
     draft (`openDraft`): the one he has, else the month being invoiced
     with its rent and sales already in, else an empty **free invoice**
     dated today (migration 015), as many a month as Renat likes.
   - **One invoice:** the title with «Выставить и отправить» and «Удалить
     черновик»; one sheet with from and to, the number and dates in a
     ruled table on the right, the lines as a table, the note, the totals.
   - **The month's sums per barber** moved to the tab «Месяц»
     (`/admin/invoices/month`); «Получатели» is Isolta's «Контакты»,
     «Компания» its settings.
   - **Not built:** a PDF preview before sending (the PDF exists once an
     invoice is issued); Isolta's reference number for payments; its
     products list, reports and attachments.
3. **Functionality** Altegio has and we do not (clients base, loyalty,
   stock, cash accounts, reports) is a list for Dim to choose from, not
   part of the look.
