# Isolta, page by page

*Scanned 19.11.2026 in Renat's account, **looking only**: nothing was
saved, sent, created, copied or deleted. Measured at a 1920 px window. No
receiver's name, address, code, account or sum is written here. The
summary of the look is `docs/reference-looks.md`; this file is the detail,
so that «Счета» can repeat Isolta's functions and layout (Dim,
19.11.2026), in our own code, icons and words.*

**Partial.** The browser dropped part-way through. Done: the frame, the
dashboard, invoices (list, a sent one, a draft, their dialogs) and
contacts. Not opened yet: «Товары/услуги», «Отчеты», «Add-ons»,
«Настройки»; the last section has the full list.

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
