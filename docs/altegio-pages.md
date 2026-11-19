# Altegio's admin, page by page

*Scanned 19.11.2026 in Renat's account, **looking only**: nothing was saved,
moved, cancelled, created, exported or sent. Measured at a 1920 × 911
window. No client's name, phone or visit is written here. The summary of
the look is `docs/reference-looks.md`; this file is the detail, so that
our pages can repeat Altegio's functions and layout (Dim, 19.11.2026:
«use their UI/UX exactly as is»), in our own code, icons and words.*

**Partial.** The browser dropped part-way through. The last section lists
what is not opened yet: «Клиентская база» and its settings, «График
работы», «Сотрудники», «Должности», «Услуги», the journal's week mode and
an existing visit's window; and everything outside the daily work
(finance, reports, goods, online booking, salaries, notifications,
settings), which is a second scan.

**Two corrections to `docs/reference-looks.md`:**

- A visit's strip shows who made it; its **body shows its state**. Orange
  is «came / paid», red «did not come». It is not a label's colour.
- The title of an old-style page («Записи») is 24 px / 400; 20 px / 500 is
  the new style.

## Sidebar

### Sidebar, till mode (journal tab)
- **Size:** 220 px wide. Ground `#22222e` (read from the ring's inner disc, matches the doc).
- **Head row, 47 px:** salon mark and «Rempire» (14/20, 500, `#dfe4ed`), 184 px wide, a dropdown. A bell button 24 × 47 with a red dot. A 1 px separator under it.
- **Salon dropdown (read from the DOM, not opened):**
  - «Локации»: «Добавить» → `/wizard/first`; «Rempire до 04.12.2026» → `/location/337850/`; «Добавить локацию».
  - Network: «Добавить» → `/group_settings/new`; «Chain Rempire» → `/group/318560`; settings link → `/group_settings/318560`.
- **Mini month:** block at y 60, 220 × 230.
  - Title «Ноябрь 2026» 14/20, 500, with ‹ ›. Weekday heads пн…вс 13/20, 500, `#828995`.
  - Day link 28 × 28, radius 8. Number 11/20, 600, white.
  - Ring 25 × 25: `conic-gradient(colour P%, #71757f 0)`, with a 22 × 22 disc of the sidebar colour inset 1.5 px, so the ring is 1.5 px thick.
  - **The ring is the day's load in percent** (`--t-progress`), filled clockwise, the rest grey `#71757f`.

    | Colour | Value | Seen at |
    |---|---|---|
    | Green | `#69ce14` | 16–48 % |
    | Yellow | `#f2c30c` | 53–74 % |
    | Red | `#d1050b` | 76–100 % |

    The thresholds (about 50 and 75) are inferred from these values.
  - Day off (`not_work`, Sundays here): no ring, number `#9aa3b1`.
  - Today or the chosen day: the inner disc turns `#f7f9fc`, number `#2b3134`, ring stays.
  - Other-month days are dimmed but keep their rings.
  - Clicking a day opens it in the journal (checked).
- **Four tiles:** block at y 319, 220 × 224, 2 × 2: «Продажа товара», «Новый платеж», «Список услуг», «Каталог товаров». Not pressed, so what each opens is not verified.
- **«Избранное»:** a collapsible row 204 × 36 with a star and chevron. Collapsed on the journal, open on «Записи».
  - Услуги → `/settings/sidebar/service_categories/337850/`
  - Сотрудники → `/settings/sidebar/staff/337850/`
  - График работы → `/work_schedule/337850/`
  - Записи → `/dashboard_records/337850/`
  - Финансовые операции → `/finances/transactions/list/337850/`
  - The open page's item is a lighter pill with a yellow star on the right.
- **Footer, 123 px:**
  - User row 49 px: name 12/16, 500, white; e-mail 11/14, 500, `#71757f`; an exit icon 24 × 24 on the right.
  - Yellow bar 220 × 44, `#ffcb00`, text `#2b3134` 14/20, gear icon: «Администрирование».
  - Icon row 30 px: App Store, Google Play, AppGallery (16 × 16 each), «?», «Связаться с нами».
- **«Администрирование»** opens `/analytics/337850/` («Основные показатели») in a new browser tab. The journal tab stays in till mode. The mode is per tab: `sessionStorage['erp-nav-menu-mode-switch:enabled']`, `1` till, `0` admin.

### Sidebar, admin mode
- Ground `#08080c`. No mini month, no tiles, no «Избранное».
- The yellow bar reads «Цифровой журнал» with a calendar icon.
- The menu is an accordion:
  - Group or item row: 196 × 40, radius 8, padding 8, 14/24, 500, white, icon 24 × 24, chevron on groups.
  - Open group: a card `#22222e`, radius 10, padding 4. Its head is yellow `#ffd940` with text `#08080c`.
  - Sub-rows 40 px, 14/20, 500, `#c6cbd3`; the current one white, 600.

## Журнал

### `/timetable/337850`: «Цифровой журнал», day mode
- **For:** the day's visits per barber.
- **URL:** the hash holds `mode=1&main_date=YYYY-MM-DD`. Editing the hash by hand does not change the day.
- **In use:** yes. 18 visits on 19.11; 3 columns on 19.11 and 4 on 14.11, apparently only those working that day.
- **Regions:**
  - Controls bar 1699 × 48, white.
  - Staff heads 1699 × 95 (y 48–143).
  - Grid from y 161. Time axis 60 px on each side.
  - Columns share the rest: 526 px each with three barbers. Cards are inset 6 px (514 wide).
  - 30 px per half hour at zoom «15 минут», so 1 px is 1 minute. Day shown 10:00–19:30.
  - The grid lines are a canvas; the cards are DOM on top.
- **Controls, left to right (all 32 px high):**

  | Control | x, width | Opens |
  |---|---|---|
  | Grid icon | 233, 32 | not pressed |
  | «Сегодня» | 289, 66 | today |
  | ‹ › | 363 and 393, 32 each | previous / next day |
  | Date title, 20 px | 449 | nothing |
  | «Продать ▾» | 1413, 87 | «Товар», «Абонемент», «Сертификат» |
  | «€NN ▾» | 1508, 59 | the day's totals (below) |
  | «День ▾» | 1591, 66 | «Ресурсы»: «Все ресурсы»; «Должности»: «Все должности» |
  | «Неделя ▾» | 1655, 81 | «Ресурсы» (empty); «Сотрудники» → «Без должности»: Jevgeni Hair, Slava Krasytel, Renat Gayanov, Valentin Nachinov, Milena Orehhova |
  | Funnel | 1736, 30 | status filter (below) |
  | Magnifier | 1790, 32 | a 3-stop slider «5 минут / 10 минут / 15 минут», set to 15 |
  | Person-plus | 1830, 32 | «Добавить сотрудника в расписание» |
  | Grid icon | 1870, 32 | the right panel |

  - Status filter, each with a tick: «Ожидание» (orange clock), «Клиент пришел» (green +), «Клиент не пришел» (red −), «Клиент подтвердил» (violet ✓). Not toggled.
  - The date title read «19 ноября, четверг» on one load and «19 november, thursday» on another.
- **Day totals («€NN»):** head with the date and «N клиентов», then seven rows, each with an (i): «Поступлений в кассы», «Оплата наличными», «Оплата безналом», «Выполнено на сумму», «Записей на сумму», «Лояльность на сумму», «Товаров на сумму». There is no other totals strip.
- **Staff head:** avatar 24 × 24, name 12/16, 500, `#2b3134`, role under. A click opens a popover (210 × 258, radius 12):
  - «Изменить рабочее время»
  - «Отменить рабочий день»
  - «Добавить рабочие дни»
  - «Убрать рабочие дни»
  - «Настроить график работы»
  - «Изменить время для онлайн-записи»
  - None pressed. Esc does not close it; a click elsewhere does.
- **Visit card:** radius 4, height equals minutes.
  - Strip 15 px: «HH:MM—HH:MM» white 9/11 on the left, a status icon 14 × 15 on the right.
  - Body: name 10/11, 700; phone 10/11, 700; services 9/11, 700, `#273a49`.
  - Bottom 7 px is a resize handle (not touched).
- **Colours.** The strip shows who made the visit; the body shows its state:

  | Kind | Strip | Body | Name | Icon |
  |---|---|---|---|---|
  | Online, waiting | `#907b9f` | `rgba(195,165,214,.8)` | `#765c88` | clock |
  | Staff, waiting | `#1ab394` | `rgba(134,223,205,.8)` | `#4b7b72` | clock |
  | Paid / came (class `--paid`) | by source | `rgba(255,153,88,.8)` | `#854e0e` | plus-circle |
  | Not came (`--not-came`) | by source | `rgba(255,107,107,.8)` | not read | minus-circle |

  - So the orange is «paid / came», not a label colour as the doc says.
  - «Клиент подтвердил» was not seen on a card across seven days.
  - The visit running now: glow `rgba(226,131,14,.9) 0 0 7px 1px`.
  - Two staff-made blocks had no client name.
- **Hover on an empty slot:** a green bar one slot high, «12:00 Новый сеанс» in white.
- **Right-click on an empty slot:** nothing. On a visit: not tried.
- **Day off:** an illustration, «Расписание не установлено» (20 px, 500), then «Настроить график работы» (yellow) and «Добавить сотрудников в день» (white).

### Visit hover card (hover the status icon)
- 376 px wide, white, radius 12, padding 20 0, shadow `rgba(0,0,0,.1) 0 4px 20px`, text 12/16.
- Top to bottom:
  - Name, phone with a copy icon, e-mail.
  - «Визитов: N», «Не пришёл: N», «Потратил: €N».
  - Status chips «Ожидание», «Клиент пришел», «Не пришёл», «Подтвердил». They write on press; not pressed.
  - «Услуги» and the names.
  - «Итог» and «К оплате».
  - Quick pay «Дебетовые карты», «Кредитные карты», «Наличные», with a dark hint «Мгновенная оплата — Оплата всей суммы в один клик».
  - «Детали»: the time and tags «Визит оплачен полностью», «Чек не распечатан», «Оплата наличными».

### «Новая запись» (click an empty slot)
- **Shape:** a drawer from the right. The journal shrinks to 680 px with a round «›» on the seam.
  - Content 1200 px on `#f7f9fc`, 16 px padding.
  - Three columns, 8 px radius: left 228 (grey), centre 584 (white), right 340 (white).
  - Footer 64 px, white: «Новая запись» left, «Сохранить пустую запись» (yellow, 170 × 32) right.
- **Left column:**
  - «Специалист» (select)
  - «Дата» (date field)
  - «Время и Длительность записи» (two time fields with ×, then a length select, «1 ч.»)
  - «Технический перерыв» → «+ Добавить перерыв»
  - «Закрепленные поля» → «Комментарий к записи» (textarea)
  - Tiles «Расширенные поля», «Повторение записи», «Уведомления о визите»
- **Centre:**
  - Status chips with icons: «Ожидание» (chosen), «Клиент пришел», «Не пришёл», «Подтвердил».
  - Banner «Платёжная политика»: «Платёжная политика ещё не настроена. Защитите запись депозитом или гарантией картой.» with «Настроить».
  - Tabs «Услуги» / «Товары», «Поиск по услугам».
  - Service cards (name, price, length): «Стрижка ножницами и машинкой» €40, 1 ч.; «Мужская стрижка + Моделирование бороды» €60, 1 ч. 30 мин.; «Мужская стрижка машинкой» €35, 45 мин.
  - «Все услуги» → «Услуга ▾».
- **Right:** «Имя клиента» (placeholder «Иван»), «Телефон» (code select «+372», number), «Email», checkbox «Записывает другого посетителя».
- **«Расширенные поля»** slides in from the left: title, «Скрыть», then «Комментарий к записи» (textarea), «Категории записи» (select, «Не выбраны»), «Цвет записи» (select, «По умолчанию»), each with a pin; «Сохранить» (yellow).
  - The category options, from the «Записи» filter: «Full online payment», «Partial online payment», «The employee is important», «The employee is not important» (defaults).
- **Onboarding (not dismissed):** a dark hint «Комментарий, ресурсы, категория и цвет записи — Эти настройки переехали в расширенные поля» («Не сейчас», «Далее»), and a box «Познакомьтесь с новым окном за 1 минуту» → «Пройти обучение».
- Esc closes the whole drawer without asking.

### Existing visit window (opened by the pencil in «Записи»; closed with Esc, nothing saved)
- **Shape:** the same drawer as «Новая запись»: three columns on `#f7f9fc`, a white footer.
  The page behind is dimmed; a round «›» on the seam closes it.
- **Left column (grey, 228 px):**
  - The barber: avatar, name, role; a small bin icon at the right (delete the visit).
  - The day («19 ноября») and under it the time and length («18:15–18:45 · 30 мин»),
    then a wide button «✎ Изменить».
  - «Закрепленные поля» → «Комментарий к записи» (textarea).
  - Tiles, two in a row, icon over a two-line label: «Расширенные поля», «Повторение
    записи», «Уведомления о визите», «Списание расходников», «История изменений».
- **Centre (white, 584 px):**
  - Status chips with icons: «Ожидание» (the chosen one dark), «Клиент пришел», «Не
    пришёл», «Подтвердил».
  - The visit's services: one row each, the name left, the price and a chevron right.
  - The «Платёжная политика» banner with «Настроить».
  - «К оплате € NN» left, «Оплатить» (white, yellow line, a card icon) right.
  - Tabs «Услуги» / «Товары», «Поиск по услугам», then service cards three in a row:
    name, a violet tag «Последний визит» on the one he had last, price, length.
  - «Все услуги» → «Услуга ▾».
- **Right column (white, 340 px):**
  - The client: a round tile with initials, name, phone, «✎ Изменить» at the right.
  - «Написать:» with two round icons (WhatsApp, Telegram).
  - Three tiles in a row: «Профиль клиента», «История визитов», «Ещё».
  - A violet tag, for example «Не посещал 20 дней».
  - «Примечание о клиенте»; a checkbox «Записывает другого посетителя».
  - «Дополнительно» → «+ Добавить примечание о клиенте».
  - «Статистика», two columns: «Последний визит», «Всего визитов», «Баланс»,
    «Продано», «Оплачено».
  - «Данные записи»: «Дата создания» and further rows below the fold (not read).
- **Footer:** «Сохранить изменения» (yellow), right.
- The same service showed 45 мин. for one barber and 1 ч. for another, so the length
  is per barber.
- Not read: what «Изменить», the five tiles, «Профиль клиента», «История визитов» and
  «Ещё» open; the rows under «Данные записи».

### «Добавить сотрудника в расписание» (dialog)
- 400 × 320, radius 12, × top right.
- «Сотрудники» (select, «Выберите сотрудника»); «Рабочее время» (two time fields with ×, 10:00 — 22:00); «+ Добавить перерыв».
- «Отмена», «Сохранить» (yellow). Closed with ×.

### Right panel
- 321 px, `#f7f9fc`, 1 px left line `#e0e3eb`. Two tabs 48 px high, the open one white.
- **«Клиенты»:** «Поиск по имени или телефону»; empty state «Быстро найдите клиента, чтобы увидеть историю посещений и примечания о нем.»
- **«Чат»:** not connected. A promo «Чат в ALTEGIO» with «Подключить чат» (not pressed).

## Отчеты

### `/dashboard_records/337850/`: «Записи»
- **Menu:** Отчеты → Записи. Breadcrumb «Отчеты».
- **For:** a filterable list of all visits.
- **In use:** yes, hundreds of rows for the default month.
- **Look:** the old style (square selects, orange button).
- **Head:**
  - Burger, title, a chevron that opens the list of all reports, (i), a yellow star.
  - «Удалить выбранные» (yellow outline).
  - «Операции с Excel ▾»: «Загрузить из Excel», «Выгрузить в Excel». Neither pressed.
- **Filters:**
  - «Дата создания» с / до (default: the last 12 months).
  - «Дата визита» с / до (default: the last month).
  - «Все сотрудники» (the five barbers).
  - «Сотрудник с доступом не выбран» (who created: «Клиент» or a login).
  - «Отменённые и не отменённые записи» / «Отменённые» / «Не отменённые».
  - «Все статусы визитов» / «Клиент не пришел» / «Ожидание» / «Клиент пришел» / «Клиент подтвердил».
  - «Введите имя или телефон клиента».
  - «Выберите категории услуг».
  - «Все категории записей».
  - «Все источники записей» / «Офлайн» / «Онлайн».
  - «Все статусы оплаты» / «Оплачено полностью» / «Не оплачено полностью».
  - «Записи с услугами и без услуг» / «Записи без услуг» / «Записи с услугами».
  - Page size 25 / 50 / 100 «результатов на странице»; «Показать».
- **Table.** «Найдено N» above it. Columns with widths:

  | Column | px | Holds |
  |---|---|---|
  | checkbox | 29 | |
  | avatar | 61 | |
  | Сотрудник | 157 | name bold, role under |
  | Услуга | 408 | services, joined by «;» |
  | Клиент | 235 | name, phone, e-mail |
  | Время визита | 142 | «Чт, 19.11, 18:15» |
  | Создал | 131 | who, with the date under |
  | Статус визита | 145 | |
  | Источник | 275 | the widget or the app, «через Мобильный» under |
  | action | 64 | |

- **Row action:** a pencil that opens the visit window. Deleted rows are pink `#f2dede` with red text and an «i» button instead.
- **Paging:** bottom right, «Назад 1 2 3 4 ... Вперед». No sort seen.
- **Hidden in the DOM (not opened):**
  - A client form: name, phone, second phone, e-mail, discount, card, spent, paid, balance; sex «Неизвестно / Мужской / Женский»; class «Без класса важности / Бронза / Серебро / Золото»; categories «VIP / Loyal / Permanent»; birthday.
  - An Excel import form and a send-by-e-mail form.

## Components

**Old-style page («Записи»)**

| Part | Measure |
|---|---|
| Title | 24/32, 400, `#2b3134` (the doc says 20 px, 500) |
| Head buttons | 36 px, radius 8, 12/16, 500, 2 px border (`#ffcb00` or `#e0e3eb`), padding 8 12 |
| Select, input | 34 px, 14/20, `#676a6c`, 1 px `#e5e6e7`, radius 1, padding 6 8 |
| «Показать» | 392 × 30, `#f8ac59`, white 12/18, radius 3 |
| Table head | 36 px, 13 px, 700, `#676a6c`, white, bottom line `#e7eaec`, padding 8 |
| Table row | 73 px, 13 px, 400, striped `#f9f9f9` / white, line `#e7eaec` |
| Paging | 29 px, 13 px, `#777`, 1 px `#ddd`, radius 4 at the ends |

**New-style parts (journal)**

| Part | Measure |
|---|---|
| Dropdown menu | white, radius 8, shadow `rgba(0,29,102,.16) 0 6px 24px` |
| Popover | white, radius 12 |
| Dialog | 400 px, radius 12, shadow `rgba(6,19,51,.24) 0 12px 48px`, dark scrim `#2b3134` |
| Dialog title | 20/24, 500 |
| Field label | 12/16, `#71757f` |
| Field | 32 px, radius 8, 1 px `#e0e3eb` |
| Button | 32 px, radius 8, 12/16, 500; white with `#e0e3eb`, or `#ffcb00` without a border |
| Chip | 32 px, radius 8, `#eaeef4`, 12/16, padding 8; chosen one dark with white text |
| Tag | 11/14, 500: green `#219c2b`, red `#f72c32`, violet `#583cf1`, on pale tints |
| Hint | dark `#2b3134`, white text, radius 12 |

Not measured: tabs with the yellow line, new-style table rows, empty states beyond the two above.

## Full menu
Read from the sidebar's DOM; company id 337850.
- **Журнал** `/timetable/337850`
- **Отчеты** `/dashboard/337850`
  - Основные показатели `/analytics/337850`
  - Записи `/dashboard_records/337850`
  - События `/dashboard/activities/337850/`
  - Все отчеты `/dashboard/all_reports/337850/`
- **Сотрудники**
  - Список сотрудников `/settings/sidebar/staff/337850/`
  - График работы `/work_schedule/337850/`
  - Должности `/positions/list/337850/`
- **Клиенты**
  - Клиентская база `/clients/337850/base/`
  - Категории клиентов `/labels/client/337850/`
  - Программа лояльности `/clients_settings/discounts/337850/`
- **Онлайн-запись** `/online/booking_forms/337850`
  - Ссылки на онлайн-запись `/online/links/337850/`
  - Настройки `/online/online_settings/337850/`
  - Персональный домен `/online/personal_domain/337850/`
- **Услуги** `/settings/sidebar/service_categories/337850/`
- **Товары** `/storages/storages/list/337850`
  - Склады `/storages/storages/list/337850`
  - Все товары `/goods/list/337850/`
  - Технологические карты `/technological_cards/337850`
  - Складские операции `/storages/transactions/list/337850`
  - Инвентаризация `/inventory/list/337850`
  - Печать товарных ценников `/price_tags/337850/`
  - Отчеты `/analytics/reports/337850/reports_storage/`
  - Настройки `/settings/menu/337850/setting_storage/`
- **Цифровые платежи**
  - Касса `/finances/acquiring/337850/payment_methods/`
  - Платёжная политика `/settings/payment_policy/337850/`
  - Методы оплаты и комиссии `/finances/payment_methods_settings/337850/`
- **Финансы** `/finances/transactions/list/337850`
  - Счета и кассы `/finances/accounts/list/337850`
  - Контрагенты `/finances/suppliers/list/337850`
  - Статьи платежей `/finances/expenses/list/337850`
  - Финансовые операции `/finances/transactions/list/337850`
  - Документы `/documents/337850`
  - Отчеты `/analytics/reports/337850/reports_finances/`
  - Настройки `/settings/menu/337850/setting_finances/`
- **Расчет зарплат** `/salary/calculations/337850/`
  - Основные настройки `/salary_general_settings/337850/`
  - Взаиморасчеты `/salary/calculations/337850/`
  - Расчет за день `/salary_daily/337850/`
  - Расчет за период `/salary_period/337850/`
  - Правила расчета `/salary_params/list/337850/`
  - Критерии расчета `/salary_criteria/list/337850/`
  - Схемы расчета `/salary_scheme/list/337850/`
  - Премии и штрафы `/salary_extension_reasons/337850/`
- **Уведомления** `/notifications/337850`
- **Лояльность** `/loyalty/info/337850`
- **Ресурсы** `/resources/337850`
- **Интеграции** `/appstore/337850/applications/overview/`
- (separator)
- **Настройки** `/settings/menu/337850/`
- **Биллинг** `/balance/337850/`
  - Лицензия (4 декабря 2026) `/balance/337850/`
  - Счета `/balance/invoices/337850/`
- **Личный кабинет** `/cabinet/info/`
- **Выход**

## Not opened or not verified

**Sidebar**
- What each of the four tiles opens.
- The bell, the salon dropdown (read from the DOM only), the help and contact icons.

**Journal**
- Week mode.
- In an existing visit's window: what «Изменить», the tiles, «Профиль клиента», «История визитов» and «Ещё» open.
- The tiles «Повторение записи», «Уведомления о визите», «Списание расходников», «История изменений».
- The «Товары» tab, the «Услуга ▾» picker, and the «Специалист» and length option lists in the new visit drawer.
- The options of «Цвет записи».
- Right-click on a visit.
- A «Клиент подтвердил» card.
- The burger button of the top bar.
- A break's exact measures.

**«Записи»**
- The date pickers, the Excel import dialog, the (i) panel on deleted rows.

**Pages never opened**
- `/clients/337850/base/` «Клиентская база»: the filter builder, the column chooser, «Операции с Excel», «Действия», a client's card.
- `/labels/client/337850/`
- `/clients_settings/clients_classes/337850`
- `/clients_settings/auto_labels/337850`
- `/clients_settings/settings/337850`
- `/clients_settings/discounts/337850/`
- `/loyalty/info/337850`
- `/work_schedule/337850/` «График работы»: the month grid, the cell editor, templates, «Выгрузить в PDF».
- `/settings/sidebar/staff/337850/` «Сотрудники»: the list and one staff member's tabs.
- `/positions/list/337850/` «Должности».
- `/settings/sidebar/service_categories/337850/` «Услуги»: categories, a service row, one service's tabs.
