# Isolta, page by page

*Scanned 19.11.2026 in Renat's account, **looking only**: nothing was
saved, sent, created, copied or deleted. Measured at a 1920 px window. No
receiver's name, address, code, account or sum is written here. The
summary of the look is `docs/reference-looks.md`; this file is the detail,
so that «Счета» can repeat Isolta's functions and layout (Dim,
19.11.2026), in our own code, icons and words.*

**Two parts.** Part 1: the frame, the dashboard, invoices (list, a sent one,
a draft, their dialogs) and contacts. Part 2: «Товары/услуги», «Отчеты»,
«Add-ons», «Настройки», every invoice status, and the flows that may not be
opened in a live account (send, credit, copy, delete), described from
Isolta's own code strings («code») or its help centre («help»). Each part
ends with what is not verified.

## Frame (new or different from docs/reference-looks.md)

- The app is React + MUI (Material UI) with MUI X DataGrid; all tables are DataGrids.
- Sidebar drawer is 260 px (the doc says 259). Logo box 259×73, padding 24/32, logo image 116×24.
- Menu items are 227×48 at x 16, padding 12/16, 16px/400 white, 8 px corners; the active one is `#252442`.
- Menu and addresses: Рабочий стол `#/`, Инвойсы `#/invoices`, Контакты `#/contacts`, Товары/услуги `#/products`, Отчеты `#/reports`, Add-ons `#/integrations`, Настройки `#/settings`, Выход `#/logout`.
- The open section shows a sub-menu: items 195×36 at x 48, padding 8/16, the current one also `#252442`.
- No user menu or language switch is visible in the frame; the language is in the URL (`/ru#/…`). An Intercom chat bubble sits bottom right.
- Main area is 1645 px wide; content is a centred 1344 px box with 32 px side padding, giving a 1280 px column (x 443–1723).
- Top bar: 88 px, white, padding 24/0, shadow `0 0 1px rgba(18,63,99,.24), 0 4px 16px -1px rgba(18,63,99,.08)`. H1 28px/700/36px `#252442`; buttons right-aligned with 16 px gaps.
- Body starts 32 px under the top bar.

## Рабочий стол

### Dashboard, `#/`
- Purpose: month figures and shortcuts.
- Head: company logo 56×56, company name, account e-mail.
- Three stat cards (296×104, buttons): «Инвосы за текущий месяц» (sic), «Инвойсы за прошлый месяц», «Просроченные инвойсы»; each has rows «Инвойсы» (count) and «Итого» (sum).
- Six tiles (140×126): «Новый инвойс», «Показать инвойсы», «Бухгалтерский отчет», «Новый контакт», «Показать контакты», «Новый товар/услуга». None pressed.
- Promo card (336×254): «Receive e-invoices directly to Finago Isolta», button «Читайте больше».
- Card «Purchase invoices» (519×298): grid Имя / Срок платежа / Итого, empty state «Нет строк», footer «Итого: 0,00 €», «0–0 of 0».
- Card «Latest events» (737×298): «No notifications».
- In use: the stats yes; purchase invoices and events empty.

## Инвойсы

### List, `#/invoices`
- Top bar buttons:
  - «+ Новый инвойс» (primary), not pressed.
  - «Сводка по выбранным инвойсам» (outline), not pressed. The list has no checkboxes, so it presumably summarises the filtered set.
  - «Инструменты» (outline) opens a menu with one item: «Экспорт инвойсов в электронную таблицу», sub-line «Вы получите список инвойсов в формате файла CSV».
- Toolbar, one row of 56 px fields, 16 px gaps:
  - Search «Поиск», 422 px, magnifier at left.
  - Select «Статус», 240 px, with these options:
    - Все инвойсы (default)
    - Group invoices
    - Все подлежащие к получению
    - Просроченые платежи
    - Просрочен, напоминание выслано
    - Просрочен, напоминание не выслано
    - Только непросроченные
    - Черновики инвойсов
    - Оплаченные инвойсы
    - Частично оплаченные инвойсы
    - Выручка
  - Select «Date range», 240 px: Year, Месяц, Неделя, День.
  - Date-range field «ДД.ММ.ГГГГ – ДД.ММ.ГГГГ» with ‹ › step buttons (disabled until a range is set) and a calendar button.
- Calendar popup: 625×408, two months side by side, week row «П В С Ч П С В», day cells 36×36 round 12 px, today ringed. A small select at the bottom picks which date is filtered: «Дата инвойса», «Срок платежа», «Дата платежа».
- Count line under the toolbar: «Инвойсы 1 - 10 (всего: N)», 14 px.
- Table columns (field, width, alignment):

  | Column | Field | Width | Align |
  |---|---|---|---|
  | Статус | invoiceState | 120 | left |
  | Получатель | receiver | 434 | left, bold 700 |
  | № инвойса | invoiceNumber | 110 | right |
  | Референц-номер для оплаты | referenceNumber | 110 | right |
  | Дата инвойса | date | 100 | left, default sort descending |
  | Срок платежа | dueDate | 100 | left |
  | без НДС | vatExclusiveTotal | 110 | right |
  | с НДС | vatInclusiveTotal | 120 | right |
  | (note icon) | memo | 76 | — |

- Every column is sortable from its header. The note icon carries a badge dot.
- Rows: whole row clickable (pointer), opens `#/invoices/<id>`. No row menu, no checkboxes, no bulk actions.
- Footer: «Строк на странице: 10 ▾», «1–10 of N», ‹ ›.
- Status pills seen: «Черновик» and «Просроченный» (the doc says «Просрочен»). Other statuses did not occur on the pages I saw.
- In use: yes, about 480 invoices.

### A sent invoice, `#/invoices/<id>` (read-only view)
- Top bar: H1 «Инвойс N», then four outline buttons, each in its own colour:
  - «Платежи», green `#0f8a71`.
  - «Создать возвратную накладную», blue `#0a60c2`; this is the credit invoice, not pressed.
  - «Напоминания», red `#c20a38`.
  - «Инструменты», indigo.
- Second bar, 48 px: «‹ Sales invoice list» left; «Предыдущий инвойс», «Следующий инвойс» right (32 px buttons).
- Status banner: 1280×57, text «Просроченный», with a chip at the right «Показать действия по инвойсу».
- The chip opens a popover «Действия по инвойсу» (721 px wide, padding 16): rows of a relative time («9 дней назад») plus text. Kinds seen: «Инвойс №N отправлен по электронной почте на электронный адрес …» and «Открыт.» (e-mail open tracking).
- Sheet: one white card 1280 wide, padding 24, blocks top to bottom:
  1. Two columns, 813 + 395 with a 24 px gap, 353 px high.
     - Left top: the sender as three grey lines (name, street, postcode and town). The draft also shows the logo, 56×56, left of them.
     - Left bottom: the receiver card, 813×88, a button with a 56×56 pale-blue icon tile, name 16 px, contact person 12 px grey beside it, address line under.
     - Right: a ruled box with the meta table. Rows: «Номер инвойса», «Референц-номер для оплаты», «Дата инвойса», «Условия оплаты» (number + unit word), «Срок платежа», «Наша ссылка», «Ваша ссылка».
     - Under it, text button «Показать подробные данные (N)» reveals: «Штрафные проценты», «Номер заказа покупателя», «Номер контракта или номер присвоения», «Дата доставки», «Способ доставки», «Период уведомления».
  2. «Описание (до строк инвойса)»: a full-width field with a dashed border.
  3. H2 «Количество строк инвойса» with the count «(1)» in grey.
  4. Lines grid: № товара/услуги 110 · Имя 595 · icon 50 · Цена за единицу 155 · Кол-во 70 · Единица (товара/услуги) 70 · Скидка % 70 · Итого 110. Rows are 72 px; price and total cells are two-line (amount, then «-» here).
     - The icon in each row is «Добавить товар/услугу в список товаров/услуг»; it writes, not pressed.
  5. Totals, a 300 px block at the right: «Итого без НДС», «НДС», a hairline, «Итого».
  6. «Текст после строк инвойса»: the same dashed field.
- «Инструменты» menu on a sent invoice (none pressed):
  - Заметка к инвойсу
  - Приложения
  - Удалить инвойс
  - Сделать копию инвойса
  - Модифицировать инвойс
  - Предварительно просмотреть и снова отправить инвойс
  - Сохранить PDF
  - Печать
  - Создать… (sub-line «Сообщение, Подтверждение заказа, Сопроводительная накладная»)

### Dialog «Платежи»
- Section «Добавить новый платеж».
- Fields: «Вид платежа» (select: «Платеж», «Безнадежный долг»); «Итого оплачено» (number with €, prefilled with the open sum); «Дата заказа» (date); «Дата платежа» (date).
- Buttons: «Добавить платеж» (primary, not pressed); footer «Закрыть».

### Dialog «Напоминания»
- Section «Создать новое напоминание».
- Fields: «Комиссия за просрочку платежа» (number, €, prefilled 5,00); «Штрафные проценты» (number); «Interest rate» (select: «Годовая процентная ставка», «Дневная процентня ставка»); «Напоминание» (textarea).
- Buttons: «Предварительно просмотреть и отправить» (primary, not pressed); footer «Закрыть».

### A draft, the same address `#/invoices/<id>` (the editor)
- Top bar: «Предварительно просмотреть и отправить инвойс» (primary, 384 px, not pressed), «Заметка к инвойсу», «Приложения», «Инструменты».
- «Инструменты» on a draft: «Удалить черновик инвойса», «Сделать копию инвойса», «Создать…».
- Second bar as on a sent invoice; no status banner.
- Receiver:
  - With a receiver: the card plus an «Удалить» × at its right.
  - Without one: an autofocused combobox «Ввести имя получателя» (781×56) whose list opens at once. Each row is a 40 px round icon, name, contact person small, address small. The last row is «+ Добавить новый контакт» (not pressed).
- Meta table, editable:
  - «Номер инвойса» is a button showing the next number. It reveals «Префикс номера инвойса», «Суффикс номера инвойса», «Спрятать» and a link «Настройки инвойсирования» (read from the DOM, not expanded).
  - «Референц-номер для оплаты»: text, prefilled.
  - «Дата инвойса» and «Срок платежа»: date fields with a calendar button.
  - «Условия оплаты»: a number plus a unit-word text field.
  - «Наша ссылка», «Ваша ссылка»: text.
  - The six detail rows are text, except «Дата доставки» (date).
- Lines head, right side: «Единицы N» and «Валюта EUR ▾».
- Dialog «Выбрать другую валюту», select «Валюта»: Евро (EUR), Шведская крона (SEK), Норвежская крона (NOK), Датская крона (DKK), Доллар США (USD), Британский фунт стерлингов (GBP), Российский рубль (RUB), Польский злотый (PLN), Швейцарский франк (CHF), Канадский доллар (CAD), Австралийский доллар (AUD), Китайский юань (CNY).
- Lines grid in a draft: drag handle 50 · № товара/услуги 110 (placeholder «Номер») · Имя 495 (placeholder «Имя») · add-to-products icon 50 · Цена за единицу 155 · Кол-во 70 · Единица 70 · Скидка % 70 · Итого 110 · × «Удалить строку инвойса» 50.
- A click on a cell turns that one cell into an input; Escape leaves it.
  - «Имя» is a combobox (suggestions list).
  - «Цена за единицу» opens a popup «Выбрать ставку НДС» (368 px, with an info icon) holding three selects:
    - «Показывать НДС на инвойсе»: «Показать НДС», «Без НДС».
    - «НДС %»: 24, 13, 9, 0 and a custom value. Disabled while «Без НДС»; values read from the component, option labels not seen.
    - «Редактировать цены»: two options, «без НДС» and presumably «с НДС»; disabled here.
  - «Единица» is a combobox with grouped suggestions:
    - «Единицы»: шт. Штука, ящ. Ящик, упак. Упаковка.
    - «Единицы времени»: ч. Час, сут. Сутки, месяц Месяц.
    - Further (group names not read): т Тонна, кг Килограмм, гр. Грамм, л Литр, км Километр, м Метр, м2 Квадратный метр, м3 Кубический метр.
- Under the grid, left: «Код НДС» and «Причина ставки НДС 0%», each with a «- ▾» button; both open the dialog «Варианты НДС 0%». Then «+ Добавить строку инвойса» (primary, 224×40, not pressed).

### Dialog «Варианты НДС 0%»
- Text: «Вы добавили строки счета, где НДС составляет 0%. К этим строкам нужно добавить код НДС и вписать причину, по которой НДС составляет 0%. Пожалуйста, заполните эти поля.», plus a link «Дополнительная информация».
- Select «Код НДС»: AE - VAT Reverse Charge; E - Exempt from tax; G - Free export item, tax not charged; K - Exempt for EEA intra-community supply of goods and services; O - Services outside scope of tax; Z - Zero rated goods.
- Text field «Причина ставки НДС 0%».
- Info box: «Если вы не являетесь плательщиком НДС, выберите O, как код НДС. Опишите фразу "Не являюсь плательщиком НДС" в причину ставки НДС 0%.»
- Footer: «Cancel», «Save» (disabled until filled).

### Dialog «Заметка (не будет видна на инвойсе)»
- Textarea «Заметка», counter «0 / 4000», «Save» (primary).

### Dialog «Приложения к инвойсу»
- Line: «Позволяется загружать не более 10 файлов суммарным размером в 5 МБ.»
- Drop zone: 582×140, 2 px dashed border, upload icon, «Добавить приложение», «Разрешенные типы файлов: pdf, jpg, png, doc, docx, xls, xlsx, odt, ods».
- Info box: «Приложения хранятся на сервисе в течение 90 дней. Приложения доставляются автоматически при электронном инвойсировании или при доставке по электронной почте. …», plus a link «Дополнительная информация о приложениях».

## Контакты

### List, `#/contacts`
- Sub-menu: «Контакты» `#/contacts`, «Show contact groups» `#/contacts/groups`, «Показать отчет» `#/contacts/report`.
- Top bar: «+ New contact» (primary, not pressed), «Инструменты».
- «Инструменты» menu: «Экспорт контактов в файл электронной таблицы» (sub-line «Вы получите список контактов в файле формата CSV»), «Импортировать контакты из CVS-файла». Neither pressed.
- Search «Search contacts» (320×56); count at the right «Контакты с 1 по 10 (всего: N)».
- Columns: checkbox 50 · type icon 60 (company or person, 40 px round) · Имя 640 (bold, sorted ascending) · Адрес для выставления инвойса 160 · Почтовый индекс 110 · Населенный пункт 130 · Инвойсы 80 (count) · note 50.
- Rows 52 px; a row click opens the contact. Footer as on invoices.
- Checkboxes exist; bulk actions were not triggered (no ticking).
- In use: yes, 18 contacts, companies and private persons.

### One contact, `#/contacts/<id>`
- Top bar: «‹ Назад» left; «+ Новый инвойс» (primary) and «Удалить контакт» (red outline) right. Neither pressed.
- Card (1280 wide, padding 24): icon tile + name (H2) + «Редактировать контакт» (outline) at the right.
  - «Данные для выставления инвойса»: «Адрес»; then three columns «Код реестра», «Номер НДС», «Preferred invoicing method».
  - «Contact information»: «Отдел / контактное лицо в компании»; then «Номер телефона», «Адрес электронной почты», «Номер клиента».
- Three tabs, each with an icon:
  - «Журнал действий» (default): button «Создать запись в журнале действий» (not pressed); table «Действие по инвойсу» (date-time) / «Описание» with rows like «Открыт.» and «Инвойс №N отправлен по электронной почте на электронный адрес …».
  - «Инвойсы» (`?tab=invoices`): the full invoices list for this contact, with the same toolbar, «Сводка по выбранным инвойсам», «Инструменты» and an extra «Показать фильтры».
  - «Заметка» (`?tab=memo`): one textarea «Заметка» and «Save» (disabled until changed).

### Dialog «Редактировать контакт» (opened, closed with X, nothing saved)
- «Вид»: a tab-like switch at the right. On an existing company it shows only «Компания», disabled.
- «Информация»: «Имя компании», «Отдел / контактное лицо в компании», «Код реестра», «Номер НДС» (all text).
- «Адрес»: «Адрес для выставления инвойса (почтовый адрес)», «Почтовый индекс», «Населенный пункт», «Страна» (select, 260 countries, starting FI, EE, SE, LV, DE, then alphabetical); small button «+ Дополнительная строка».
- «Контакты и адрес для выставления счета»:
  - «Адрес электронной почты» (email), «Номер телефона» (tel).
  - «Invoicing method» (select): Electronic invoice, Email invoice, Paper invoice, Скачать PDF.
  - «Язык» (select): Финский, Шведский, Немецкий, Английский, Эстонский, Латышский, Русский.
  - Three small «+» buttons: «E-invoice address», «Номер клиента», «Contact groups» (not expanded).
- Footer: «Save».

## Components

- **Text:** primary `rgba(11,11,20,.87)`; secondary and labels `rgba(11,11,20,.6)`; headings and values `#252442`; icon buttons `rgba(11,11,20,.56)`. Body 16px/24px; tables and labels 14px/20px.
- **Card:** white (`rgba(255,255,255,.9)`), 8 px corners, no border, shadow `0 4px 16px -1px rgba(18,63,99,.08), 0 0 1px rgba(18,63,99,.24)`. Padding 24 (sheet, contact card) or 16 (dashboard).
- **Buttons, 40 px:** 14px/500/24px, 8 px corners, icon at left.
  - Primary: `#312e6b`, text `#f3f3f7`, padding 0 16.
  - Outline: transparent, border `1px rgba(49,46,107,.5)`, padding 0 15.
  - Danger outline: `#c20a38`, border the same at .5.
  - Disabled: background `rgba(0,0,0,.12)`, text `rgba(0,0,0,.26)`.
- **Buttons, 32 px** (back, previous/next, «+ …» adders): 12px/500/22px, same outline.
- **Icon button:** 40×40 round.
- **Text button:** 14px/500 `#312e6b`, padding 6/8.
- **Input / select (MUI outlined):** 56 px high, 8 px corners, border `1px rgba(0,0,0,.23)`, focus `2px #312e6b`, text 16 px, label on the border in grey. Free-text areas on the invoice use a dashed border of the same colour.
- **Menu / listbox:** white, 8 px corners, shadow `0 5px 5px -3px rgba(0,0,0,.2), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12)`. Items 16 px, padding 6/16; selected `rgba(49,46,107,.08)`. Tool-menu items are indigo with an icon and an optional small grey second line.
- **Popover** (action log, VAT popup): padding 16, shadow `0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px rgba(0,0,0,.14), 0 1px 3px rgba(0,0,0,.12)`.
- **Status pill:** 24 px high, 16 px radius, transparent, 13px/400, label padding 0 7.
  - «Черновик»: `#c2660a`, border the same at .7.
  - «Просроченный»: `#c20a38`, border the same at .7.
- **Chip button in the banner:** 32 px, 1 px `#c20a38`.
- **Banners:**
  - Error: background `#ffe5eb`, border `1px #c20a38`, text `#66001a`, icon `#c20a38`, 8 px corners, padding 6/16.
  - Info: background `#e5f1ff`, border `1px #0a60c2`, text `#003066`.
- **Table (DataGrid):** border `1px #e0e0e0`, 8 px corners, white.
  - Head 56 px, titles 14px/500 grey.
  - Rows 52 px (invoice lines 72 px), cell padding 0 10, 14 px, hairlines `#e0e0e0`.
  - Footer 52 px; «Строк на странице:» 14 px grey.
- **Meta table on the invoice:** box 395 wide, padding 16, border `1px #e0e0e0`, 8 px corners. Rows 37 px (57 for two-line labels) with a bottom hairline. Label cell 144 px, 14px/500 grey, padding 8; value cell 216 px, 14px/400.
- **Totals:** 300 px wide; label 14 px grey left, value 14 px `#252442` right; 8 px between lines; hairline `rgba(0,0,0,.12)` above «Итого».
- **Section titles:** H2 24px/600/40px `#252442`; H6 20px/600/28px `#252442`.
- **Tabs:** 48 px high, equal width (248), 14px/500, icon + label. Selected `#312e6b` with a 2 px `#312e6b` underline; others grey.
- **Dialog:** 630 px wide, white, 8 px corners, backdrop `rgba(15,25,44,.7)`.
  - Head padding 24, title 24px/600/32px, X 40×40 at the right.
  - Body padding 8/24/24.
  - Footer with top line `1px #e4e6eb`, padding 16/24, buttons right.
- **Icon tiles:** 56×56 with 8 px corners (invoice receiver, contact head) or 40×40 round (lists), background `#e5f8ff`, icon `#312e6b`. Dashboard tile icon: 32×32, 8 px corners, `#ccd0ff`.
- **Dashboard stat caption:** 12px/700 uppercase, letter-spacing 1 px; `#086a91` (this month), `#0a60c2` (last month), `#c2660a` (overdue).
- **Empty states:** «Нет строк» centred in the grid; «No notifications» as plain grey text.

## In use at this company

- **Used:**
  - Invoices: about 480; numbering runs on, and the reference number is filled automatically.
  - Sending by e-mail, with the «Открыт» open tracking in the action log.
  - Contacts: 18, with address, registry code, phone, e-mail; language Estonian on the one opened.
  - Payment terms: 5 days on the issued invoices I saw; a fresh empty draft defaults to 14.
  - The company logo on drafts.
- **How invoices are filled** (the one opened): one line, free-text name, no product number, no unit, no discount, «Без НДС».
- **Barely used or not used:**
  - Payments: about 420 of the 480 invoices stand as «Просроченный», so payments are mostly not recorded.
  - Purchase invoices (empty) and latest events (empty).
  - On what I opened, these were all empty: invoice note, attachments, description texts, our/your reference, the six detail fields, VAT number, preferred invoicing method, customer number and contact note.
- Two drafts sit at the top of the list, both dated today; one has no receiver. I did not create either.

## Not opened or not verified

- **Whole sections:**
  - Товары/услуги (`#/products`), list and one item.
  - Отчеты (`#/reports`).
  - Add-ons (`#/integrations`).
  - Настройки (`#/settings`): company, invoice layout and numbering, VAT, bank accounts, e-mail texts, e-invoice operator, users, subscription and plan.
- **Not found in the menu, addresses not tried:** recurring invoices, offers or quotes, a separate credit-invoice list, a purchase-invoice page, a payments or bank page, a reminders list.
- **Invoices, never pressed:**
  - «Новый инвойс» and `#/invoices/new`.
  - «Сводка по выбранным инвойсам».
  - The preview-and-send screen.
  - «Создать возвратную накладную».
  - «Модифицировать инвойс», copy, delete, «Сохранить PDF», «Печать».
  - The «Создать…» sub-items.
  - CSV export.
- **Invoices, not verified:**
  - Pills and banners for paid, partly paid, sent but not due, reminded and credited.
  - The result of each status filter, including what «Group invoices» and «Выручка» show.
  - Rows-per-page options.
  - Hover and selected row colours.
  - The note-icon tooltip.
  - Whether the final «Итого» is bold.
  - The helper line under the description fields.
  - The printed or PDF layout of an invoice.
- **Invoice editor:**
  - The number prefix/suffix rows (DOM only).
  - A click on the receiver card.
  - The cell editors for №, Кол-во and Скидка %.
  - Option labels of «НДС %» and «Редактировать цены».
  - The date pickers inside the meta table.
- **Contacts:**
  - `#/contacts/groups` and `#/contacts/report`.
  - «New contact», including the private-person form.
  - The expanders «E-invoice address», «Номер клиента», «Contact groups» and «Дополнительная строка».
  - «Создать запись в журнале действий».
  - Bulk actions after ticking rows.
  - CSV import.
  - «Показать фильтры» on the contact's invoices tab.
- **Frame:** a user or profile menu, a language switch inside the app, the Intercom help panel, «Выход».

---

# Part 2: products, reports, add-ons, settings, statuses, flows

## Товары/услуги

### List, `#/products`
- Purpose: a catalogue of saved invoice lines.
- Sub-menu: «Товары/услуги» `#/products`, «Показать отчет» `#/products/report`.
- Top bar: «+ New product» (primary, 143×40) and «Инструменты» (outline, 147×40).
- «Инструменты» menu, 471 px wide:
  - «Экспортировать товары/услуги в электронную таблицу», sub-line «Вы получите список товаров/услуг в виде CSV-файла» (56 px item).
  - «Импортировать товары/услуги из CSV файла» (36 px item).
- Empty state, a centred 480×340 block:
  - tile 80×80, `#e5f8ff`, 4 px corners, 48 px icon;
  - H2 24px/600 «Вы не создали еще ни одного продукта.»;
  - primary «+ Создать новый товар/услугу» (245×40).
- With data (code, not seen):
  - search «Search products»;
  - columns: checkbox · «Номер товара/услуги» (min 110) · «Имя» (flex) · «Единица (товара/услуги)» (min 80) · «Цена без НДС» (min 150, right) · «НДС %» (min 80, right) · «с НДС» (min 150, right) · note icon;
  - bulk action after ticking: «Remove %count% products», with confirm «Remove products»;
  - empty search: «Товары/услуги не найдены».
- In use: empty.

### Dialog «Добавить новый товар/услугу» / «Редактировать данные товара/услуги» (code, not opened)
- Row 1, widths 3/6/3 of 12:
  - «Номер товара/услуги»: text, max 20, autofocus.
  - «Имя*»: text, required, max 100.
  - «Единица»: the same grouped unit combobox as on invoice lines.
- Divider, then row 2, widths 9/9/6 of 24:
  - «VAT incl./excl.»: select.
  - «Цена за единицу товара/услуги»: money field with the currency.
  - «НДС %»: rate select.
- Two computed lines: «Цена за единицу без НДС», «Цена за единицу с НДС».
- «Заметка»: 3-row textarea, max 255, placeholder «Введите текст примечания сюда».
- Footer: save; on an existing item also copy and remove.
- Remove confirm: «Удалить товар/услугу из списка товаров/услуг» / «Желаете ли вы удалить данный товар/услугу из списка?».
- Toasts: «Товар/услуга сохранен(а)!», «Товар/услуга удален(а)».

### Dialog «Импортировать товары/услуги» (code)
- Help block «Инструкции по импортированию»: «Формат файла: CSV (разделение через запятую)», a row limit, new items only, «Файл для примера».
- File chooser «Выбрать файл», a preview of the rows, button «Импортировать товары/услуги», then counts of imported rows and errors.

### Product report, `#/products/report` (same page as `#/reports/products`)
- H1 «Отчет о продукции».
- Row 1:
  - select «Date range»: Year, Месяц (default), Неделя, День;
  - range field with ‹ › and a calendar button;
  - at the right a switch «Include sales of unsaved products» (off).
- Row 2:
  - button group «без НДС | с НДС», 2 × 141×40;
  - at the right a stat line: «Products», «Sold products», «Total sales», «Average product price».
- Grid, 1280 wide: Номер товара/услуги 110 · Имя 428 (sorted ascending) · Sales 100 · Returns 100 · Units sold 130 · Итого без НДС 130 · Average price 160 · Last sold 120; the last six right-aligned.
- Empty text «No products sold». Free-typed lines show as «Unsaved product» (code).
- Footer: «Строк на странице» 10 / 25 / 50 / 100.
- In use: empty.

## Отчеты

### Sales reports, `#/reports`
- H1 «Отчеты по продажам».
- Sub-menu: «Отчеты по продажам» `#/reports`, «Отчет клиента» `#/reports/contacts`, «Отчет о продукции» `#/reports/products`.
- Period row:
  - ‹ (40×40), the month as H2 24px/600, › (40×40); it opens on the previous month;
  - outline «Редактировать отчетный период» (271×40); per code it swaps the month stepper for two date pickers and becomes «Показать выбор месяца»; not pressed;
  - at the right, 14 px grey: «Reports for the period: ДД.ММ.ГГГГ – ДД.ММ.ГГГГ».
- Four cards, 2 × 2, each 624×204 with padding 24 and a 32 px gap. Each has an H2 24px/600, a count line 16px/600, a description 14 px, and a primary «Скачать отчет» (151×40, download icon), grey and disabled when the count is 0.

  | Card | Count line | Description |
  |---|---|---|
  | «Сводка по инвойсам» | «N инвойсы» | «Платежи, отправленные в отчетном период» (sic) |
  | «Платежи» | «N платежа/ей» | «Платежи, полученные в отчетном периоде» |
  | «Дебиторская задолженность» | «неоплаченных инвойсов: N» | «Дебиторская задолженность на конец отчетного периода» |
  | «Бухгалтерский отчет, основанный на платеже» | «N платежа/ей» | «Отчет о счете на основе полученных платежей за отчетный период» |

- No tables, totals or charts on screen: each report is a file from the server (the first is a PDF by its address in code). None downloaded.
- In use: the invoice summary and receivables carry counts (about 416 unpaid); both payment reports show 0 and are disabled.

### Client report, `#/reports/contacts` (same page as `#/contacts/report`)
- H1 «Отчет клиента». Toolbar as the product report, without the switch.
- Stat line: «Total customers», «Sales invoices», «Credit notes», «Total sum».
- Grid: type icon 60 · Имя 438 (sorted ascending) · Sales invoices 120 · Credit notes 120 · Total sold 130 · Total credited 130 · Total sum 130 · Last invoiced 150; the last six right-aligned.
- «Last invoiced» is an indigo link to that invoice. Rows are 52 px and not clickable.
- Empty text (code): «No invoices during the selected time period».
- In use: yes, 5 customers in the current month.

## Add-ons

### `#/integrations`, which redirects to `#/integrations/etasku`
- H1 «Finago eTasku». A pale-blue band with a photo, then a card 1280×260, padding 24.
- Card: green icon tile, H2 «Transfer your sales invoices to eTasku automatically», caption «Activating a connection to eTasku», one paragraph.
- Buttons: «Log in to eTasku» (green `#0f8a71`, 162×40) and «Читайте больше» (outline, external link). Neither pressed.
- It is the only add-on shown. Code has two more routes, `maksuvahti` (debt collection) and `mobilepay`, both Finnish.
- Active: none.

## Настройки

Sub-menu: «Моя компания» `#/settings`, «Настройки инвойсирования» `#/settings/invoicing`, «Заказ» `#/settings/order`, «Мой аккаунт» `#/settings/account`, «Порекомендуйте» `#/settings/refer-to-friend`.

### «Моя компания», `#/settings`
- This page shows bank details in clear text, so no screenshot was saved.
- Card 1 (1280×536, padding 24): icon tile, H2 with the company name, «Edit» (outline, 85×40; not pressed).
  - Read-only fields in three 389 px columns: label 14 px grey, value 14 px under it, a hairline below.
  - H6 «Basic information»: «Имя компании», «Код реестра», «Номер НДС».
  - H6 «Contact information»: «Адрес электронной почты», «Номер телефона», «Веб-страница».
  - H6 «Адрес»: «Дополнительная строка», «Почтовый адрес», «Почтовый индекс», «Населенный пункт», «Страна».
- Card 2 «Логотип» (1280×326):
  - buttons «Логотип в инвойсе» (outline, 179×40) and «Удалить логотип» (red outline, 167×40); neither pressed;
  - box «Просмотр» (1232×214, 1 px line, 4 px corners): a mock invoice head with the logo and sender lines at the left, and «ИНВОЙС», «Номер инвойса», «Референц-номер для оплаты», «Дата инвойса» at the right;
  - «Логотип в инвойсе» per code is «Расположение логотипа и адреса в верхней части инвойса» with four options:
    - «Поместить адрес автоматически, основываясь на логотип (по умолчанию)»;
    - «Показать адрес с правой стороны логотипа»;
    - «Показать адрес под логотипом»;
    - «Показать только логотип».
- Card 3 «Банковский счет, указаннный в инвойсе» (sic) (1280×365):
  - one account card (395×253, 1 px line, 8 px corners, a button) with the label «Номер банковского счета»;
  - one dashed card «Добавить банковский счет»;
  - dialog per code, «Добавить банковский счет» / «Редактируй банковский аккаунт»: «Номер банковского счета» (IBAN, with a tooltip), «BIC/SWIFT», «Название банка», «Сохранить»; delete asks «Delete bank account».
- Sending is blocked without a bank account and a sender address (code: «Невозможно отправить инвойс без указания номера банковского счет…», «Добавить адрес отправителя инвойса»).

### «Настройки инвойсирования», `#/settings/invoicing`
- Five cards, each with an icon tile and an H2; four have their own «Save» (primary, 91×40).
- «Общие параметры» (1280×359):
  - «Следующий № инвойса»: text, 400 px.
  - «Префикс номера инвойса» and «Суффикс номера инвойса»: text, 338 px each, with an info icon. Tooltip: «Внимание! При использовании формата e-invoice, префиксы и суффиксы номера инвойса используются только в изображении инвойса, но не в электронном сообщении».
  - «Сопроводительное письмо для электронной почты, по умолчанию»: textarea, 1204 px.
- «Значения по умолчанию» (1280×728):
  - «Описание (до строк инвойса)» and «Текст после строк инвойса»: textareas, 580 px each.
  - «Штрафные проценты»: text with «%» at the end.
  - «Условия оплаты»: number 0–999 with «дня/дней» at the end.
  - «Период уведомления»: text.
  - «Код НДС»: select with AE, E, G, K, O, Z, as in the «Варианты НДС 0%» dialog.
  - «Причина ставки НДС 0%», «Наша ссылка», «Ваша ссылка»: text.
  - «Текст напоминания»: textarea.
- «Строка инвойса» (624×313):
  - «НДС %»: 24 %, 13 %, 9 %, 0, «... Другая ставка НДС».
  - «Показывать НДС на инвойсе»: «Показать НДС», «Без НДС».
- «Внешний вид инвойса» (624×233): «Редактировать цены»: «без НДС», «с НДС». This is the only layout setting; there is no template, colour or font choice.
- «E-invoicing settings» (1280×200), text only: «Выставление э-инвойсов активировано. Чтобы отправить э-инвойс, выберите «Отправить как электронный инвойс»… Мы осуществляем выставление э-инвойсов в Эстонии в сотрудничестве с Unifiedpost AS.»
- **Reference number rule:** no setting. On the list every issued invoice's reference is the invoice number plus one check digit (Finnish 7-3-1 method). Help: generated references should not be changed.
- Not on any page: reminder schedule, e-mail sender, subject template, invoice language (set per contact), users.

### «Заказ», `#/settings/order`
- Top bar: H1 «Заказ» with a 16 px sub-line «Your current plan: Pro - Annually».
- Card 1280×495: 80 px tile with a cart, H2 «Ваша подписка на настоящий момент действительна.».
- Inner card 480×239 «Подробные данные подписки»: «Выбранная версия», «Billing period», a hairline, «Total excl. VAT», «VAT %».
- Footnote, 14 px: valid for one billing period, paid by invoice, renews automatically, cancelled by chat or e-mail a month ahead.
- No buttons and no payment data. No screenshot saved.
- Plans named in code:
  - Starter: free, «10 инвойсов в год».
  - Basic 25: «25 инвойсов в год», «Доступно только для годовых счетов».
  - Basic 30.
  - Pro: «Неограниченное количество инвойсов».
  - Premium: unlimited, plus Maksuvahti collection.
- The page does not list what Pro includes beyond that.

### «Мой аккаунт», `#/settings/account`
- This page shows secret fields (three password inputs, empty), so no screenshot was saved.
- Cards, 624 wide in two columns:
  - «Имя пользователя»: the login e-mail and «Изменить» (outline); code shows an e-mail verification code step.
  - «Two-factor login»: text about linking to the Finago Portal, and «Activate» (green).
  - «Billing information for use of the service» (full width): «Billing method», «Billing address (Same as company address)», «Edit», link «Learn more.».
  - «Язык интерфейса»: select «Язык» with Suomi, Svenska, Deutsch, English, Eesti, Latviešu, Русский.
  - «Сессия»: «Вы можете завершить все другие активные сеансы…» and «Прекратить» (red outline).
  - «Изменить пароль»: «Текущий пароль», «Новый пароль», «Подтвердить пароль», and a primary «Изменить пароль».
  - «Export your data»: «Create export» (primary); it builds a zip of invoices, customers and products.
  - «Удалить аккаунт»: text only while a paid order runs.
- No users or roles page exists; the account is one login.

### «Порекомендуйте», `#/settings/refer-to-friend`
- A referral card: a read-only «Copy link» field with a copy button, and «Share», «Tweet», «Email». It holds a personal link. Not relevant to us.

### Pages not in the menu, reached by address
- `#/settings/notifications-settings` «Оповещения»: one checkbox «Входящий инвойс принят» and «Save».
- `#/settings/export` «Data export»: «New export»; empty («You have not made any exports yet»).
- `#/settings/e-invoicing` «Digital invoicing» (`#/e-invoices` redirects here): strong identification to activate digital invoicing, e-invoices to Finland, receiving purchase invoices as e-invoices.
- `#/settings/integrations` «Transfers»: moving data to Procountor Solo, button «Начать».
- `#/products/vat-update` «Update VAT rate for products»: a one-off tool for a Finnish rate change.
- `#/possibly-affected-invoices`: a bare grid (Отправлен, Amount, Получатель, E-invoice address used for delivery).
- `#/expenses/purchase-invoices`: «Page not found».
- Routes in code that I did not open: `#/invoices/<id>/send`, `#/invoices/<id>/send-reminder`, `#/contacts/groups/<id>`.

## Контакты

### Contact groups, `#/contacts/groups`
- H1 «Contact groups»; top bar «+ New contact group» (primary, 183×40).
- Empty state as on products: H2 «You have not created any contact groups yet.» and «Create a new contact group» (237×40).
- Per code:
  - a group has a unique name and a note («Enter notes on the contact group here»);
  - «Members» with «Add contact to group» and «%count% contacts in the group»;
  - a size limit;
  - «Modify», «Remove contact group» (the contacts themselves stay);
  - a lock while «Invoices are being sent to this group».
- This is what the status filter's «Group invoices» refers to: one invoice sent to a whole group.
- In use: empty.

### `#/contacts/report`
- The same page as «Отчет клиента» above; the sub-menu item «Показать отчет» is lit.

### Contacts list, additions (code)
- Bulk action after ticking: «Remove %count% contacts», with confirm «Remove contacts».
- Deleting a contact that has invoices warns «Удаление контакта не рекомендуется…».

## Инвойсы (reading only)

### Status pills
- Only «Черновик» and «Просроченный» occur: on the list's first page and in the latest invoices of nine contacts (about 57 rows read through `#/contacts/<id>?tab=invoices`).
- The rest below is from code and the theme, not seen rendered.
- The pill is an outlined small chip: text in the colour, border the same at .7.

  | State | Label | Colour |
  |---|---|---|
  | draft | «Черновик» | warning `#c2660a` |
  | modifiedDraft | «Инвойс в процессе модификации» | warning `#c2660a` |
  | sending | «Sending» | info `#0a60c2` |
  | invoiced (sent, not due) | «Отправлен» | primary `#312e6b` |
  | due | «Просроченный» | error `#c20a38` |
  | paid | «Оплачено» | success `#0f8a71` |
  | badDebt | «Безнадежный долг» | warning `#c2660a` |
  | reimbursed (credited) | «Возмещен» | default grey |
  | reimbursement (the credit note) | «Возвратная накладная» | default grey |

- How the state is derived: an invoice being modified is `modifiedDraft`; an issued one is credited, a credit note, paid or bad debt (once a payment date exists), `due` after the due date, else `invoiced`; a locked unissued one is `sending`; else `draft`.
- There is no pill for «partly paid» or «reminded»; those exist only as filters. A pill click opens the «Действия по инвойсу» popover.

### Banner on the invoice page (code)
- Title: the state label. Severity: paid is success, due is error, everything else info.
- Colours: success `#e8fcf8` ground, `#0f8a71` line, `#084539` text; error and info as already documented.
- Extra content:
  - an issued or overdue invoice with a paid amount above 0 gets a small outline button «Частично оплачено» that opens «Платежи»;
  - a credit note links to its original («Возвратная накладная для инвойса N»);
  - a credited invoice links to its credit note.

### List details
- Rows per page: 10 / 25 / 50 / 100.
- Row hover: `rgba(11,11,20,.04)`; a selected row: `#312e6b` at 8 %.
- The status filter is local state, not in the address.
- Code also has «Показать также старые инвойсы» (the list is capped) and the empty texts «Вы еще не создали ни одного инвойса.» and «По данному критерию поиска инвойсов не найдено».
- «Сводка по выбранным инвойсам» (code): rows «Выставленные инвойсы», «Возвратные накладные», «Оборот», «Неоплаченные счета», «Просроченные инвойсы», «Плохие долги», «Черновики инвойсов», with «Итого без НДС» and «Итого с НДС»; note «Invoices in other currencies are excluded from the total.».
- On the invoice sheet the final «Итого» is not bold (14px/400, `#252442`).

### Flows not opened
- **Preview and send** (code; `#/invoices/<id>/send`): heading «Выберите способ отправки инвойса и отправьте инвойс получателю». Methods:
  - «Отправить с помощью службы электронной почты», with fields «Получатель», «Тема», «Сопроводительное письмо» and a help link; a changed address offers to update the contact card.
  - «Отправить как электронный инвойс (e-invoice)»; with 0 % VAT it needs the VAT code and reason.
  - «Отправить с помощью услуги печати» (paper by post; attachments cannot go).
  - «Скачать PDF» («The invoice will not be sent to your customer automatically.»).
  - Also «Сохранить черновик инвойса в формате PDF»; after sending, «Скачать» and «Печать».
- **E-mail delivery** (help): the mail comes from Isolta's own address and carries the sender's words, basic invoice data and a link, not the payment details. The linked page is valid 90 days and lets the receiver view, print and save a PDF.
- **Credit invoice** (code and help): confirm «Создать возвратную накладную» / «Вы ходите создать возвратную накладную по данному инвойсу?». Full credit only, never partial. Blocked while payments exist («Чтобы аннулировать этот инвойс, удалите из него все платежи.»). The original stays, with the credited status.
- **Delete** (code): only the first or the last invoice, «Чтобы не было разрыва в порядковых номерах инвойсов».
- **Modify** (code): a warning that advises crediting instead; it makes a `modifiedDraft`, and sending it replaces the original.
- **Copy** (code): «Инвойс будет скопирован как новый черновик».
- **«Создать…»** (help): from a draft it makes a quote, order confirmation or dispatch note as a PDF to download or print; the draft stays.
- **Reminder** (code): its send step is «Выберите способ доставки напоминания».
- **Recurring invoices:** none in the menu, the routes or the strings.

## Components (new only)
- **Button group (two-way switch):** two 141×40 buttons, 14px/500; the chosen one filled `#312e6b` with `#f3f3f7` text, the other outline; outer corners 8 px, inner 0.
- **Stat line over a report grid:** right-aligned items, label 14px/400 `rgba(11,11,20,.6)`, value under it 14px/400 `#252442`, centred.
- **Empty state:** tile 80×80 `#e5f8ff` with 4 px corners and a 48 px icon, H2 24px/600, one primary button; the block is 480 wide and centred.
- **Report card:** 624×204, padding 24; H2, H6 16px/600, P 14 px, button.
- **Read-only field:** label 14 px grey over a 14 px value, a hairline under, in three 389 px columns.
- **Settings card head:** an icon tile left of the H2, which starts 56 px in from the card's padding (tile size not measured).
- **Choice cards (bank accounts):** 395×253, 8 px corners, `1px solid rgba(30,50,89,.12)`; the «add» card has the same line dashed.
- **Switch with label:** the label at the left, 16 px.
- **Green button:** `#0f8a71` with `#fcfcfd` text («Activate», «Log in to eTasku»).
- **Theme palette:**

  | Name | Main | Light | Dark |
  |---|---|---|---|
  | primary | `#312e6b` | `#ccd0ff` | `#252442` |
  | secondary | `#086a91` | `#e5f8ff` | `#004966` |
  | success | `#0f8a71` | `#e8fcf8` | `#084539` |
  | info | `#0a60c2` | `#e5f1ff` | `#003066` |
  | warning | `#c2660a` | `#fff2e5` | `#663300` |
  | error | `#c20a38` | `#ffe5eb` | `#66001a` |

## In use at this company
- **Not used:** products (none; lines are typed free-hand), contact groups, add-ons, data export, two-factor login.
- **Company:** name, registry code, e-mail, web page and address filled; VAT number and phone empty; a logo; one bank account.
- **Numbering:** the next number is set; no prefix or suffix; the reference follows the number.
- **Defaults:** payment terms 14 days; every default text empty (cover letter, both descriptions, reminder text, references, penalty interest, notice period, VAT code).
- **VAT:** «Без НДС»; prices edited «без НДС»; the preset rate shows 20 %, which is not among the listed rates.
- **E-invoicing:** the page says it is activated (Estonia, through Unifiedpost).
- **Plan:** Pro, billed annually. Interface language Russian. The notification «Входящий инвойс принят» is on.
- **Reports:** last month a handful of invoices, about 416 unpaid, no payments recorded.
- **Statuses:** only drafts and overdue invoices among the latest rows.

## Not opened or not verified
- Every pill and banner except draft and overdue, rendered; the grey chip's exact border; the result of each status filter.
- The report files' content and layout; the period editor with date pickers.
- The product dialog, the products list with data (only minimum widths known) and the import dialog.
- Edit dialogs: company, logo position, bank account, billing information, user name.
- The send and reminder-send screens; the look of the PDF, the e-mail and the linked invoice page.
- «Сводка по выбранным инвойсам», opened.
- A contact group's own page; the bulk-action bars.
- The lower half of `#/settings/e-invoicing`.
- What the Pro plan includes beyond unlimited invoices.
- The first pass's remaining items in the invoice editor and contact dialogs.

Sources:
- [What is Isolta's e-mail service and how does it work](https://help.isolta.com/en/articles/1117552-what-is-isolta-s-e-mail-service-and-how-does-it-work)
- [By what methods can I send my invoice](https://help.isolta.com/en/articles/1117542-by-what-methods-can-i-send-my-invoice)
- [How to create a quote, order confirmation or a dispatch note](https://help.isolta.com/en/articles/1092747-how-to-create-a-quote-order-confirmation-or-a-dispatch-note)
- [How to create credit note and can I create a partial credit note](https://help.isolta.com/en/articles/2781789-how-to-create-credit-note-and-can-i-create-a-partial-credit-note)
- [How to send an e-invoice](https://help.isolta.com/en/articles/3728391-how-to-send-an-e-invoice)
- [Can I cancel the invoice I just sent](https://help.isolta.com/en/articles/1101019-can-i-cancel-the-invoice-i-just-sent)
