# Altegio's admin, page by page

*Scanned 19.11.2026 in Renat's account, **looking only**: nothing was saved,
moved, cancelled, created, exported or sent. Measured at a 1920 × 911
window. No client's name, phone or visit is written here. The summary of
the look is `docs/reference-looks.md`; this file is the detail, so that
our pages can repeat Altegio's functions and layout (Dim, 19.11.2026:
«use their UI/UX exactly as is»), in our own code, icons and words.*

**Two parts.** Part 1 is the daily work: the sidebar, the journal, the visit
window, «Записи». Part 2 is the rest: reports, finance, goods, online
booking, settings, and **what this salon uses** of it all. Each part ends
with what is not opened yet; «Клиентская база», «График работы»,
«Сотрудники», «Должности» and «Услуги» are a third pass.

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
