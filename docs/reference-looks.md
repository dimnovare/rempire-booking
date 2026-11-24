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
   - **Sidebar and tiles: built 19.11.2026** (`sidebar.tsx`, `frame.tsx`
     and the two drawers in `src/app/admin/(app)/`; the «sidebar» and
     «drawer» blocks of `admin.css`). From 900 px; a phone keeps its bar
     and gets «Каталог товаров» and «Продажа товара» on «Ещё».
     - **Two modes**, kept per browser tab. «Till»: the month, the tiles
       and «Избранное»; a tab that opens on the calendar starts in it.
       «Menu»: every section as an accordion on black; a tab that opens on
       any other page starts in it. The yellow bar switches: «Все разделы»,
       and «Журнал» back to the calendar.
     - **The month:** a ring per day, the minutes booked over the minutes
       the barbers work that day, less their time off
       (`src/lib/admin/month-load.ts`, one query a month). Green under
       50 %, yellow from 50 %, red from 75 %; cancelled visits do not
       count; a day nobody works has no ring. A day opens in the calendar.
     - **Three tiles:** «Продажа товара», a drawer: the front desk records
       the barber's own sale (`src/lib/admin/sale.ts`, `docs/one-place.md`);
       «Список услуг», a read-only drawer; «Каталог товаров»
       (`/admin/catalogue`): the shop's products by a search, because the
       shop link has no call for the whole list. The fourth, «Новый
       платёж», is not built.
     - **«Избранное»:** a star beside each section's title; the starred
       pages are the login's own (`users.favourites`, migration 017).
     - **The bell: built 24.11.2026** (`bell.tsx`, `bell.css`,
       `bell-actions.ts`; `src/lib/bell.ts`, migration 046): their 24 × 47
       button at the right of the head row, a line bell in the sidebar's
       grey, white on hover, an 8 px red dot while something is unread. It
       lists what the staff pushes say (`src/lib/push-kinds.ts`, in the
       login's language), for every login the push would reach, phone or
       not: a white card of 360 px beside the sidebar, newest first, the
       newest 30 of 30 days, each row a link to where the push's tap goes.
       Opening it marks all read. The phone keeps its bar, with no bell.
     - **The menu, re-measured 24.11.2026** from Dim's screen video at
       1920 × 1080 (`docs/altegio-pages.md`, «Sidebar, admin mode»): rows
       40 px tall and 12 px apart, 24 px icons, a light chevron, the head's
       line in both modes, a 24 px mark. A group opens as theirs does: the
       head turns yellow, the card and its list grow in .25 s and the rows
       under it move down; the group that was open folds at the same time.
       The foot shows the name and the e-mail, no picture (the role on a
       hover).
     - **Ours, not theirs:** the way out stays in the menu too.
   - **The journal: built 19.11.2026** (`calendar.tsx`, `journal-bar.tsx`
     and `journal-side.tsx` in `src/app/admin/(app)/`; its rules in
     `src/lib/admin/journal.ts`; the two calendar blocks of `admin.css`).
     From 900 px, to the design board's sizes; a phone keeps its own bar,
     day strip and sizes and takes only the visits' colours.
     - **Bar:** white, 48 px, 32 px controls: «Сегодня», ‹ ›, the day as
       the title («19 ноября, четверг»; a click picks any date), then
       «Продать» (the sale drawer), the day's numbers, «День | Неделя»
       (the week asks for the barber), the status filter, the scale, the
       right panel. No «Запись» from 900 px (20.11.2026): free time under
       the mouse says «12:00 Новый сеанс» and a click books there; a phone
       keeps its yellow «+».
     - **Columns:** only the barbers who work that day (hours, or special
       time) or have a visit on it; time off stays in the column as a
       block. A day nobody works says «На этот день нет графика работы»,
       with the yellow «Настроить график работы» (that day in «График
       работы») and «Добавить сотрудников в день» (the dialog «Добавить
       сотрудника в расписание»: barbers to tick, the hours, breaks). The day
       runs from the earliest start to the latest end among them, 1 px a
       minute, the time on both sides with the large hour numbers.
     - **A visit:** the strip says who made it (online violet, the salon
       green), the body its state: `pending` and `booked` wait in their
       maker's tint, `arrived` and `done` are orange, `no_show` red.
       «Now» is the dark tag and a line, the visit running now glows, a
       break is pale grey with its times.
     - **The day's numbers:** clients, «Записей на сумму» (every visit of
       the day), «Выполнено на сумму» (arrived or done; the sum on the
       button), «Товаров на сумму» (the day's product sales that were not
       taken back).
     - **Filter, scale, panel:** kept per browser tab. The filter has a
       tick per state; the scale is 1, 1.5 or 3 px a minute (15, 10 or 5
       minutes to a line); the panel has one tab, «Клиенты», the client
       base's own search.
     - **Built 20.11.2026** (`journal-grid.tsx`, `journal-card.tsx`,
       `journal-hours.tsx`, `journal-extras.css`): the card on hover
       (the client and his phone with a copy button, the time and the
       barber, «Визитов / Не пришёл / Потратил», four chips that write at
       once, the services, «Итого», «Открыть запись»; Tab shows it too);
       the menu behind a barber's head (his hours that day, «Изменить
       часы на сегодня», «Сделать выходным», «Открыть график работы»,
       written as one dated day of «График работы», with its rights). A
       click or a drag snaps to the scale's step: 15, 10 or 5 minutes.
       The barber's «Мой день» is one column of the same grid at a phone's
       sizes (`src/app/b/(app)/day-view.tsx`, `day-grid.css`; the board
       MyDay-Grid): the dark bar with the day and «День | Неделя», a row
       with him and the day's numbers, the week floating over the tabs.
     - **Not built:** cash, card and loyalty in the day's numbers
       (payments are not built); subscriptions and certificates under
       «Продать»; the bar's menu button; pulling a visit's foot to make it
       longer; the panel's chat.
   - **The visit window: built 20.11.2026** (`visit-window.tsx` and
     `visit-parts.tsx` in `src/app/admin/(app)/`; what it reads beside the
     visit in `src/lib/admin/visit-window.ts`; the «visit window» block of
     `admin.css`; the design board «Окно визита»). The journal and the
     pencil of «Записи» open the same window. From 900 px; a phone keeps
     its bottom sheet and only gains the «Подтвердил» mark.
     - **Frame:** a drawer from the right over the dimmed page, a round
       «›» on its seam; Escape, the seam and the dark side close it
       without asking. 1200 px on `#f7f9fc`, 16 px in; three columns 8 px
       apart with 8 px corners: 228 px grey (`#eef1f6`), 584 px and 340 px
       white; a white 64 px foot with «Запись» on the left and the yellow
       «Сохранить изменения» on the right, live only once something
       changed. Below 1200 px the centre gives way down to 360 px; below
       that the client goes under the services. Never a sideways scroll.
     - **Left:** the barber, the bin (cancel, after «Да, отменить»), the
       day and «18:15–18:45 · 30 мин», «✎ Изменить» (barber, date and
       time in place), «Закреплённые поля» → «Комментарий к записи» (the
       staff note), and three tiles that slide a panel over the column:
       «Расширенные поля» (the client's comment and the staff note),
       «Уведомления о визите» (the reminder and this visit's messages from
       the outbox), «История изменений» (the audit log, the newest first,
       with who and when).
     - **Centre:** four chips that write at once: «Ожидание», «Клиент
       пришёл» (also lit for a done visit), «Не пришёл», «Подтвердил».
       «Подтвердил» is a flag on a waiting visit, not a status
       (`appointments.confirmed_at`, migration 021): any other status clears
       it, a move or a change of services keeps it; the journal's card shows
       it as a bare tick, and «Записи» filters on «Клиент подтвердил». Then
       the visit's services with their prices, the special-time extra,
       «К оплате», «Услуги» / «Товары» (the shop's products, sold to this
       client with the front desk's own sale), the search, the service
       cards three in a row with the violet «Последний визит», and «Все
       услуги» → «Услуга ▾».
     - **Right:** the initials, name and phone, «✎ Изменить» → his card,
       «Написать:» WhatsApp and Telegram (only with the right to call and
       a whole number), «Профиль клиента», «История визитов», «Ещё»
       (messages, notifications), «Не посещал N дней» (from 14 days),
       «Примечание о клиенте», «Дополнительно» (his last comments and «+
       Добавить примечание о клиенте»), «Статистика» («Последний визит»,
       «Всего визитов», «Не пришёл», «Продано») and «Данные записи».
     - **Rights:** what the login may not do is not drawn, and every
       action asks again; the window's own data comes only for a visit in a
       column the login sees and within its history limit, the client's
       part only with «Доступ к данным клиентов» and a client it is shown.
     - **Not built:** «Оплатить», «Платёжная политика», «Баланс» and
       «Оплачено» (payments wait for Renat's answer on finance);
       «Повторение записи» and «Списание расходников» (no such function
       here); «Записывает другого посетителя» (a visit has one client).
     - **The new visit: built 20.11.2026** (`new-visit.tsx`; the design
       board «Новая запись»). A tap on a free time (or a phone's «+»)
       opens it from 900 px, in the same frame, chips, tiles, cards and
       foot (`visit-parts.tsx`: one copy of each); the journal does not
       make room for it. A phone keeps its bottom sheet.
       - **Left:** «Специалист» (a select with his picture: the active
         barbers, and the one tapped), «Дата», «Время и длительность
         записи»: the start is typed, the end and the length are the
         chosen services' at this barber's own length, shown, not typed
         (a visit has no length of its own). «Закреплённые поля» →
         «Комментарий к записи» (the staff note), and two tiles:
         «Расширенные поля» (the staff note again) and «Уведомления о
         визите» (the SMS switch and a line: sent before the visit, not
         sent, or no phone to send to).
       - **Centre:** the four chips, «Ожидание» chosen. The chip is
         written right after the visit is made, with the window's own
         status action («Подтвердил» is the flag); the chips other than
         «Ожидание» need «Изменять записи». If that write fails the window
         stays open and says so, and «Создать запись» again finds the same
         visit (one key per window) and writes the chip. Then the chosen
         services (name, his price, ×), «Итого» with the sum and length,
         the search, his services' cards three in a row (96 px, the chosen
         ones with the board's 2 px yellow line, now also in the visit
         window) and «Все услуги» → «Услуга ▾».
       - **Right:** «Имя клиента» («Иван»), «Телефон» as a «+372» code
         select (Estonia first, then the neighbours) and the number; a
         number typed with its own «+» or «00» keeps it. «Email» for a new
         client only: `createVisit` now takes it, checked as the card
         checks it, and puts it on a client the visit adds, never on one
         that is there (picked, or found by the phone). The clients found
         show under the field being typed (initials, name, phone, visits);
         a picked one is his initials, name, phone and «Выбрать другого»,
         sent by his id alone. Without the right to add clients the fields
         only look one up («Новых клиентов добавлять нельзя…»). Then the
         «SMS-напоминание» switch, green as on the board.
       - **Foot:** «Новая запись» and, for a login that may block time,
         «Перерыв»: the journal's own time-off form (the side sheet), whose
         «Запись» comes back to the drawer. The sum with the length and
         the times, and the yellow «Создать запись», live once there is a
         service and a client; the «anyway» question and errors in the
         foot. A field being typed in has the board's 2 px yellow line.
       - **Not built:** «Сохранить пустую запись» (a visit always has a
         service here); the end and the length as fields (no custom
         length); «Технический перерыв» and «Повторение записи» (no such
         function); categories and colour in «Расширенные поля» (none
         here); «Записывает другого посетителя»; «Товары» (nothing to sell
         before the visit is there) and the «Платёжная политика» banner;
         the onboarding hints; the phone in the «+372 5550 0117» spacing
         (the admin shows E.164 everywhere).
2. **Invoices: built 19.11.2026, in Isolta's own frame since 20.11.2026**
   (the owner: «Счета» wears the invoicing tool's frame, with a way back;
   `src/app/admin/(app)/invoices/`, `src/lib/billing/`, the «Счета» block
   of `admin.css`; the design boards «Счета, список» and «Счёт, черновик»;
   the measures in `docs/isolta-pages.md`).
   - **The frame:** inside `/admin/invoices` the salon's sidebar gives way
     to the section's own (`invoices/side.tsx`, shown by `sidebar.tsx`):
     indigo (`#312e6b`) but the salon sidebar's own size (220 px; Dim,
     20.11: it must not grow when «Счета» opens), its 48 px head with our
     mark and «REMPIRE», six 40 px rows of 14 px / 500
     with 8 px corners (the open one `#252442`): «Рабочий стол», «Счета»,
     «Получатели», «Товары и услуги», «Отчёты», «Настройки»; at the foot
     «В салон», back to the journal. The ground is `#f3f3f7`; each page
     has a white 88 px bar with the title (28 px / 700, `#252442`) and its
     buttons, and its content in white cards with 8 px corners inside a
     centred 1344 px box. Buttons are 40 px, the main one indigo, the rest
     outlined; fields 56 px with the label cut into the line. The tokens
     hang on the section's sidebar (`:root:has(.iv-side)`), so the rest of
     the admin keeps Altegio's. A phone keeps the app's two bars and gets
     the six pages as a row of chips under the title. The font stays
     Inter: Figtree has no Cyrillic.
   - **«Рабочий стол»** (`/admin/invoices/desk`; re-laid 20.11.2026 to
     the re-scan, `docs/isolta-pages.md` part D): no white bar and no
     visible title (an `h1` for screen readers), a stack 24 px apart on the
     ground. The head (our mark on a 56 px `#e5f8ff` tile, the company and
     its e-mail); then the three figures (this month, last month, overdue:
     how many and how much; each opens the list filtered the same way) and
     five tiles (Новый счёт, Показать счета, Бухгалтерский отчёт →
     «Отчёты», Новый получатель, Показать получателей; three a row, six
     from 1536 px), with a 336 px card at the right where the tool has its
     promo: «Счета барберам за <месяц>», how many barbers get a month's
     invoice and how many have it yet, and «Открыть месяц» to «Отчёты»,
     where «Сделать черновики» is (no button without the company). Then
     «Неоплаченные счета» at 5/12 (the five longest overdue, the sum of all
     unpaid, «Все» to the list) in place of the tool's purchase invoices,
     and the latest events at 7/12. Not ours: the sixth tile «Новый
     товар/услуга» (no saved products), the photo in the band. A phone
     keeps the section's bar for its chips and stacks the blocks. The
     salon's menu still opens the section on the list: Renat's routine
     starts there.
   - **«Счета», the list** (`/admin/invoices`): «+ Новый счёт», «Сводка по
     выбранным счетам» (counts and sums of the rows the filters leave:
     issued, credit invoices, turnover, unpaid, overdue, drafts; without
     and with VAT) and «Инструменты» → «Экспорт счетов в таблицу» (the
     same rows as .xlsx; each export is in the audit log without its
     rows). A search, the status (all, drafts, issued and not due,
     overdue, paid, credited), the period with two dates and ‹ › to step
     by it. One table: the status as an outlined pill (draft `#c2660a`,
     issued `#312e6b`, overdue `#c20a38`, paid `#0f8a71`, credited and a
     credit invoice grey), receiver, number, date, due date, without and
     with VAT; every column sorts, a row opens the invoice; 10, 25, 50 or
     100 rows a page.
   - **«Новый счёт»** (`/admin/invoices/new`): the sheet with nobody on it
     yet and one field over «Получатели»; a name opens the draft
     (`openDraft`): the one he has, else the month being invoiced with its
     rent and sales already in, else an empty **free invoice** dated today
     (migration 015), as many a month as Renat likes.
   - **A draft, the editor:** the bar with «Посмотреть и отправить счёт»,
     «Заметка к счёту» and «Инструменты» (delete the draft, a copy); the
     second bar with «‹ Список счетов», previous and next; the sheet: the
     sender with our mark, the receiver as a card with × (a free draft
     moves to the other receiver; a month's draft stays its barber's, and
     the other receiver's own draft opens), the ruled table (number, date,
     payment terms, due date, the period), the lines, «+ Добавить строку
     счёта» and the totals.
     - **A line is picked from the two lists or typed**
       (`docs/one-place.md`; `src/lib/billing/picker.ts`): its name is a
       search over the shop's products and the salon's services, and takes
       any text. Picking fills the name and the price; the VAT rate is set
       on the server by the invoice's own rule (`vatFor`): a product's own
       rate, else the issuer's, none for a receiver without VAT.
     - **«Посмотреть и отправить счёт»:** the draft's PDF from the same
       builder, with «mustand / draft» where the number will be and a
       «ЧЕРНОВИК / MUSTAND» stamp. Looking takes no number and writes
       nothing. «Выставить и отправить» there is the moment the number is
       given; «Назад к черновику» goes back. A browser with a PDF viewer
       shows it inside the window; a phone opens it by the link.
   - **An issued invoice:** «Платежи» (paid in full on a day; no part
     payments), «Создать кредит-счёт» (asked first), «Инструменты» (a copy
     as a new draft, save the PDF, print, send once more); under the bar
     the status in its own colours with «Показать действия по счёту»:
     issued, sent to which address, paid, credited. The sheet is the same,
     read only.
   - **«Получатели»:** the list as Isolta's contacts (a search, name,
     address, postcode, town, how many invoices) and one receiver's page:
     his card with «Редактировать», his barber's chair rent, and the tabs
     «Журнал действий» and «Счета». No groups.
   - **«Товары и услуги»:** two read-only views, the shop's products by a
     search and the salon's services with their prices. Not a third list.
   - **«Отчёты»:** the month's sums per barber (it was the tab «Месяц»),
     and the receivers for a period (invoices, credit invoices, sold,
     credited, total, the last invoice), without or with VAT.
   - **«Настройки»** (it was the tab «Компания»): the company, the bank
     account, the number series, the VAT rate and the foot text, the money
     switches, as Isolta's cards.
   - **As Isolta, since 24.11.2026** (Dim, decisions round 15): a draft's
     title is the number it would get if issued now («Счёт 423», with «не
     закреплён: номер даётся при отправке»; the number is taken only at
     issue); the reference number («Viitenumber») is the invoice number
     plus its 7-3-1 check digit, on the PDF next to the IBAN, the invoice
     page, the list, the export and the barber's money page
     (`src/lib/billing/reference.ts`; computed, never stored); the note
     is internal, «Заметка (не будет видна на счёте)», never printed; an
     invoice is not issued while the company has no IBAN or address
     (`no_bank`, `no_address`); each receiver has a phone (044); «Отправить
     снова» goes to the receiver's current e-mail.
   - **Ours, not theirs:** the lines have no drag handle (they are not
     reordered) and their discount is a sum, not a per cent (it is the
     barber's 17 %); «№ товара» is the sold product's barcode, on a sale's
     line only; the note holds 300 characters (Isolta's 4000).
   - **Not built:** reminders and part payments; attachments; saved
     products and contact groups (decided against, 19.11.2026); our and
     your reference, the six detail rows and the description before the
     lines (none is stored); another currency; a logo or an e-mail text of
     one's own in «Настройки»; a receiver's note.
3. **«Клиенты»: built 19.11.2026** (`src/app/admin/(app)/clients/`,
   `src/lib/admin/clients.ts`, the «Клиенты» block of `admin.css`; Dim's
   choice in decisions round 8).
   - **The list in full: built 19.11.2026** (the owner, the same day: the
     tool's search, segments, filters, column chooser and every bulk
     action, mass SMS included; `clients/list-view.tsx` and its
     `base-*.tsx`, `src/lib/admin/client-filter.ts`, `client-bulk.ts`,
     `client-export.ts`, `client-columns.ts`, `src/lib/xlsx.ts`, migration
     019, the «cb-» block of `admin.css`). From 900 px, laid out as the
     design board «Клиенты, список». **Its layout, not its controls:**
     the board draws the tool's old style, and an old-style page gets the
     new-style controls (round 9): 32 px fields and buttons, 8 px corners,
     a 1 px `#e0e3eb` line, 12 px / 500 on buttons, yellow for the main
     action, white popovers with 12 px corners, 50 px table rows.
     - **Head:** «Клиентская база» with its star and the breadcrumb
       «Клиенты»; right, «Операции с Excel» and the yellow «Добавить
       клиента».
     - **«Операции с Excel»:** «Выгрузить в Excel» is the filtered list as
       a real .xlsx with the chosen columns, for the owner's login only;
       every export is in the audit log with who, when and how many rows,
       never the rows. «Загрузить из Excel» is shown, disabled, «Скоро».
       The file is written by our own small writer over `fflate` (the one
       package added; it also reads a sheet back, for the import).
     - **Search:** one field across the page: a name, the digits of
       either phone, an e-mail or a card number. It asks by itself a
       moment after the last keystroke.
     - **«Сегменты:»** «Новые» (a visit in the last 30 days and none
       before them), «Повторные» (a visit in the last 30 days and one
       before them), «Потерянные» (has visits, none in the last 60 days
       and none ahead). A segment is a preset: it fills the conditions in
       and asks at once; picked again, it is taken off.
     - **«Фильтры:»** two dropdowns add a condition, a bin takes them all
       off, the yellow «Найти» at the right asks. Each condition is a row
       with its own fields and a cross; with two or more, one switch says
       «И» or «Или» for the whole set. «По визитам»: has visits or none
       (in some days, if wanted), came or did not come, the number of
       visits, visited between two days, the barber, the services, the
       sum of the services. «По клиентам»: gender, category, sold,
       importance class, birthday (a month, or in the next N days), age
       (a client whose year is not known is left out), received a mass
       message, «no online booking». A visit here is what the «Визиты»
       column counts; «came» is the journal's own state.
     - **The table:** a tick per row and one for the page; Имя (opens the
       card), Телефон, Email, Продано, Визиты, Скидка, Последний визит,
       Первый визит («19 ноября 2026 г. в 10:00»). A round cog at the
       head's right end picks the columns; the choice is the login's own
       (`users.client_columns`). A click on the head of the name, the
       visits, the sum or a visit's date sorts; again, the other way.
       Beside the sidebar on a small laptop the table scrolls inside its
       sheet, never the page.
     - **The bar at the bottom, sticky:** 10 / 25 / 50 / 100 a page,
       «Назад 1 2 3 … Вперёд», «Показаны результаты с 1 до 25 из N»,
       «Действия». It acts on the ticked rows or, with none ticked, on the
       whole filtered list, and says first on how many clients.
     - **«Отправить сообщение»:** a text and the channels, each with who
       gets it: a mass message is advertising, so whoever ticked
       «Рекламные сообщения: не отправлять», switched the channel off or
       has no address for it is left out, and for SMS the parts a message
       and in all are counted. «Отправить» only opens the second question,
       «Отправить N SMS (M частей) и K писем?»; nothing is queued before
       the yes. Then one outbox row per client and channel (kind «mass»),
       a mark on each client (`clients.mass_sent_at`) and one audit row.
       While no SMS provider is set those rows wait in the queue, and the
       window says so.
     - **«Добавить в категорию»:** one of the categories in use, or a new
       word, on every chosen client. **«Удалить из базы»:** the owner
       only; exactly the clients one card's «Удалить» would delete, and
       the answer says how many went, how many stayed and why.
     - **A phone keeps its simple list:** the search, one category as a
       filter, a row per client, 25 a page; of all the above it takes
       only the segments, as three chips.
   - **What is typed in the search is never in the address:** the list is
     asked for by an action, so a client's name or phone stays out of
     links, the browser's history and the request log. The export is a
     POST for the same reason.
   - **One client: the full card** (the owner, 19.11.2026: every field of
     Altegio's card and seven of its nine tabs, not loyalty and not
     accounts; `clients/[id]/`, `src/lib/admin/client-card.ts`, migration
     018, the «cc-» block of `admin.css`, to the design board «Карточка
     клиента»).
     - **A drawer over the list** from 900 px: 900 px on the right, white,
       no dark side. The list stays in view and in use behind it (it is
       the layout, so its search and page are kept) and the open client's
       row is outlined in yellow. The sidebar stays, where Altegio hides
       its menu. On a phone the card is the page, and its tabs are one row
       of chips that scrolls sideways. `/admin/clients/<id>` opens it,
       `?tab=history` a tab.
     - **«Карточка клиента»:** left, the fields: name, phone, second
       phone, e-mail, birthday (a year is not needed: «14.03»), gender,
       importance class, card number, discount, the language of his
       messages, categories (chips; free words, migration 016, the ones in
       use are offered), «Запретить записываться через онлайн-запись», the
       note the barbers see too. Right: his photo, the comments (a dated
       history beside the note), and the numbers nobody types: sold «за N
       посещений», first and last visit. Foot: «Удалить» and the yellow
       «Сохранить». **«Сохранить» here, not autosave:** the board has the
       button; leaving with changes that are not saved asks first.
     - **The discount is stored and shown only.** It changes no price.
     - **«Удалить»** asks, and refuses a client who has visits or
       purchases: his history stays, so he stays.
     - **«История визитов»:** a filter (all, upcoming, past, cancelled)
       and a table under a line per day: the barber with the time and the
       way to that day in the calendar, the status with a coloured dot,
       the services, the cost.
     - **«Статистика»:** a period, then three cards: what he spent per
       month (bars, plain SVG), his services and his barbers with counts
       and sums. The same visits as «Продано».
     - **«Сообщения»:** every message to him in the outbox: its words or
       its kind, when, the kind, the state, the channel. No «calls» tab.
     - **«Отправить сообщение»:** a text with its count of SMS parts, the
       channels as ticks, the yellow «Отправить». It is queued as a
       «manual» row per channel and the cron sends it. Push is offered
       only while he has a notification on for a visit ahead.
     - **«Уведомления»:** «Рекламные сообщения: не отправлять» (a mass
       message from the list goes to nobody who has it), the channels he
       accepts (SMS, e-mail, push), and a switch for each kind we really
       send a client: the confirmation, the reminder, «the salon moved
       it», «the salon cancelled it». Altegio lists 13 kinds; the other nine we do not
       send, so they are not listed. The outbox honours all of it
       (`src/lib/client-notify.ts`).
     - **«Файлы»:** the note with the kinds and the size, «Загрузить
       файлы», the list, «Файлов пока нет». In the database, 5 MB each,
       20 a client, served only to a login and only as a download.
   - **The numbers:** «Визиты» is every visit that is not cancelled, the
     ones ahead too; the first and the last visit are ones that have
     begun; «Продано» is the sum of the visits that have begun and were
     neither cancelled nor a no-show.
   - **The sections:** «Клиенты» is the sixth, so a phone's bottom bar
     holds four of them and «Ещё» (`/admin/more` lists the others as large
     rows); the sidebar from 900 px lists every section. The words are
     still ours («Журнал», «Барберы»), not Altegio's «Журнал» and
     «Сотрудники».
   - **Not built:** the import from Altegio and «Загрузить из Excel»
     (both will fill the same table); merging two clients; erasing one
     who has history; the card's «Лояльность» and «Счета клиентов» tabs;
     a discount that changes a price; paid sums, a balance and deposits
     among the card's numbers (payments are not built), and products in
     «Продано»; calls; Altegio's own list of categories («Категории
     клиентов» in the menu). Of the list: the dropdown «По продажам»
     (goods, certificates, subscriptions), the segment «Заканчивается
     абонемент», the conditions «Баланс счёта», «Мобильное приложение»
     and «Altegio.me», the column «Баланс счёта», pinning a column, the
     head's menu button, and the two «PUSH в приложение» actions (a
     notification is one of the message's channels instead).
4. **«Записи» and «График работы»: built 19.11.2026** (the owner; the
   design boards of the same names; `src/app/admin/(app)/records/` and
   `schedule/`, `src/lib/admin/records.ts`, `schedule.ts` and
   `schedule-plan.ts`, the «rc-» and «sc-» blocks of `admin.css`).
   - **The menu:** «Отчёты» (its first page, «Записи») and «Сотрудники»
     («Список», the barbers' own page, and «График работы») are groups,
     first in the menu as in the tool's. A phone has both pages on «Ещё».
     Each has its star.
   - **«Записи»** (`/admin/records`): every visit in one table, laid out
     as its board in the new-style controls (as the client base). Filters:
     created and visit between two days (a new page: the last month to one
     month ahead), barber, who made it, cancelled or not, status, source,
     services, the client by name or phone; «Показать» asks, and what is
     asked is never in the address. The table: a tick, the barber, the
     services joined by «;», the client, the visit's time, who made it and
     when, status, source, and a pencil that opens the calendar's own
     visit sheet. A cancelled row is pale red. «Отменить выбранные» asks
     first and cancels each visit through the calendar's cancel; «Выгрузить
     в Excel» is the filtered list, each export in the audit. A phone: a
     row per visit, the filters in a sheet.
   - **«График работы»** (`/admin/schedule`): the month grid of shifts, to
     its board's sizes and colours from 900px. A cell is the day booking
     sees (`effectiveDay`: the dated day, else the weekly hours, less time
     off). A click marks cells; the panel on the right gives them a kind
     and hours, or fills a period by a template («По дням недели», «По
     сменам»); a barber's «…» copies his days onto others. A working day
     and a day off are dated days, a vacation and a sick day time off. A
     visit is never cut: such a day is refused, by name and count.
     «Печать» is the browser's print, the grid alone on a landscape page.
   - **Whose:** both pages show and change only the barbers a login sees
     in the journal; «Записи» also only the clients it is shown.
   - **Not built:** on «Записи»: the head's menu button and its list of
     all reports; the filters by a visit's category, by payment and «with
     or without services»; the import from Excel; a source's second line.
     On «График работы»: the head's menu button; the filters by position
     and the like (ours: who is shown); unpaid and paid leave and «missed
     shift»; templates of one's own that are kept; two months in a row;
     special time on the grid. «Выгрузить в PDF» is «Печать».
5. **Functionality** Altegio has and we do not (loyalty, stock, cash
   accounts, reports) is a list for Dim to choose from, not part of the
   look.
