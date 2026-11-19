# Altegio's admin, page by page

*Scanned 19.11.2026 in Renat's account, **looking only**: nothing was saved,
moved, cancelled, created, exported or sent. Measured at a 1920 × 911
window. No client's name, phone or visit is written here. The summary of
the look is `docs/reference-looks.md`; this file is the detail, so that
our pages can repeat Altegio's functions and layout (Dim, 19.11.2026:
«use their UI/UX exactly as is»), in our own code, icons and words.*

**Three parts.** Part 1 is the daily work: the sidebar, the journal, the
visit window, «Записи». Part 2: reports, finance, goods, online booking,
settings, and **what this salon uses** of it all. Part 3: «Клиентская
база» and a client's card, categories and loyalty, «График работы»,
«Сотрудники» and one barber's card, «Услуги» and one service,
«Уведомления». Each part ends with what is not opened or not verified.
Not opened at all: salaries, integrations, licence and billing.

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

---

# Part 2: reports, finance, goods, online booking, settings

## Menu behind «Администрирование» (full tree)

- **Журнал** `/timetable/337850`
- **Отчеты:** Основные показатели · Записи · События · Все отчеты
- **Сотрудники:** Список сотрудников · График работы · Должности
- **Клиенты:** Клиентская база · Категории клиентов · Программа лояльности `/clients_settings/discounts/337850/`
- **Онлайн-запись:** Ссылки на онлайн-запись · Настройки · Персональный домен
- **Услуги**
- **Товары:** Склады · Все товары · Технологические карты · Складские операции · Инвентаризация · Печать товарных ценников · Отчеты · Настройки
- **Цифровые платежи:** Касса · Платёжная политика · Методы оплаты и комиссии
- **Финансы:** Счета и кассы · Контрагенты · Статьи платежей · Финансовые операции · Документы · Отчеты · Настройки
- **Расчет зарплат:** Основные настройки · Взаиморасчеты · Расчет за день · Расчет за период · Правила расчета · Критерии расчета · Схемы расчета · Премии и штрафы
- **Уведомления** `/notifications/337850` · **Лояльность** `/loyalty/info/337850` · **Ресурсы** `/resources/337850` · **Интеграции** `/appstore/337850/applications/overview/` · **Настройки** `/settings/menu/337850/`
- **Биллинг:** «Лицензия 4 декабря 2026» `/balance/337850/` · Счета `/balance/invoices/337850/` · Личный кабинет `/cabinet/info/`
- Top of the sidebar: location switcher («Rempire до 04.12.2026», «Добавить локацию», «Chain Rempire» `/group/318560`, a gear to `/group_settings/318560`).
- Bottom: the user, an exit icon, a yellow bar «Цифровой журнал», store icons, help and Telegram icons.

## Отчеты

### `/dashboard/337850` — «Визиты» (the «Отчеты» landing)
- For: today's visits and a live feed of booking activity.
- Left panel «Визиты»: a switch «предстоящие (N)» / «прошедшие»; the date as a heading; one row per visit (time, duration, client and phone, services, barber); «Подробнее» at the bottom.
- Right panel «Лента активности по записям»: filters «новые онлайн (N)», «Все», «Онлайн», «Офлайн». Each entry has a tag («НОВЫЙ ВИДЖЕТ»), the service, date, barber, duration, client, then a history («Изменение», «Создание» with the fields). Two icon buttons per entry (✓ and bin) were not pressed.
- In use: yes, filled automatically (167 upcoming visits).
- Layout: two panels, 530 px and the rest, starting at x=246, y=110.

### `/analytics/337850` — «Основные показатели»
- For: a KPI dashboard for a period.
- Controls: «Период» date range (default the last 30 days, caption «Выбрано 30 дней»); «Фильтры» popover with three selects («Должности», «Сотрудники», «Сотрудники с доступом», each «Все»), «Сбросить все», «Отмена», «Применить».
- **Продажи:** cards «Итого», «Услуги», «Товары» (value, change tag in %, count); a line chart with the legend «Всего продаж / Услуги / Товары»; cards «Средняя стоимость визита», «Средняя стоимость услуги», «Средняя стоимость товара»; a footnote that prepayments are not counted.
- **Посещаемость:** cards «Клиенты», «Визиты», «Записи», a chart, then «Новые клиенты», «Не новых клиентов», «Потерянные клиенты», each with «Посмотреть клиентов ↗».
- **Заполненность:** cards «Завершенные записи», «Незавершенные записи», «Отмененные записи» (each with «% от всех записей»); a bar chart per day with the legend «Всего занято рабочего времени / Неявки»; a card «Средняя заполненность» («За рабочий день»).
- In use: yes, but only partly meaningful. Of 763 records in 30 days, 81 are «завершенные» and 589 «незавершенные»: most visits are never closed out. Goods are zero.

### `/dashboard/activities/337850/` — «События»
- For: group events (classes).
- Filters: dates «с / по»; selects «Все категории услуг», «Все услуги», «Все категории событий», «Все события / Отменённые / Не отменённые», «Все сотрудники»; per page 25/50/100; «Показать».
- Head: «Удалить выбранные» (not pressed).
- In use: no («Результаты отсутствуют»).

### `/dashboard/all_reports/337850/` — «Все отчеты» (hub)
One column of link rows (icon, title, description, chevron) in six groups:

| Group | Report | Path |
|---|---|---|
| Посещаемость | Визиты | `/dashboard/337850/` |
| | Записи | `/dashboard_records/337850/` |
| | События | `/dashboard/activities/337850/` |
| | Возвращаемость клиентов | `/analytics_retention/337850/` |
| | Загруженность сотрудников | `/analytics_workload/337850/` |
| Финансы | Финансовый отчет | `/finances_reports/account_period/337850/` |
| | Прибыли и убытки (P&L) | `/finances_reports/annual_report/337850/` |
| | Отчет по кассе за день | `/finances_reports/day_report/337850/` |
| Продажи | По сотрудникам | `/analytics_masters/337850/` |
| | По сотрудникам в динамике | `/analytics/employee_dynamics/337850/` |
| | По услугам | `/analytics_services/337850/` |
| | По клиентам | `/analytics_clients/337850/` |
| Склад | Остатки на складах | `/storages_reports/storage_remnants/337850/` |
| | Заказ товаров | `/storages_reports/desired_amounts/337850/` |
| | Анализ продаж товаров | `/storages/sales_analysis/337850/` |
| | Анализ расхода материалов | `/storages_reports/analysis_debit_consumable/337850/` |
| | Анализ списания товаров | `/storages/analysis_goods_write_off/337850/` |
| | Анализ оборачиваемости | `/storages/turnover/index/337850/` |
| Маркетинг | Акции | `/analytics/loyalty_programs/337850/` |
| | Отзывы | `/dashboard_reviews/337850/` |
| | Сообщения | `/dashboard_message/337850/` |
| | Звонки | `/dashboard/calls/337850/` |
| Безопасность | Операции с данными | `/dashboard/export_report/337850/` |
| | Изменения данных | `/dashboard/changes_log/337850/` |

`/analytics/reports/337850/reports_finances/` (Финансы → Отчеты) is this same hub scrolled to «Финансы».

### Возвращаемость клиентов
- Filters: dates, «Все услуги», «Показать». Head: «Выгрузить в Excel».
- Table per barber (photo, name, role): «Клиентов за период» (Итого, Новые, Вернувшиеся with %), «Возвращаемость клиентов» (clients in the 60 days before, of them returned, %); a totals row.
- In use: data for one barber only; four rows are zero.

### Загруженность сотрудников
- Filters: dates, «Показать». Head: «Выгрузить в Excel».
- Columns: Сотрудник, Отработано дней, Рабочих часов, Отработано часов, Часов простоя, Заполненность (x/y and %), Будущие записи; a ↓ button per row and on «Итого».
- In use: partly. «Отработано часов» is zero for four of the five barbers, because their visits are not marked as done.

### Финансовый отчет
- Filters: dates (default the last 8 days); «Статья платежа не выбрана» (the 13 items); «Контрагент не выбран»; five multi-pickers (cash account, service category, services, goods category, goods); «Любой тип кассы / Наличный расчет / Безналичный расчет»; «Детализировать по типу кассы / по кассе»; «Показать все статьи / только статьи с движением»; «Показать». Head: «Выгрузить в Excel».
- Table: «Статья» × days, each day split «Наличные | Безнал | Итого», plus «Итого»; scrolls sideways.
- Rows: **Выручка** (Оказание услуг, Пополнение счета, Продажа абонементов, Продажа сертификатов, Продажа товаров, Прочие доходы, Списание штрафа); **Расходы** (Закупка материалов, Закупка товаров, Зарплата персонала, Комиссия за эквайринг, Налоги и сборы, Прочие расходы); **Остаток на конец дня**.
- In use: only «Оказание услуг» has figures; no expenses are entered.

### P&L отчет
- Filters: months from/to; «Не детализировать зарплату / Детализировать зарплату по должностям / по сотрудникам»; «Показать». Head: «Выгрузить в Excel».
- Columns: Статья, 12 months, Итого. Rows as above, plus «Прочие» under salary and «Итого до уплаты налогов».
- In use: service revenue only.

### Отчет по кассе за день
- Filters: «Дата», «Все сотрудники», «Показать». Head: «Операции с Excel» ▾ (Выгрузить в Excel · Выгрузить в Excel за несколько дней · Выгрузить в XML).
- Nine tiles, 3 × 3: Всего записей (Средняя оплата), Всего записей с клиентами, Всего записей без клиентов, Клиентов, Оказанные услуги (Оплачено), Пополнений личных счетов (Пополнено на сумму), Товаров, Сертификатов, Абонементов.
- A table of cash accounts: name, «Остаток на начало дня», «Остаток на конец дня».
- A table of the day: Время, Клиент, Сотрудник, Услуга/Товар, Стоимость, Скидка, Итого, Оплачено, Личные счета, Лояльность, Способ.
- In use: yes (18 records today).

### Статистика по сотрудникам
- Filters: dates; five multi-pickers (Категории услуг, Услуги, Категории товаров, Товары, Должности); «Показать». Head: «Выгрузить в Excel».
- Columns: Сотрудник; Выручка; Оказано услуг (Сумма, Кол-во); Проданные товары (Сумма, Кол-во); Другие способы оплаты (Скидка, Баллы, Абонементы, Сертификаты, Счета клиентов); Будущие записи; Отработано часов; Стоимость часа работы; % от общей выручки; a ↓ per row.
- In use: revenue is recorded for one barber of five.

### Динамика по сотрудникам
- Filters: start month, «Все сотрудники», «Показать». Head: «Выгрузить в Excel».
- One block per barber: rows are services, columns are months (кол-во, Сумма) plus a pale-blue «Итого»; foot rows Итого, Записи, Ср. чек, Продажи товаров.
- In use: one barber has data.

### Статистика по услугам
- Filters: dates, «Все сотрудники», «Все категории», «Детализация по услугам», per page, «Показать». Head: «Выгрузить в Excel».
- Columns: Услуга, Количество оказанных услуг, Скидка по абонементу, Оплачено лояльностью (Скидка, Баллы, Абонементы, Сертификаты), Оплачено со счетов клиентов, Оплачено деньгами, Стоимость расходников, ЗП сотрудников, Прибыль, % от общей выручки.
- In use: yes (4 services); loyalty, supplies and salary columns are all zero.

### Клиенты (`/analytics_clients`)
- Filters: dates, per page 50/100/250, «Показать». Head: «Операции с Excel».
- Columns: Клиент, Телефон, Email, Выручка, % от общей выручки, Средний чек, Количество посещений; «Итого».
- In use: yes (a full page of 50).

### The six stock reports
All are empty («Результаты отсутствуют» / «По данным критериям данные не найдены»). Columns and filters:
- **Остатки на складах:** Артикул, Товар, Категория, Остаток, Остаток в ед. списания, Себестоимость, Наценка, Наценка %, Цена, Суммарная себестоимость, Суммарная стоимость. Filters: date, склад (Все / Expendables / Products), category, supplier, critical stock, search, zero stock.
- **Заказ товаров:** Артикул, Товар, Категория, Остаток, Критичный остаток, Желаемый остаток, Недостаток до желаемого.
- **Анализ продаж:** Артикул, Штрихкод, Товар, Количество, Себестоимость, Наценка, Наценка %, Суммарная стоимость. Filters: dates, category, staff, supplier, «Товары / Категория».
- **Анализ расхода материалов:** Артикул, Штрихкод, Категория/Товар, Фактическое количество и себестоимость, Расчетное количество и себестоимость, Расхождение по количеству и по себестоимости.
- **Анализ списания товаров:** Товар, Артикул, Штрихкод; Начальный остаток, Приход, Расход, Конечный остаток (each Кол-во, Сумма). Filters: «Список всех товаров / Дерево категорий», «Для продажи / Для списания», a tick for goods moves.
- **Анализ оборачиваемости:** filters only (dates, category, supplier, storage); no table without data.

### Акции
- An empty state: «Нет действующих акций», «Для создания акции перейдите в раздел управления акциями.», a yellow «Перейти к созданию акций».
- In use: no.

### Отзывы
- Filters: dates, «Все отзывы / О компании / each barber», «Любая оценка / 1–5», per page, «Показать». Head: «Выгрузить в Excel».
- A row: avatar, client, «о сотруднике …», five stars, contacts, date; «Удалить» per row (not pressed).
- In use: yes, reviews exist.

### Сообщения
- Filters: dates, type, status, phone search, aggregator, channel, per page, «Показать». Head: «Выгрузить в Excel».
- Columns: Дата, Контакты, Содержание, Тип сообщения, Статус (with time), Количество сообщений, Канал, Агрегатор.
- Channels: SMS, Push, Email, Whatsapp.
- Aggregators: Vonage, messaggio.com, WhatsApp Business (with Coexistence), Altegio Notification Sender.
- Statuses: Отправлено, Не доставлено, Отправлено на телефон, Передано оператору, Передано SMS-агрегатору, Недостаточно средств, Отклонено оператором, Отклонено ограничителем скорости отправки, Отправляется, Прочитано, Отклонено.
- Message types, as the filter lists them (this is Altegio's whole catalogue):
  - To the client about a visit: напоминание; детали онлайн-записи; детали офлайн-записи; удаление онлайн-записи; подтверждение записи; запрос подтверждения записи; изменение записи; запрос отзыва (онлайн / офлайн); напоминание о повторном визите; приглашение на визит недошедших клиентов; поздравление; запрос обратной связи.
  - To staff and admin: уведомление об онлайн-записи / офлайн-записи (администратору / сотруднику); удаление записи через интернет (администратору / сотруднику); перенос онлайн-записи (администратору / сотруднику); уведомление об окончании расписания; еженедельный отчёт.
  - Marketing and manual: Рассылка; сетевая рассылка; реферальная рассылка; сообщение из окна записи; сообщение из карточки клиента.
  - Loyalty: изменение / окончание / обнуление / увеличение / уменьшение скидки; выпуск электронной карты; создание карты лояльности; начисление, списание и отмена баллов; пополнение карты; изменение % cashback; окончание действия абонемента; списание с абонемента.
  - Account and payments: Код подтверждения; Изменение пароля; Сброс пароля; изменение email; создание учетной записи; приглашение сотрудников; приглашение подключить чаевые; достигнут минимальный баланс; окончание действия лицензии; успешная онлайн-оплата; Оплата визита; Ссылка на предоплату; Ссылка на привязку карты; платёжные документы на почту.
- In use: yes, heavily. The last 106 messages cover under three days: 35 SMS reminders (messaggio.com), 28 e-mail reminders, 33 e-mail «детали онлайн-записи», 2 push, 1 e-mail «удаление онлайн-записи», 1 e-mail «детали офлайн-записи». That is roughly 1 000 a month. The client gets the reminder both by SMS and by e-mail.

### Звонки
- One line: the call list appears once telephony is integrated, plus a link. In use: no.

### Операции с данными
- Filters: dates, user, report (Клиенты, Записи, Карты лояльности, Абонементы, Счета клиентов, Переводы, Яндекс.Бизнес — «Импорт» …), type (Загрузка файла, Копирование из Excel, Ссылка на Email, Скачивание в браузере), per page.
- In use: empty for the last month.

### Изменения данных
- Filters: dates; «Все сущности / Финансовая транзакция / Запись / Складская операция / Сеть»; author; «Создание / Изменение / Удаление / Восстановить»; per page.
- Columns: Дата, Сущность (a link to the record), Автор изменения, Действие, Детали (a «Показать» button).
- In use: yes (automatic log).
- The author filter lists five staff logins and one named **«Altegio.me MCP»**: an AI/MCP connection has an account in this salon.

## Финансы

### `/finances/transactions/list/337850` — «Финансовые операции»
- Head: «Операции с Excel» ▾ (Загрузить из Excel · Выгрузить в Excel) and a yellow «+ Новый платеж» (a button, not pressed). The page is starred as a favourite.
- Filters: dates; «Все виды платежей / Доходы / Расходы / Перевод средств»; контрагент; касса picker; статья платежа; сотрудник; «Не отмененные / Отмененные»; client search; document number search; goods picker; services picker; способ оплаты (Debit Cards, Credit Cards and Credit Cards (Рассрочка), each «Все бренды / Visa / Mastercard»; Cash); per page; «Показать».
- «Найдено N» pill; paging «Назад 1 2 3 4 Вперед».
- Columns: Дата, № док-та, Получатель/Плательщик, Назначение, Касса, Комментарий, Автор, Сумма, Остаток в кассе, Услуга/Товар, Визит (a link), Способ оплаты.
- In use: yes, 88 rows last month, all «Оказание услуг» created when a visit is paid; cash goes to one account and cards to the other. No manual expenses.

### `/finances/transactions/edit/337850/<id>` — one operation
- Title: the date and time.
- Form: «Дата и время» (date, hour select, minute select); «Статья платежа» (locked for a visit payment); «Касса» (select showing the balance); «Способ оплаты» (locked); «Клиент»; «Сумма» with the currency; «Комментарий» (textarea); «Сохранить» (yellow), «Отмена».
- Right panel «История изменений»: who, when, and the values.

### `/finances/accounts/list/337850` — «Счета и кассы»
- Head: yellow «+ Добавить кассу».
- One block per account: a drag handle, name and comment; the last five days with green day tags and sums; «Добавить платеж» (cyan); an area chart with the legend «Выручка / Расходы»; three totals («Сейчас в кассе», «Доходов за месяц», «Расходов за месяц»); a pie «Доходы/расходы»; «Перевести средства» (blue).
- In use: two accounts with Altegio's default English names, «Main cash register» («At the reception desk») and «Bank account» («For credit card payments»). Balances move only through visit payments.

### `/finances/suppliers/list/337850` — «Контрагенты»
- Search by name, «Показать»; head «Операции с Excel», «+ Добавить контрагента».
- In use: no («Пока не создан ни один контрагент»).

### `/finances/expenses/list/337850` — «Статьи платежей»
- Head: «+ Добавить статью». A list with an icon, the name and a hint, and «Тип статьи».
- In use: only the 13 system items:
  - Закупка материалов, Закупка товаров → Расходы на себестоимость
  - Зарплата персонала → Расходы на персонал
  - Налоги и сборы → Налоги и сборы
  - Комиссия за эквайринг → Коммерческие расходы
  - Прочие расходы → Прочие расходы
  - Оказание услуг, Продажа абонементов, Продажа товаров, Продажа сертификатов, Прочие доходы, Пополнение счета, Списание штрафа → Выручка

### `/documents/337850` — «Документы»
- Filters: dates, «Поиск по номеру», «Виды документов» (multi), «Виды содержимого» (multi), per page, «Показать». Head: «Выгрузить в Excel».
- Columns: ID, Дата (a link), Тип, Сумма, Количество (Оказанные услуги, Товаров, Расходники), Контрагент / Клиент, Комментарий, Автор.
- In use: automatic, 734 documents of type «Визит» in the last month.

### `/settings/menu/337850/setting_finances/` (Финансы → Настройки)
- This is the «Настройки» hub, scrolled.

## Цифровые платежи

### `/finances/acquiring/337850/payment_methods/` — «Онлайн-платежи» (menu item «Касса»)
- «Способы приема платежей»: three tiles.
  - «Оплата по ссылке» (tag New): «Подключить».
  - «Предоплата в виджете онлайн-записи» (New): «Подключить».
  - «Онлайн-продажа абонементов и сертификатов»: «Настроить».
- In use: no, nothing is connected.

### `/finances/payment_methods_settings/337850/` — «Методы оплаты и комиссии»
- One tab «Оплата на месте»; an intro block with «Подробнее ↗».
- **Наличные:** «Касса» select; «Выбор кассы» radios («Всегда дефолтная касса» / «Выбрать кассу во время оплаты визита» / «Оплата наличными невозможна»).
- **Дебетовые карты:** a toggle «Комиссии для различных карт», «Комиссия за транзакцию», default account.
- **Кредитные карты:** default account, «Время обработки платежа» (working days).
- **Рассрочка:** «Включить рассрочку».
- **Настраиваемый метод оплаты:** «Добавить метод оплаты».
- «Сохранить».
- In use: defaults. Cash goes to «Main cash register» (always the default account), cards to «Bank account»; the commission toggle is off.

### `/settings/payment_policy/337850/` — «Платёжная политика»
- An onboarding pop-up opens first («Превращаем запись в обязательство», «Далее», ×).
- Left sub-menu: Платёжная политика · Услуги · Сотрудники · Клиенты · Записи.
- «Платежная система»: an Adyen banner with «Подключить».
- «Тип платежной политики»: a notice «Личные кабинеты клиентов не активированы»; three choice cards («Без платежной политики», «Депозит», «Гарантия картой»); «Сохранить».
- In use: no. «Без платежной политики» is selected and Adyen is not connected.

## Товары (stock)

Nothing in this group is used.

- **`/storages/storages/list/337850` «Склады»:** columns Название, Кол-во товаров, «Переместить товары» per row. Two default storages, «Expendables» and «Products», 0 goods each.
- **`/goods/list/337850/` «Все товары»:** search (name, barcode, article); per page; «Показать». Left panels «Действия» («Быстрое управление», «Архивировать выбранные», «Архив товаров») and «Категории товаров» («Main products», a pencil, «+ Добавить категорию»). Head: «Операции с Excel», «+ Добавить товар». Empty: «Товары не найдены».
- **`/technological_cards/337850`:** search, per page; «+ Добавить технологическую карту». Empty.
- **`/storages/transactions/list/337850` «Складские операции»:** filters: dates; type (Приход товара, Продажа товара, Списание расходников, Списание товара, Перемещение товара); supplier; storage; goods; service; client; document number; «Оплаченные / Неоплаченные». Head: «Операции с товарами» ▾. Empty.
- **`/inventory/list/337850`:** «Создать инвентаризацию». Empty.
- **`/price_tags/337850/` «Печать товарных ценников»:**
  - Text sizes with − / + steppers: Заголовок, Наименование товара, Цена продажи.
  - «Показать» ticks: Артикул, Штрихкод, Подпись.
  - Page orientation: Вертикально / Горизонтально.
  - Tag size: Высота and Ширина in mm.
  - Дата, Отступ (mm), Заголовок, Экземпляров на товар.
  - Buttons: «Выбрать товары», «Распечатать».
  - Previews: «Образец» and «Расположение на странице».
- **`/storages/options/337850` «Настройки склада»:** «Алгоритм подсчета себестоимости» («Брать из последнего прихода товара») and a tick for the limit on selling or writing off with too little stock (off); «Сохранить».

## Онлайн-запись

### `/online/booking_forms/337850` and `/online/links/337850/` (the same page)
- «Ссылки на онлайн-запись», a yellow «Новая ссылка».
- One card: the title (a link), a subtitle, tags «Основная» (green) and «Общая» (grey), a chip with the form's address, icons for copy, preview and delete, and «Настроить».
- In use: one form, «Company form».

### `/online_booking/337850/forms/<id>` — the form's settings
- Head: the title with its tags; «Удалить ссылку» top right; «← Назад»; a sticky bar at the bottom with «Сохранить».
- A card with the name, subtitle, a tag «Индивидуальные услуги» and the link.
- **Индивидуальная запись**, three choice cards:
  - «Пошаговый» (the client books in the order you set);
  - «Короткий пошаговый» (services first, then barber and time);
  - «Меню» (any order).
- **Порядок шагов**, draggable: 1 Выбор специалиста, 2 Выбор услуги, 3 Выбор даты и времени.
- **Отображение категорий услуг:** «Горизонтально в виде тегов» / «Вертикально в виде сворачиваемого списка», with a phone preview.
- **Дизайн онлайн-записи:** theme «Светлая / Темная»; «Цвет кнопок и иконок» (hex and swatch); «Изображение на первом экране» (16:9, up to 12 MB).
- **Продажа абонементов и сертификатов:** a chain select.
- **Кнопка на сайте:** a tick «Показывать кнопку на сайте»; button position; widget side; colour; «Анимация кнопки»; «Код кнопки» (a script tag to copy).
- **Аналитика:** Facebook Pixel id.
- Set here: Пошаговый; specialist → service → date and time; categories as tags; light theme; near-black buttons (`#060F07`); no subscription sales; site button on, bottom right, widget from the right, blue `#1c84c6`, animated; no pixel.

## Настройки (hub `/settings/menu/337850/`)

Twenty links in eight groups:
- **Локация:** Бренд · Контакты · Галерея · Юридическая информация
- **Настройки модуля:** Товары (себестоимость и остатки) · Расчет зарплат · Онлайн-платежи · Методы оплаты и комиссии · Настройки нефискального чека
- **Категории:** Категории записи · Категории событий · Категории клиентов
- **Системные настройки:** Основные · Принадлежность к сети
- **Интеграции и доступы:** Ключи · Вебхуки · ИИ-ассистенты
- **Аналитика:** Настройки возвращаемости
- **Склад:** Настройки склада
- **Цифровой журнал:** Настройки цифрового журнала

There is no «роли и права» item here.

### The pages behind it
- **`/settings/brand/337850/` «Бренд»:** «Название локации при онлайн-записи»; «Описание» (rich text: B, I, U, S, three alignments, more); «Логотип» (a 120 px tile, pencil and bin, JPEG or PNG up to 12 MB); «Сохранить». Filled: name, an English description, the logo.
- **`/settings/contacts/337850/` «Контакты»:**
  - Адрес: Страна, Адрес, Индекс, a Google map with a pin.
  - Расписание: one text line.
  - Телефон и сайт: numbers with a bin and «+ Добавить номер»; Сайт.
  - Социальные сети: Facebook, Instagram.
  - Мессенджеры: WhatsApp, Telegram, Viber.
  - Filled: address, schedule, one phone, the site; socials and messengers empty.
- **`/settings/gallery/337850/` «Галерея»:** a drop zone, up to 8 photos; «Сохранить». One photo.
- **`/settings/company_details/337850/` «Реквизиты»:** Тип («Юридическое лицо»), Название юридического лица, Юридический адрес, Фактический адрес, ИНН, VAT ID; «Банковские реквизиты» (Название банка, Расчетный счет, БИК); «Сохранить». Only the type and the name are filled.
- **`/finances/settings/pdf_bill_options/337850/` «Настройки нефискального чека»:**
  - «Настройка печати»: Формат (A4), Язык чека («Авто (English)»).
  - Ticks «Информация о клиенте»: Имя, Телефон, Email.
  - Ticks «Реквизиты салона»: 9 fields.
  - «Позиции в чеке»: Выводить налог по каждой позиции.
  - «Дополнительная информация»: a rich text plus ticks Комментарий, Сотрудник, Дата и время оплаты.
  - One tick is on near the end; I did not confirm which. The rest is default.
- **`/labels/record/337850` «Список категорий»:** a left list (… / Категории записи / Категории событий); coloured labels; «+ Добавить категорию». Four default English labels (Full online payment, Partial online payment, The employee is important, The employee is not important).
- **`/labels/activity/337850`:** empty.
- **`/settings/system/337850` «Системные настройки»:** Название компании; Сфера бизнеса (locked: Барбершоп); Категория; Страна (locked); Город; «Формат даты и времени»; «Язык уведомлений»; «Сохранить». The notification language is **English**.
- **`/settings/salon/groups/337850` «Сети»:** a table (Название, Главная сеть, Компаний в сети). One chain, «Chain Rempire», one company.
- **`/settings/api_keys/337850/` «Ключи доступа»:** text only; keys are issued in the Developer Hub, with a link to the AI assistants. No keys shown.
- **`/settings/web_hook/337850/`:** «Отправлять хуки» select, the address field with «Добавить», 15 entity ticks (Локация, Сотрудники, График работы, Товары, Услуги, Категории услуг, Клиенты, Записи, cards, goods sales and stock events, Транзакции), «Сохранить». Off: «Не отправлять», no address, no ticks.
- **`/settings/ai_assistants/337850/`:** a block «Готовые ИИ-решения» («Открыть в Маркетплейсе»); «Подключение Altegio к ИИ-ассистенту через MCP» with three «Открыть» rows (Altegio Pro MCP, the read-only one, Integrations Hub MCP). The page does not show what is connected.
- **`/analytics/options/337850`:** «Считать потерянными клиентов, не посещавших более: [60] дней».
- **`/settings/salon/timetable/337850` «Цифровой журнал»:**
  - «Тип записи» cards: Смешанная / **Индивидуальная** / Групповая.
  - «Отображение журнала по умолчанию»: **Расписание сотрудников** / Расписание ресурсов; a tick for showing busy resources; «Должность по умолчанию» (Все должности).
  - «Первая строка в записи»: Название услуги / **Имя клиента** / Номер телефона.
  - «Интервал между визитами одного клиента» (a select, set to records more than 15 minutes apart being separate).
  - A tick to split a record whose services use different resources.
  - Several breaks in one record: «Использовать самый длинный перерыв» / «Суммировать перерывы».
  - «Технический перерыв после каждой записи»: **Без перерыва**.
  - «Работа с клиентами → ФИО клиента».
  - «Сохранить».

## Components (new against `docs/reference-looks.md`)

**Frame in the menu mode**
- Sidebar: 220 px, ground `#08080c` (not `#22222e`).
- Open group: a `#22222e` card, 204 px wide, 10 px corners, 4 px padding.
- Group row: 196 × 40, 8 px corners, 14 px / 500 white, icon, label, chevron.
- Open group's row: yellow `#ffd940`, text `#08080c`.
- Sub-items: 40 px rows, padding 10px 8px, 14 px / 500, `#c6cbd3`; the current one white.
- Page head band: white, about 90 px. Menu button 36 × 36, 8 px corners, 2 px `#e0e3eb` line. Breadcrumb 12 px, `#c6cbd3`. The star is yellow when the page is a favourite.
- Head buttons: 36 px high (not 32), 12 px / 500, padding 8px 12px, 8 px corners; white with a 2 px `#e0e3eb` line, or yellow `#ffcb00` with a 2 px yellow line.
- Content: starts at x=236, 1 669 px wide, padding 20px 10px 40px.

**Older pages (reports, finance lists, stock)**
- Filter band: full-width rows in 2 to 4 columns. Fields 34 px high, 14 px, padding 6px 8px. Two skins: reports 1 px `#e5e6e7`, square, text `#676a6c`; finance 2 px `#e0e3eb`, 6 px corners, text `#2b3134`. Date fields carry a small «с» / «по» box in front.
- «Показать», bottom right of the band, 392 × 30, 12 px, in three skins: orange `#f8ac59` with white text and 3 px corners (reports); white with a 1 px `#ffcb00` line and 6 px corners (finance operations); yellow fill (goods).
- Per-page select with the caption «… на странице», bottom left.
- «Найдено N»: a 150 × 32 tab hanging under the band, 14 px `#71757f`, bottom corners 12 px.
- Report table: head 13 px / 700 `#676a6c`, 36 px, padding 8 px, line `#e7eaec`; rows 54 px with a 32 px round photo; odd rows `#f9f9f9`; bold totals row; the totals column pale blue `#d9edf7`.
- Finance table: a white box, 8 px corners, 1 px `#e0e3eb`; head 13 px / 500 `#71757f`; rows 53 px, text 13 px `#2b3134`, line `#e0e3eb`; links underlined.
- Paging: «Назад 1 2 … Вперед»; items 29 px, padding 4px 10px, 13 px, 1 px `#e0e3eb`; current `#e0e3eb`; disabled text `#c6cbd3`; ends 4 px corners.
- Panel: title bar 60 px (16 px / 400 `#2b3134`), body padding 15 px, 12 px corners, 1 px `#e0e3eb`. Switch buttons in the title: 28 px, 12 px, 6 px outer corners; the active one pressed in (inset shadow).
- Day-report tile: title 14 px / 600, number 30 px / 100, small 11 px, a teal figure `#23c6c8` on the right.
- Coloured buttons: blue `#1c84c6` and cyan `#58cde5`, 30 px, 3 px corners, white 12 px; green day tag `#1ab394`, 10 px / 600.
- Edit form: a white box 949 px (12 px corners, padding 15) and a history box 670 px beside it; labels in a 158 px column, 13 px; fields 34 px, 2 px `#e0e3eb`, 6 px corners; locked fields `#eee`; yellow save on the left, white «Отмена» on the right.

**Newer pages (analytics, hubs, settings, online booking)**
- Hub row: 440 × 94, white, 8 px corners, padding 12px 16px; icon; title 14 px `#2b3134`; description 12 px `#71757f`; chevron. Group title 16 px / 500. One column on the left.
- Section card: 800 px, white, 12 px corners, 1 px `#e0e3eb`, padding 20; title 20 px / 500.
- KPI card: 242 × 99, 12 px corners, 1 px `#e0e3eb`, padding 12px 16px; label 12 px, value 24 px / 500, sub-line 12 px, an (i) top right; three in a row.
- Tags: 24 px high, 4 px corners, padding 4px 6px, 12 px. Neutral `#eaeef4` with dark text; negative `#feefef` with `#f72c32`; positive `#e9f7e9` with `#219c2b`. Small tag «New»: 11 px / 500 on a yellow tint.
- Charts: 2 px smooth lines, `#6644e0`, `#df7800`, `#72bef4`; bars `#ffcb00` at 85 % and `#72bef4`; grid `#e0e0e0`; axis text 12 px `#9aa3b1`; legend under the chart with dots.
- Filter button: 89 × 32, 12 px / 500, white with a line. Popover: a white card with a shadow; selects in a row; «Сбросить все» left, «Отмена» and a yellow «Применить» right.
- Tabs: 14 px / 500, a yellow line under the open one.
- Settings form: «← Назад» on top; one 379 px column at x=245; label 14 px above; field 32 px, 8 px corners, thin grey line, padding 6px 12px; helper 12 px; yellow «Сохранить» 88 × 32, 12 px / 500, no line. Long forms keep the save button in a white bar at the bottom.
- Tile: 533 × 230, 12 px corners, 1 px `#e0e3eb`, padding 20; a 40 px round tinted icon; a yellow button bottom left.
- Booking-form card: 439 × 162, 12 px corners, padding 16; title 14 px / 500; icon buttons 32 × 32; «Настроить» 80 × 32.
- Choice cards: three in a row; the chosen one has a yellow frame and a filled dot.
- Empty states:
  - New: title 20 px / 600; sub-line 16 px / 500 `#999ea7`; yellow button 239 × 48, 16 px / 500.
  - Goods: a 40 px grey round icon; title 20 px / 600; text 14 px `#676a6c`; a white outlined button; a second box «Результаты отсутствуют» under it.

## In use at this salon

**Used**
- The visits dashboard and activity feed (automatic).
- One online booking form: step by step, specialist → service → time, light theme, site button on.
- Client messages, about 1 000 a month: SMS and e-mail reminders, e-mail booking details, a few push. SMS goes through messaggio.com. The notification language is English.
- Visit payments into two default cash accounts (cash and card): 88 operations last month. They come from **one barber of five**; the other four have no revenue and no worked hours in the reports.
- Visit documents (automatic, 734 last month) and the change log.
- Reviews.
- The salon profile: name, description, logo, address, schedule line, phone, site, one photo.
- Journal settings: individual booking, staff view, client's name on the first line, no technical break.
- Reports that hold data: Основные показатели, Возвращаемость, Загруженность, По сотрудникам, динамика, По услугам, По клиентам, Финансовый отчет, P&L, Отчет по кассе за день, Сообщения, Изменения данных.

**Not used (empty or defaults)**
- All of stock: goods, storages, technological cards, stock operations, inventory, price tags, six stock reports.
- Suppliers; own payment items (13 system ones only); expenses, salary and taxes in the finance reports.
- Online payments, payment policy and deposits (no Adyen), instalments, card commissions, custom payment methods.
- Group events and their categories; own record categories.
- Promotions; calls and telephony; data import and export.
- Webhooks; API keys.
- Legal and bank details (name only), socials and messengers, Facebook Pixel, sale of subscriptions and certificates.
- The non-fiscal receipt set-up (near default).

## Not opened or not verified

**Not opened (from the brief)**
- `/online/online_settings/337850/` (the tab was lost on this step) and `/online/personal_domain/337850/`.
- **Расчёт зарплат**, all eight: `/salary/calculations/337850/`, `/salary_general_settings/337850/`, `/salary_daily/337850/`, `/salary_period/337850/`, `/salary_params/list/337850/`, `/salary_criteria/list/337850/`, `/salary_scheme/list/337850/`, `/salary_extension_reasons/337850/`.
- **Уведомления** `/notifications/337850`: templates, channels per message, text variables, SMS provider settings. Only the message catalogue and real usage above come from the «Сообщения» report.
- **Лояльность** `/loyalty/info/337850` and its sub-pages; `/clients_settings/discounts/337850/`.
- **Ресурсы** `/resources/337850`.
- **Интеграции** `/appstore/337850/applications/overview/` (what is connected is unknown, apart from the «Altegio.me MCP» author in the change log).
- `/location/337850/`, `/group_settings/318560`, `/group/318560`.
- **User roles and access rights:** no such item in the menu or the settings hub; not located.
- **Licence and billing:** `/balance/337850/`, `/balance/invoices/337850/`, `/cabinet/info/`, `/personal_account/profile`. Only the licence date in the sidebar was seen, 4 December 2026; the plan's name and contents were not read.
- `/analytics/reports/337850/reports_storage/` and `/settings/menu/337850/setting_storage/`. Their finance twins are the two hubs scrolled to a section, so these very likely are too.
- The payment policy's sub-tabs Услуги, Сотрудники, Клиенты, Записи.

**Not verified**
- Dialogs behind «Новый платеж», «Добавить кассу», «Добавить платеж», «Перевести средства», «Операции с товарами», «Новая ссылка», «Добавить контрагента / статью / категорию» (not pressed).
- Row actions in lists, the «Детали → Показать» of the change log, the «Подробнее» of the visits panel.
- Which tick is on in the non-fiscal receipt.
- The exact line and colour of the new form fields (drawn inside web components; sizes measured, the line read from a screenshot).
- `/dashboard_records` and `/labels/client` were skipped as the other agent's pages.

---

# Part 3: clients, work schedule, staff, services, notifications

## Клиенты

### `/clients/337850/base/` «Клиентская база»
- **For:** the searchable list of all clients, with bulk actions.
- **In use:** yes, 3 207 clients.
- **Look:** old style.
- **Head:** burger, title, (i), star, breadcrumb «Клиенты». Right: «Операции с Excel ▾» (white, 151 × 36) and «Добавить клиента» (yellow, 157 × 36).
- **«Операции с Excel»:** «Выгрузить в Excel», «Загрузить из Excel». Menu 160 px wide.
- **Search:** one field, 1655 × 30, «Поиск (по имени, телефону, Email или номеру карты)».
- **«Сегменты:»** four blue links: «Новый», «Повторные», «Потерянные», «Заканчивается абонемент».
  - From the help: new and returning look at the last month, lost is no visit for 60 days; click one, then the search button.
- **«Фильтры:»** three dropdown buttons (224 × 30), a trash button (28 × 30) and «Найти» (orange, 117 × 30, far right). Each dropdown ends with a red «Очистить».

  | Dropdown | Conditions |
  |---|---|
  | «По визитам» | Наличие записей · Статус записей · Количество записей · Период · Сотрудник · Услуги · Сумма оказанных услуг |
  | «По клиентам» | Пол · Altegio.me · Мобильное приложение · Категория клиента · Продано · Баланс счета · Получал sms-рассылку · Важность клиента · День рождения · Возраст |
  | «По продажам» | Товары · Сертификаты · Абонементы |

- **What a condition asks for (from the help, not opened):**
  - Наличие записей: has or has no bookings, with a period.
  - Статус записей: came or did not come.
  - Количество записей: a number range.
  - Период: dates, and booked or not booked in them.
  - Сотрудник: one barber or all.
  - Услуги: chosen services.
  - Сертификаты: name, usage, balance, duration, date of sale.
  - Абонементы: name, usage, status, freeze, duration, date of sale, services left.
  - After the first condition a «+» offers «И» / «Или». Each condition is confirmed with its own button. The trash clears all.
- **Table** (div-based, not `<table>`). Head 50 px, rows 50 px, 25 rows.

  | Column | px | Holds |
  |---|---|---|
  | checkbox | 50 | fixed |
  | Имя | 200 | blue link, fixed, opens the card |
  | Телефон | 264 | |
  | Email | 180 | |
  | Продано | 120 | «20 €» |
  | Баланс счета | 180 | «0 €» |
  | Визиты | 125 | number |
  | Скидка | 130 | «0 %» |
  | Последний визит | 200 | «29 мая 2020 г. в 17:00» |
  | Первый визит | 200 | same |

  - Each head cell has a small lock icon that pins the column; «Имя» is pinned.
  - Default order is newest client first (`order_by=id desc`). Whether a head click sorts is not verified.
- **Column chooser:** a round cog (30 × 30) at the head's right end. Popup 175 × 266 with nine ticked checkboxes, exactly the nine columns above.
- **Bottom bar (sticky):** page size 10 / 25 / 50 / 100 «результатов на странице»; «Назад 1 2 3 4 ... Вперед»; right «Показаны результаты с 1 до 25 из 3 207»; blue «Действия» (134 × 30).
- **«Действия»** (popup 321 × 204): an orange line «Найдены Все (3207 клиентов)», then «Отправить сообщение», «Отправить PUSH в мобильные приложения», «Отправить PUSH в Altegio.me», «Добавить в категорию», «Удалить из базы». It acts on the whole filtered list.

### Client card (drawer over «Клиентская база»)
- **Path:** same page, with `client_id` in the query.
- **Layout:** a new-style drawer, 900 px wide at x 1020, full height. The left menu hides and the list stays visible in the remaining 980 px.
- **Top:** the client's name (20/24, 500); a burger; a row of chip tabs that scrolls sideways.
- **Nine tabs:** Карточка клиента · История визитов · Статистика · Сообщения и звонки · Отправить сообщение · Лояльность · Счета клиентов · Уведомления · Файлы.
- **«Карточка клиента», left column (558 px):**
  - Имя (text).
  - Телефон: country-code select and number.
  - Дополнительный телефон: the same.
  - Email.
  - Дата рождения (text, «01.01.2000»).
  - Пол (select, «Не выбран»).
  - Класс важности (select, «Без класса важности»).
  - Номер карты.
  - Скидка, %.
  - Switch «Запретить записываться через онлайн-запись».
  - Примечание (textarea).
  - Категория (select, «Не выбрана»).
- **«Карточка клиента», right column (253 px):**
  - Photo box and «Загрузить изображение» (12 MB limit).
  - «История комментариев»: «Новый комментарий» textarea and «Добавить».
  - Four number fields: «Продано услуг и товаров, €» (with «за N посещений»), «Оплачено в кассу, €», «Баланс, €», «Резерв(Депозиты), €».
  - «Посмотреть историю посещений»; a block «Мобильное приложение».
- **Footer:** «Удалить» (white), «Сохранить» (yellow).
- **«История визитов»:** a select «Все записи»; a table.
  - Columns: Сотрудник 217 · Статус 116 · Услуга 240 · Стоимость 87 · Оплачено 79 · Способ оплаты 113.
  - Rows are grouped under a date line («14 Ноября 2023 · Rempire», 50 px).
  - A visit row is 69 px: avatar, barber, time, link «Подробнее»; a status with a coloured dot («Ожидание»); the service; sums.
- **«Статистика»:** a date-range field; a card «Выручка по клиенту» (line chart); two cards «Услуги» and «Сотрудники».
- **«Сообщения и звонки»:** sub-tabs «Отправленные сообщения» | «История звонков» with the yellow line. Table: Сообщение 341 · Отправлено 181 · Тип 169 · Статус 98 · Канал 63; rows 53 px.
- **«Отправить сообщение»:** «Текст сообщения» textarea; «Каналы отправки» checkboxes SMS, Push, Email; yellow «Отправить».
- **«Лояльность»:** empty state «В данной локации у клиента нет карт лояльности, сертификатов или абонементов».
- **«Счета клиентов»:** «Открытие нового счета», a lilac note «Тип счета» with the link «Перейти к управлению счетами»; no account types here.
- **«Уведомления»:** «Настройки уведомлений».
  - «Рекламные рассылки»: checkbox «Не отправлять».
  - «Доступные каналы»: Push, SMS, Email.
  - «Типы уведомлений», 13 switches:
    - Предстоящий визит
    - Запрос отзыва после визита (виджет)
    - Запрос отзыва после визита (журнал)
    - Создание записи через виджет
    - Создание записи через журнал
    - Поздравление с днём рождения
    - Подтверждение записи клиента (виджет)
    - Удаление записи (виджет)
    - Новая скидка
    - Окончание действия скидки
    - Приглашение на повторный визит
    - Приглашение на визит недошедших клиентов
    - Отмена записи администратором или сотрудником
- **«Файлы»:** a lilac note with the formats (jpeg, jpg, png, gif, doc, docx, pdf, xls, xlsx, txt), «Загрузить файлы», 12 MB, «Файлов пока нет».

### `/labels/client/337850/` «Список категорий»
- **For:** the list of client categories (tags).
- **In use:** defaults only: VIP, Loyal, Permanent.
- **Head:** yellow «Добавить категорию».
- **Left box (about 400 px):** three links: «Категории клиентов» (active, orange `#fa8a42`, bold), «Категории записи» → `/labels/record/337850/`, «Категории событий» → `/labels/activity/337850/`.
- **Right:** a row per category, 65 px: the tag with a small icon, and a pencil (40 × 34) that edits in a popup with «Сохранить» / «Удалить».
- **Tag colours:** VIP `#fbca04` with black text, Loyal `#bfd4f2` with black, Permanent `#009800` with white.

### `/clients_settings/clients_classes/337850` «Программа лояльности» → «Правила для классов важности»
- **For:** automatic Бронза / Серебро / Золото classes.
- **In use:** no; only the default 365 days is filled.
- **Left box:** «Правила для классов важности», «Правила для категорий» (`/auto_labels/`), «Настройки» (`/settings/`).
- **Form:** three blocks, three rows each, in the shape «label → number field → class with a coloured square»:
  - «По проданному»: «Продано от [ ] €».
  - «По оплаченному»: «Оплачено от [ ] €».
  - «По количеству визитов»: «Визитов от [ ]».
- **«Отмена класса важности»:** «Не посещал более [365] дня».
- Full-width cyan «Сохранить» (1197 × 34).

### `/clients_settings/auto_labels/337850` «Правила для категорий»
- **For:** adding or removing a category automatically.
- **In use:** no (all 8 fields empty).
- **«Автодобавление в категорию»:**
  - Four rows with a field, a category select (VIP / Loyal / Permanent) and a blue «+» for another rule: «Продано от € →», «Оплачено от € →», «Визитов от →», «Не посещал более … дня →».
  - Two rows with only a select («Не устанавливать категорию» or a category): «Установлен статус визита "Клиент пришел"» and «…"Клиент не пришел"».
- **«Автоудаление из категории»:** the same six rows; the select starts at «Не удалять категорию».

### `/clients_settings/settings/337850` «Настройки»
- One block «SMS-уведомление о прекращении действия скидки»: select «Уведомлять за»: «Не уведомлять», then 1 to 15 days. Set to «Не уведомлять». Cyan «Сохранить».

### `/clients_settings/discounts/337850/` «Правила для скидок»
- **For:** an automatic discount by spend or visits.
- **In use:** no.
- Blocks «По проданному», «По оплаченному», «По количеству визитов»: one row each «… от [ ] → [ ] %» with a blue «+».
- «Отмена скидки»: «Не посещал более [365] дня». Cyan «Сохранить».

### `/loyalty/info/337850` «Лояльность»
- A promo page, not in use.
- A hero card with yellow «Подробнее», then four white cards, each with an outlined «Настроить»: «Карты лояльности, скидки и кэшбэк», «Сертификаты», «Абонементы», «Депозиты на счетах клиентов».

## Сотрудники

### `/work_schedule/337850/` «График работы»
- **For:** who works which day, set in bulk.
- **In use:** yes; five barbers, shifts filled to late November or mid-December.
- **Look:** new style.
- **Head:** title, (i), yellow star; right an outlined «Выгрузить в PDF».
- **Toolbar (y 114, 32 px controls):** «Фильтры ▾» (yellow line, 107 px) · ‹ › · «Ноябрь 2026» · «Сегодня» · far right a segmented «Неделя | Месяц» (Месяц dark) · a gear.
- **«Фильтры»** opens an inline panel of five selects (300 × 32): «Сотрудники и должности», «Специализации», «Удаленные / Неудаленные», «Уволенные / Неуволенные», «Есть график / Нет графика».
- **Gear:** popover «Настройка графика» with two switches, both on: «Отображать у сотрудников сумму смен и часов», «Отображать количество сотрудников за день».
- **Grid:**

  | Part | Measure |
  |---|---|
  | Staff column | 264 px, sticky. Head «Сотрудники» with a yellow count badge. |
  | Staff row | 64 px, bottom line `#eaeef4`: photo 24 × 24 (radius 4), name 12/16 500, a «…» button 16 × 16 |
  | «…» menu | «Скопировать график», «Редактировать сотрудника» |
  | «Итого» column | 91 px, one per month, sticky after the staff column. Head «Итого» 14/20 500 and the month 11/14 `#71757f`. Cell: a case icon with the number of shifts and a clock with hours («133.25 ч»), 12 px `#71757f`. |
  | Day column | 38 px. Two months in a row, 2536 px in all, scrolled sideways. |
  | Day head | 83 px: number 14/20 500, weekday 12/16, then a person icon and how many work that day (12/16 `#9aa3b1`), or «–» |
  | Weekend | number and weekday `#f96065` |
  | Next month's days | `#9aa3b1`; its weekends `#fb9599` |
  | Today | head chip 29 × 40, `#ffd940`, radius 6; the whole column tinted `rgba(255,249,223,.5)` |
  | Shift cell | slot 38 × 64 with 2 px padding; block 33 × 60, `#cdf4cd`, radius 4; start and end time on two lines, 8/10 500 `#19803b` |
  | In a shift, bottom | left a number 8 px `#29c235` (class `busy-intervals-count`); right a 4 px dot `#29c235` (class `breaks-tag`) |
  | Day off | an empty white cell |

  - The class names say the number counts visits and the dot marks breaks. The help says the opposite (numbers are breaks, dots are visits). Hover was not tried, so this is open.
  - Only green shifts were on screen. No legend and no side panel are shown until a cell is clicked.
- **Editing (from the help, not tried):**
  - A click on a cell opens a panel on the right.
  - Template: none, by weekdays (tick days, number of weeks), by shifts (2/2, 5/2), or your own («Create a template»).
  - Type: workday, sick leave, annual leave, unpaid leave, missed shift, paid leave.
  - Hours 00:00 to 24:00; a «Break» button.
  - Further clicks mark more cells, for several barbers; «Save» is bottom right.
  - To remove: type «Non-working day», mark the days (they turn red), «Delete». A day with bookings is refused.
  - «Скопировать график»: choose barbers, a period (two weeks by default, at most this and next month), a tick to copy breaks. It cannot be undone.

### `/settings/sidebar/staff/337850/` «Список сотрудников»
- **For:** the staff list with their booking, role and licence state.
- **In use:** yes, «Найдено: 6» (five barbers and one system user).
- **Head:** star; right «Управление лицензией».
- **Row 1:** search «Поиск по имени» and yellow «+ Добавить».
- **Filters (selects, 32 px):** «Должность» (Все) · «Уволенные / Неуволенные» · «Удаленные / Неудаленные» · «Доступ» (Все) · «Учет в лицензии» (Все). Then yellow «Найти», «Сбросить», the count.
- A lilac note «Мы обновились!…» with ×.
- **Tabs (yellow line):** «Должность» · «Специализация» · «Cистемные пользователи».
- **«Должность»:** collapsible groups; here one, «Без должности · Сотрудников: 5».
  - Column heads (14/16 500): Сотрудник · Расписание · Онлайн-запись · Услуги · Роль · Лицензия.
  - Row 96 px, white, radius 8:
    - photo, name (blue link `#003acc`), then speciality, phone, e-mail (12/16 `#71757f`);
    - a green tag «до 28.11.2026» (schedule filled until);
    - a switch for online booking;
    - the number of services (link);
    - the role «Специалист» or «Владелец» (link);
    - «Платный» with a pencil;
    - «…».
- **«Специализация»:** the same rows as one flat list.
- **«Cистемные пользователи»:** columns Сотрудник · Доступ · Учет в лицензии. One row: «Altegio.me MCP» with a tag «Интеграция», «Неизвестно», «Бесплатный».

### Staff member (drawer), `/settings/sidebar/staff/337850/employee/{id}/info`
- The same 900 px drawer. Each tab has its own path. Footer on every tab: «Удалить», «Уволить», yellow «Сохранить».
- **«Информация»** `/info`:
  - «Отображаемое имя»;
  - «Должность (необязательно)», a searchable select with the hint «Для создания новой должности напишите ее название и нажмите Enter»;
  - «Специализация»;
  - the photo with «Изменить изображение» (JPEG or PNG, 12 MB).
- **«Услуги»** `/services` (badge with the count): «Услуги сотрудника»; «Назначить услуги», «Создать услугу»; a search; a collapsible category «Услуга · Оказывает: 4 из 12».
  - Columns: Услуга (link, base price under it) · Цена сотрудника (field) · Онлайн-запись (switch) · Журнал записи (switch) · Длительность («01 ч 00 м» field) · Технологическая карта · an unlink icon.
  - His price can differ from the base (40 € against 39 €).
- **«Онлайн-запись»** `/online-booking`:
  - Two radio cards: «Доступен для онлайн записи» / «Недоступен для онлайн записи».
  - «Страница сотрудника»: «Описание»; checkbox «Рейтинг сотрудника».
  - «Правила записи»: «Платёжная политика» with a link; checkbox «Пропуск выбора сотрудника» (bookable under «Любой специалист»).
  - «Доступное время для онлайн-записи»: radio «Общее по локации» / «Персонально для сотрудника».
- **«Расчет зарплат»** `/payroll`: empty, «Пока не задана схема расчета зарплаты», yellow «Добавить схему».
- **«График работы»** `/schedule`: only a note «График работы сотрудника теперь в Настройках» with «Убрать из графика» and yellow «Настроить».
- **«Доступ»** `/access`:
  - Switch «Предоставить доступ в систему»; Email; Номер телефона; Информация.
  - «Права доступа»: a role select («Специалист»); «История изменений прав», «Скопировать права»; a search.
  - Groups with a switch and a count: Журнал записей (7 из 8 прав), Окно записи (26 из 29), Финансы (2 из 38), Товары (1 из 39).
  - Then single rights: «Разрешить доступ к локации только с IP-адресов», «Ресурсы», «Совершать SMS рассылки клиентам», «Добавление локации в сети».
- **«Уведомления»** `/notifications`:
  - Select «Типы уведомлений» («На основе прав доступа»).
  - Checkbox «Данные клиента: отправлять имя и номер телефона клиента».
  - A table «Тип уведомления | Каналы отправки»; each row has a switch and SMS / Email / Push checkboxes:
    - Создание записи клиентом
    - Создание записи администратором
    - Удаление записи клиентом или администратором
    - Перенос записи клиентом или администратором
    - Окончание действия лицензии
    - Письмо с автоматически созданными платёжными документами
    - Отмена записи администратором
  - «Уведомления в Web-версии»: «Операции с записями», «Входящие звонки».
- **«Настройки»** `/settings`:
  - «Записи»: select «Разметка в журнале записи»; checkbox «Не отображать сотрудника в журнале записи».
  - «Статистика»: checkbox «Учитывать сотрудника в заполненности».
  - «Внедрение»: «Синхронизация с Google Календарем» («Войти через Google»); checkbox «Выгружать данные клиентов в Google Календарь»; «Внешний ID».
- **«Юр. информация»** `/legal-info`: Имя, Фамилия, Отчество, Гражданство, Пол, Паспортные данные, ИНН, Страховой номер, Дата приема на работу, Дата окончания регистрации/патента, Дополнительный телефон.

### `/positions/list/337850/` «Должности»
- Empty. Yellow «Добавить должность» in the head.
- Centred: «Пока не создана ни одна должность», «Добавьте должности для фильтрации сотрудников.», a cyan «Добавить должность» (→ `/positions/edit/337850/0/`).

## Услуги

### `/settings/sidebar/service_categories/337850/` «Категории услуг»
- **For:** categories and their services, edited in place.
- **In use:** yes; one category «Услуга» with 12 services.
- **Head:** yellow star, breadcrumb «Услуги»; right «Операции с Excel ▾».
- **Row 1:** search «Введите название услуги» and yellow «Создать».
- **Category row (56 px, grey, radius 8):** a drag handle, the name (14/20 500), «Количество услуг: 12», a pencil, a chevron.
- **Services table inside.** Rows 52 px.

  | Column | px | Holds |
  |---|---|---|
  | Название | 463 | drag handle and the name; a click opens the service |
  | Онлайн-запись | 200 | a switch with «Вкл» |
  | Цена | 200 | «€ 40», «от € 45», «€ 30 – 35»; edits in place |
  | Длительность | 200 | «01 ч», «45 мин», «Индивидуально» (differs per barber), «Сотрудники не назначены» |
  | Тех. перерыв | 148 | «Без перерыва» |
  | Технологическая карта | about 200 | «Не указано» |
  | Сотрудники | about 150 | stacked photos and «+1», or «Не назначены» |
  | pencil | about 50 | |


### One service (drawer), `/settings/sidebar/services_edit/basic/337850/{category}/{service}`
- The 900 px drawer; the opened row gets a yellow outline. Footer: «Удалить», yellow «Сохранить».
- **«Основные настройки»** `/basic/`:
  - «Название» (text).
  - «Категория» (select).
  - «Базовая цена» (number, €) and a checkbox «Указать цену в диапазоне».
  - «Длительность»: two selects, hours and minutes.
  - «Технический перерыв после записи» (select, «Без перерыва — общий»), with a link to «Цифровой журнал».
  - «Тип»: radio «Запись» / «Групповое событие».
  - «API Id» with a copy icon.
  - **«Сотрудники, оказывающие услугу»**, a table with a row per barber: Название (searchable select) · Цена (number, €) · Длительность (hours and minutes) · Технологическая карта.
  - Under it «Назначить сотрудника», «Создать сотрудника», and a note that the plan's staff limit is reached.
  - «Итоговая цена» and «Итоговая длительность».
- **«Онлайн-запись»** `/booking/`:
  - A head switch (service bookable online).
  - «Название для онлайн-записи»; «Описание» (textarea); an image with «Загрузить изображение».
  - «Платёжная политика» with a link.
  - Switch «Запретить онлайн-запись без абонемента».
  - Switch «Услуга доступна ограниченное время» (by period, time or weekdays).
- **«Расширенные настройки»** `/extended/`: «Название в чеке»; «Система налогообложения» and «Налог» (both «По умолчанию»); «Напоминание о повторном визите» («Использовать общие настройки локации»); switch «Автоматическое списание с абонементов».
- **«Ресурсы»** `/resources/`: empty, «Ресурсов пока нет», yellow «Создать».
- **«Языки»** `/translations/`: a row per language: a language select («Английский», «Эстонский»), the translated name, a trash; «+ Добавить перевод». Both are filled.

## Ресурсы

### `/resources/337850` «Ресурсы»
- Empty. Yellow «Добавить ресурс»; a white card «Пока не создан ни один ресурс».

## Уведомления

### `/notifications/337850` «Уведомления» → «Типы уведомлений»
- **For:** which automatic messages go out, and by which channel.
- **In use:** yes.
- **Tabs (yellow line):** «Типы уведомлений» | «Каналы отправки» (`/channels`).
- A list 1098 px wide, in collapsible sections. A row is 65 px: a switch, the name, grey channel tags, a chevron; the row opens `/notifications/337850/type/{n}`.

**Клиенту**

| Group | Message | State | Channels |
|---|---|---|---|
| Увеличение посещаемости | Создание записи через виджет онлайн-записи | on | Email, Altegio.me |
| | Создание записи через журнал записи | on | Email, Altegio.me |
| | Уведомление о подтверждении записи | on | Email, Altegio.me |
| | Изменение записи | off | SMS, Email, Altegio.me |
| | Запрос подтверждения записи | off | SMS, Email, Altegio.me |
| | Напоминание о визите | on | SMS, Email |
| | Отмена записи | on | Email, Altegio.me |
| | Отмена записи с помощью статуса «Клиент не пришел» | off | SMS, Email, Altegio.me |
| | Приглашение на визит недошедших клиентов | on | SMS, Email, Altegio.me |
| Контроль качества | Запрос отзыва после визита (виджет) | off | SMS, Email, Altegio.me |
| | Запрос отзыва после визита (журнал) | off | SMS, Email, Altegio.me |
| Работа с возвращаемостью | Поздравление с днём рождения | on | SMS, Email, Altegio.me |
| | Новая скидка | off | SMS, Email, Altegio.me |
| | Окончание действия скидки | off | SMS, Email, Altegio.me |
| | Приглашение на повторный визит | off | SMS, Email, Altegio.me |
| Другой | Ссылка на привязку карты | off | none shown |
| | Ссылка на предоплату | off | none shown |
| | Уведомление клиенту со ссылкой на оплату | off | none shown |
| | Подтверждение номера клиента в виджете онлайн-записи | on | SMS |
| | Уведомление клиента об успешной онлайн-оплате | off | SMS, Altegio.me |

**Администратору**

| Message | State | Channels |
|---|---|---|
| Создание записи клиентом | off | SMS, Email, Приложение администратора |
| Создание записи администратором | off | SMS, Email, Приложение администратора |
| Перенос записи, созданной через виджет | off | SMS, Email, Приложение администратора |
| Отмена записи клиентом через виджет | on | Email, Приложение администратора |
| Скорое завершение расписания работы сотрудников | off | none shown |

**Сотруднику**

| Message | State | Channels |
|---|---|---|
| Создание записи клиентом | on | Email, Приложение администратора |
| Создание записи администратором | on | Email, Приложение администратора |
| Перенос записи клиентом или администратором | off | SMS, Email, Приложение администратора |
| Отмена записи клиентом или администратором | on | SMS, Email, Приложение администратора |
| Отмена записи администратором с помощью статуса «Клиент не пришел» | off | SMS, Email, Приложение администратора |

**Администратору и сотруднику:** «Окончание действия лицензии», off, SMS, Email, Приложение администратора.


### `/notifications/337850/type/1` «Напоминание о визите»
- «‹ Назад»; title (20/24 500); a description. Tabs «Основные настройки» | «Шаблоны уведомлений» (`/templates`). Yellow «Сохранить» bottom right.
- **«Условия отправки»:**
  - Select «Отправлять уведомление»: «За 2 часа до визита».
  - Checkbox «Другое время для отправки на email», ticked.
  - Select «Отправлять уведомление на email:»: «За 12 часов до визита».
- **«Отправка уведомлений»:**
  - «Подключенные», each with a tag «Активная» and a select: Email «Всегда отправлять»; Altegio.me «Не отправлять»; SMS (messaggio.com) «Всегда отправлять».
  - «Не подключенные»: «Брендированное приложение», WhatsApp, each with «Подключить».
- **«Шаблоны уведомлений»**, a collapsible card per channel:
  - **Email:** «Дополнительная информация в Email» (collapsed) and «Предпросмотр письма».
  - **Altegio.me:** «Текст сообщения», an editor where variables are grey chips; «+ Добавить переменную»; a phone preview with iPhone / Android tabs.
  - **SMS:** the same editor; right «Предпросмотр уведомления с тестовыми данными».
  - The salon's SMS is in English: the barber's name, the time left, and a short link to the visit.
- **The 21 variables in the SMS list** («Количество дней до сгорания скидки» is there twice):
  - Company: Название компании · Ссылка на онлайн-запись · Адрес компании · Номер телефона компании · Сайт компании · Ссылка на карты.
  - Discount: Количество дней до сгорания скидки.
  - Visit: Дата записи · Дата и время записи · Дата и время записи (сокр.) · Время записи · Время до записи · Имя сотрудника · Ссылка на детали записи · Ссылка на форму отзыва · Услуги в визите · Услуги в отдельной записи.
  - Client: Имя клиента · Фамилия клиента · Телефон клиента.

### `/notifications/337850/channels` «Каналы отправки»
- **«Подключенные»:**
  - SMS (messaggio.com): «Активная» in amber, «Настроить».
  - Email: «Активная» in green, «Настроить».
  - Altegio.me («Что это?»): «Активная», «Подробнее».
  - «Приложение администратора»: «Активная».
- **«Не подключенные»:** WhatsApp, «Брендированное приложение», each with yellow «Подключить».

## Components

**Old-style list («Клиентская база»)**

| Part | Measure |
|---|---|
| Breadcrumb | 12/16, `#c6cbd3` |
| Search field | 30 px, `#fafafa`, 1 px `#e4e4e4`, radius 0, 12 px, padding 1 10 |
| Filter dropdown button | 224 × 30, white, 1 px `#ddd`, radius 3, 12/28 500 `#606060` |
| Filter dropdown list | 224 px, white, 1 px `rgba(0,0,0,.19)`, shadow `rgba(0,0,0,.13) 0 4px 4px`, radius 0 |
| «Найти» | 117 × 30, `#efb250`, white 12 px 500, radius 3 |
| «Действия» | 134 × 30, `#1c86c4`, white 13 px 500, radius 3 |
| Segment links | 13/19, `#1c86c4`; the label «Сегменты:» 13 px 700 |
| Table head | 50 px, white, title 13 px 700 `#676a6c`, padding 16 10 0, line `#ededed` |
| Table row | 50 px, 13 px 400 `#676a6c`, cell `#fafafa`, line `#ededed`; link `#337ab7` |
| Paging | 30 px, 1 px `#ddd`, 13 px; current `#eee` |
| Column chooser | 175 px, white, radius 4 |
| Head dropdown menu | radius 12, shadow `rgba(33,47,65,.35) 0 1px 2px` |
| «Действия» popup | 321 px, radius 3, shadow `rgba(0,0,0,.25) 0 3px 5px` |

**Old-style settings forms (loyalty, categories)**

| Part | Measure |
|---|---|
| Sub-menu box | about 400 px, links 13/18; active `#fa8a42` 700, others `#666` |
| Block title | 16/17, 600 |
| Row label | 13/18; row pitch 46 px |
| Field | 30 px, 1 px `#e5e6e7`, radius 1, padding 6 8, 14 px; a 34 px unit box («€», «%», «дня») |
| Save | full width, 34 px, `#58cde5`, white 14 px, radius 3 |
| Category tag | 25 px, padding 3 8, radius 3.5, 14/14 700 |
| Old empty state | centred: h3 16/17 600, text 13/18, a cyan button |

**New-style drawer (client, barber, service)**

| Part | Measure |
|---|---|
| Drawer | 900 px, white, full height; the page keeps 980 px, the left menu hides |
| Chip tab | 32 px, radius 8, padding 8, 12/16 500, icon left; open one on `#f7f9fc` |
| Section title | 20/24, 500 |
| Field | 32 px box, white, 1 px `#e0e3eb`, radius 8, padding 3 9; text 14/24 `#2b3134`; label above 12/16 `#71757f` |
| Footer buttons | 32 px, radius 8, 12/16 500: yellow `#ffcb00` without a border; white with 1 px `#e0e3eb` |
| Switch | 42 × 24, yellow when on |

**Tabs with the yellow line**

| Where | Measure |
|---|---|
| Inside a drawer | tab 48 px, padding 14 12, label 14/20 500; open `#2b3134`, others `#71757f`; line 3 px `#ffcb00` |
| «Уведомления» page | tab 64 px, padding 0 22, label 16/24 (open 500, others 400 `#71757f`); line 4 px `#ffcb00` |
| «Список сотрудников» | label 14/20 500, same colours |

**New-style tables and lists**

| Part | Measure |
|---|---|
| Visit history head | 48 px, `#f0f3f8`, radius 12, 12/18 600 `#999ea7`, padding 8 10 |
| Visit history rows | date line 50 px (12/18, padding 16 20); visit 69 px, 12/18 `#36393e` |
| Messages table | head 36 px, 14 px 500 `#2b3134` on white, padding 8 6; row 53 px, 12/18 |
| Staff list row | 96 px, white, radius 8; name 14/20 `#003acc`; second lines 12/16 `#71757f`; column heads 14/16 500 |
| Services row | 52 px, 14/20 `#262626` |
| Notification row | 65 px; section title 14/20 500; group label 14/24 `#71757f` |

**Tags, empty states, cards**

| Part | Measure |
|---|---|
| Green tag | 24 px, padding 4 6, radius 4, 12 px, `#219c2b` on `#e9f7e9` |
| Channel tag | 24 px, padding 4 8, radius 4, 12 px `#2b3134` on `#e0e3eb` |
| Status text | green `#29c235`; amber `#997a00` |
| New empty state | a 48 px circle `#eaeef4` with a 24 px icon; under it 12/16 500 `#9aa3b1`, centred |
| Promo card | white, radius 12, padding 48; outlined button 48 px, 1 px `#ffcb00`, radius 8, 16/24 500 |
| Row buttons on channels | 32 px, radius 8: white with `#e0e3eb`, or yellow |

## Not opened or not verified

**Клиентская база**
- The sub-controls of each filter condition: adding one means clicking a menu item, so they come from the help.
- Sorting by a head click, the lock icons, the (i) and the star.
- «Добавить клиента», the Excel import and export dialogs, every «Действия» item.
- Whether the drawer's burger swaps the chip row for a 224 px side menu («Компактный вид» is in the DOM).
- An older client dialog is also in the DOM, hidden, with nearly the same tabs.

**Categories and loyalty**
- The add and edit popup of a category (name, colour).
- «Категории записи» and «Категории событий».
- Every «Настроить» on «Лояльность».

**График работы**
- The right panel, the templates, the «Скопировать график» dialog, «Неделя» mode, the month picker, «Выгрузить в PDF». The toggle has no ref, so it was not clicked.
- What the number and the dot in a shift mean (see the page's note).
- Colours of leave types and of past days: only green shifts were on screen.

**Сотрудники**
- A staff row's «…» in the list, the licence pencil, «Добавить», «Управление лицензией».
- The option lists of the five filters.
- The inside of each rights group on «Доступ».

**Услуги**
- «Операции с Excel», «Создать», the category pencil, the «Сотрудники» cell's popup: these sit in shadow DOM without refs.
- The exact widths of the last three columns.
- Options of the break, tax and reminder selects.
- The «limited time» settings of a service.

**Уведомления**
- Every type except «Напоминание о визите».
- The e-mail's extra text and its preview.
- The Altegio.me variable list.
- «Настроить» on SMS and Email.

**Help articles used**
- [Editing work schedules](https://alteg.io/en/support/knowledge-base/10128987037085/)
- [Client database filters](https://alteg.io/en/support/knowledge-base/4861296116253/)
- [Client management, list of articles](https://alteg.io/en/support/knowledge-base/categories/clients-management/)
