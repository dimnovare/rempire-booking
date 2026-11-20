# Altegio's staff rights: the full list, with each role's defaults

*Collected 19.11.2026 from Altegio's own help: its PDF «Права ролей
сотрудников по умолчанию» (November 2026) and the help article of each
group. Dim, 19.11: «add all switches». Ours get a switch for every right
whose function we have; the rest are listed as not applicable until that
function exists (`docs/kickoff.md`, row 33).*

**At REMPIRE today** (the «Доступ» tab of each login, 19.11): Renat is
«Владелец» with nearly everything; the four barbers have the journal and
the visit window nearly whole (6–7 of 8, 23–26 of 29), finance 0–2 of 38,
goods 0–1 of 39, staff 0–1 of 8. Jevgeni and Slava may take payments,
Valentin and Milena may not. There is no front-desk login.


Altegio publishes the complete list itself: a PDF "Права ролей сотрудников по умолчанию" (updated November 2026), linked from its roles article. It gives every right in RU and EN and the default for each of 8 roles. All labels below come from that PDF; the one-line descriptions come from Altegio's per-section help articles. Nothing below is from YCLIENTS unless marked.

- RU PDF: https://alteg.io/support/wp-content/uploads/2026/11/altegio-team-member-role-permissions-ru.pdf
- EN PDF: https://alteg.io/support/wp-content/uploads/2026/11/altegio-team-member-role-permissions-en.pdf

**Role codes** (PDF column order):

| Code | RU | EN | Counted in licence |
|---|---|---|---|
| SM | Менеджер системы | System manager | No |
| VW | Только просмотр | Viewer | No |
| SP | Специалист | Professional | Yes |
| AD | Администратор | Receptionist | Yes |
| CC | Колл-центр | Call center | Yes |
| AC | Бухгалтер | Accountant | Yes |
| MG | Менеджер | Manager | Yes |
| OW | Владелец | Owner | Yes |

"On:" lists the roles that have the right on by default. "↳" marks a nested right.

**How the counter counts.** I checked this against every role total in the PDF and the sums match.
- A drop-down with its own caption counts as one right (positions, team members, history limit, «Показывать клиентов»).
- The uncaptioned «Кассы» and «Склады» selectors also count as one right each.
- The other uncaptioned settings do not count: «Период», «Типы транзакций», «Сотрудник», «Объем управления правами».
- The group switch itself is not counted.

## Counts against the sizes you gave

| Group | Your screen | PDF |
|---|---|---|
| Журнал записей | 8 | 8 |
| Окно записи | 29 | **31** (27 for the two free roles) |
| Финансы | 38 | 38 (36 for the two free roles) |
| Товары | 39 | 39 |
| Сотрудники | 8 | 8 |
| Услуги | not given | 12 |
| Уведомления | not given | 2 |
| Настройки | not given | 10 |
| Клиентская база | not given | 26 |
| Отчёты | not given | 25 |
| Лояльность | not given | 8 |
| Лицензия | not given | 1 |
| Онлайн-запись | not given | 1 |
| Single rights | 4 named | 4 |

Total: 209 rights in 13 groups plus 4 single rights, 213 switches. Only «Окно записи» differs (29 on the live screen, 31 in the PDF). No page says which two are missing on that account.

## 1. Журнал записей / Appointment Calendar (8)
Sources: https://alteg.io/ru/support/knowledge-base/4846977968669/ and https://alteg.io/en/support/knowledge-base/4846977968669-appointment-calendar-access-rights/

Group totals: SM 5, VW 5, SP 3, AD 8, CC 7, AC off, MG 8, OW 8.

1. Просматривать расписание и записи должностей — View schedule and bookings of positions — choose the positions whose schedule and bookings the person sees. Default «Всех должностей» for all roles except AC.
2. Просматривать расписание и записи сотрудников — View schedule and appointments of team members — choose the staff whose schedule the person sees (for example only themselves). Default «Всех сотрудников» for all except AC.
3. Ограничить доступ к истории расписания и записей — Limit access to history of schedule and appointments — how far back the calendar is visible: no limit, 1 day to 6 months, or no past days. Default «Не ограничивать»; SP «Ограничивать прошедшие дни».
4. Изменять график работы и время для записи сотрудника в журнале — Change team member's work schedule and appointment time in the Appointment Calendar — add or remove working days and breaks in the calendar. On: AD MG OW.
5. Показывать номера телефонов — Show phone number — full client phone in the visit card; otherwise masked like +3123XXXXX90. On: SM VW AD CC MG OW.
6. Перенос записи — Reschedule appointment — drag a booking to another time or barber, and change its length, in the calendar. On: AD CC MG OW.
7. Показывать статистику — Show statistics — the day's top panel: cash and card takings, bookings total, loyalty paid, discounts, product sales. On: SM VW AD CC MG OW.
8. Показывать лист ожидания — Show waiting list — use the waiting list in the calendar; it must also be enabled in the calendar settings. On: AD CC MG OW. Source: https://alteg.io/ru/support/knowledge-base/344140/

## 2. Окно записи / Appointment window (31)
The help article calls it "Booking window". Sources: https://alteg.io/ru/support/knowledge-base/4847132275229/ and https://alteg.io/en/support/knowledge-base/4847132275229-booking-window-access-rights/

Group totals: SM 5/27, VW 5/27, SP 0/31, AD 28/31, CC 24/31, AC off, MG 28/31, OW 31/31.

1. Добавление, изменение и удаление ассистентов — Add, edit and delete assistants — add and edit assistants on a visit. On: AD MG OW.
2. Изменение доли вознаграждения ассистента — Edit assistant compensation share — change assistants' shares in the visit. On: AD MG OW.
3. Доступ к данным клиентов — Access to the clients' data (Including phone number) — phone, email, client panel, loyalty and booking details in the window. On: SM VW AD CC MG OW.
4. Доступ к созданию новых клиентов в записи — Access to create new clients in the appointment — type in a new client, who is added to the client base; needs «Создавать записи». On: AD CC MG OW.
5. Доступ к выпадающему списку с данными о клиентах — Access to drop-down list with client data — search and pick existing clients. On: SM VW AD CC MG OW.
6. ↳ Показывать номера телефонов — Show phone number — phones in that drop-down. On: SM VW AD CC MG OW.
7. Просмотр дополнительных полей записи — View appointment custom fields — see custom fields on a booking. On: SM VW AD CC MG OW.
8. Создавать записи — Create appointments — add bookings or events. On: AD CC OW. Manager is off in the PDF as published.
9. Изменять записи — Change appointments — edit unpaid bookings not in «Пришел»: status, services, comments, colour, resources, client. Has a «Период» setting. On: AD CC MG OW.
10. ↳ Изменять записи со статусом визита «Клиент пришел» — Change appointments with the "Arrived" status — same edits on unpaid arrived visits. On: AD CC MG OW.
11. ↳↳ Доступ на редактирование оплаченной записи в статусе «Клиент пришел» — Access to edit paid bookings in the "Arrived" status. On: AD CC MG OW.
12. ↳ Доступ на редактирование оплаченной записи в статусе «Клиент подтвердил» — Access to edit paid appointments in the "Confirmed" status. On: AD CC MG OW.
13. ↳ Изменять стоимость услуг — Change the cost of services — adjust a service price at payment. On: AD CC MG OW.
14. ↳ Изменять скидку на услуги — Change the discount for services. On: AD CC MG OW.
15. ↳ Изменять дополнительные поля записи — Change appointment custom fields. On: AD CC MG OW.
16. ↳ Изменять сотрудника и время записи — Change team member and appointment time — reschedule from the window. On: AD CC MG OW.
17. ↳ Изменять длительность — Change duration — independent of rescheduling. On: AD CC MG OW.
18. ↳ Изменять комментарий — Change comment — otherwise comments are read-only. On: AD CC MG OW.
19. ↳ Изменять состав услуг — Change services — add services and change their quantity. On: AD CC MG OW.
20. Удалять записи — Delete bookings — delete unpaid bookings not in «Пришел». On: MG OW.
21. ↳ Удаление записей со статусом «Клиент пришел» — Delete appointments with the "Arrived" status. On: MG OW.
22. ↳ Удаление оплаченных записей — Delete paid appointments. On: MG OW.
23. Проводить продажу товаров — Sell products — sell products inside a visit. On: AD CC MG OW.
24. ↳ Создание товарных транзакций — Create product transactions — with a «Период» for back-dating. On: AD CC MG OW.
25. ↳ Редактирование товарных транзакций — Edit transactions for products — with a «Период»; only opens the two rights below. On: AD CC MG OW.
26. ↳↳ Изменять стоимость товаров — Change the cost of products. On: AD CC MG OW.
27. ↳↳ Изменять скидку на товары — Change the discount for products. On: AD CC MG OW.
28. Проводить оплату — Process the payment — take payment for a visit, with a «Период» for past days. On: AD OW.
29. ↳ Проводить оплату с личного счета клиента — Make a payment from the client's personal account. On: AD OW.
30. Редактирование расходников — Edit consumables — add and change consumables on a booking. On: AD CC MG OW.
31. Доступ к данным клиентов по сети — Client data access throughout a chain — visits, sales and loyalty figures across a chain. On: SM VW AD CC MG OW.

## 3. Финансы / Finance (38)
Sources: https://alteg.io/ru/support/knowledge-base/4847129943453/ and https://alteg.io/en/support/knowledge-base/4847129943453-finance-access-rights/

Group totals: SM 20/36, VW 9/36, SP 2/38, AD 6/38, CC 5/38, AC 28/38, MG 36/38, OW 36/38.

1. Кассы: Доступ ко всем кассам / только к выбранным — Cash registers: all / selected — limits Finance to chosen cash registers; does not limit where a visit payment goes. Default all, every role.
2. Просмотр движений средств — View the cash flow — opens financial operations and documents, with a «Период». On: all except SP.
3. ↳ Создание транзакций — Create transactions — «Новый платеж»; also needs the edit right. On: AD CC AC MG OW. Period for AD and CC is today only.
4. ↳ Редактирование транзакций — Edit transactions. On: AD CC AC MG OW, same period defaults.
5. ↳ Удаление транзакций — Delete transactions. On: AC MG OW.
6. ↳ Доступ к выгрузке движений средств в Excel — Export the cash flow to Excel — with the create right, also import. On: SM AC MG OW. An uncounted «Типы транзакций» selector (all / selected) sits here.
7. Доступ к счетам и кассам — Access to accounts and cash register — add and view cash registers, pay in, transfer between them. On: SM VW AC MG OW.
8. ↳ Доступ к балансу — Access to balance — see cash register balances. On: SM VW AC MG OW.
9. Доступ к контрагентам — Access to counterparties — view and pick counterparties. On: SM VW AC MG OW.
10. ↳ Доступ к созданию — Access to creation. On: AC MG OW.
11. ↳ Доступ к изменению — Access to editing. On: AC MG OW.
12. ↳ Доступ к удалению — Access to removal. On: AC MG OW.
13. ↳ Доступ к выгрузке в Excel — Access to download to Excel. On: SM AC MG OW.
14. Доступ к статье платежей — Access to the payment category — view payment categories. On: SM VW AC MG OW.
15. ↳ Доступ к созданию — Access to creation. On: AC MG OW.
16. ↳ Доступ к изменению — Access to editing. On: AC MG OW.
17. ↳ Доступ к удалению — Access to removal. On: AC MG OW.
18. Операции с ККМ — Operations with POS — list fiscal operations, open and close a shift. Altegio says the online cash register integration is currently unavailable. On: SM AC MG OW.
19. Настройки ККМ — POS settings — view. On: SM MG OW.
20. ↳ Доступ к изменению — Access to editing. On: MG OW.
21. Онлайн-платежи — Online payments — view connected cashless methods. On: SM MG OW.
22. ↳ Доступ к изменению — Access to editing — switch methods, change providers and details. On: MG OW.
23. Доступ к настройкам оплаты — Access to payment settings — view. On: SM MG OW.
24. ↳ Доступ к изменению — Access to editing — choose default cash registers for cashless payment. On: MG OW.
25. Доступ к схемам расчета заработной платы — Access to payroll calculation schemes — create and edit pay rules, bonuses, fines. On: SM AC MG OW.
26. Доступ к расчету заработной платы — Access to payroll calculation — with a «Период». On: SM AC MG OW.
27. ↳ Доступ к начислению заработной платы — Access to payroll — create accruals, with a «Период». On: AC MG OW.
28. Доступ к расчету заработной платы только конкретного сотрудника — Access to a specific team member payroll calculation — a barber sees only their own pay; this shows «Зарплата» in the mobile app. Settings: «Сотрудник», «Период». On: SP only.
29. ↳ Доступ к начислению заработной платы — Access to payroll — accrue for that one person. On: nobody.
30. Доступ к отчету за период — Access to the report for the period — financial report. On: SM VW AC MG OW.
31. ↳ Доступ к выгрузке в Excel отчета за период — Permission to export the report for the period to Excel. On: SM AC MG OW.
32. Доступ к годовому отчету — Access to the annual report — P&L. On: SM VW AC MG OW.
33. ↳ Доступ к выгрузке в Excel годового отчета — Permission to export the annual report to Excel. On: SM AC MG OW.
34. Доступ к печати чека — Access to receipt printing — fiscal receipts in a visit or stock operation. On: AD CC AC MG OW.
35. Доступ к отчету по кассе за день — Access to daily cashier report — «Период»: no limit or current day. On: SM VW AC MG OW.
36. ↳ Доступ к выгрузке в Excel — Access to download to Excel. On: SM AC MG OW.
37. Просмотр платёжных политик — View payment policies — open the payment policy page. On: AD MG OW. Source: https://alteg.io/ru/support/knowledge-base/360414/
38. Управление платёжными политиками — Manage payment policies — edit and save a policy. On: MG OW.

## 4. Товары / Products (39)
One help sentence calls the block «Склад». Sources: https://alteg.io/ru/support/knowledge-base/4847157544989/ and https://alteg.io/en/support/knowledge-base/4847157544989-inventory-access-rights/

Group totals: SM 17, VW 10, SP off, AD 26, CC 26, AC 39, MG 39, OW 39.

1. Склады: Доступ ко всем складам / только к выбранным — Storage locations: all / selected. Default all, every role except SP.
2. Просмотр себестоимости товаров/расходников — View the prime cost of products and consumables. On: all except SP.
3. Просмотр движений товаров — View product movements — root right for stock operations, with a «Период». On: all except SP.
4. ↳ Перемещение товаров между складами — Transfer products between inventories. On: AD CC AC MG OW.
5. ↳ Создание товарных транзакций — Create product transactions — write-offs, with a «Период». On: AD CC AC MG OW.
6. ↳↳ Оформление прихода товаров — Record product receipts — create receipts. On: AD CC AC MG OW.
7. ↳↳ Оформление продаж товаров — Record product sales — create sales. On: AD CC AC MG OW.
8. ↳ Редактирование товарных транзакций — Edit transactions for products — edit write-offs, with a «Период». On: AD CC AC MG OW.
9. ↳↳ Оформление прихода товаров — Record product receipts — edit receipts. On: AD CC AC MG OW.
10. ↳↳ Оформление продаж товаров — Record product sales — edit sales. On: AD CC AC MG OW.
11. ↳ Удаление товарных транзакций — Delete transactions for products. On: AC MG OW.
12. ↳ Доступ к выгрузке движений товаров в Excel — Permission to download product movements to Excel. On: SM AC MG OW. An uncounted «Типы транзакций» selector sits here.
13. ↳ Доступ к инвентаризации — Access to inventory control — view stocktakes. On: all except SP.
14. ↳↳ Доступ к созданию и редактированию инвентаризации — Access to create and edit inventory. On: AD CC AC MG OW.
15. ↳↳ Доступ к удалению инвентаризации — Access to delete inventory. On: AC MG OW.
16. ↳↳ Доступ к выгрузке инвентаризации в Excel — Permission to download stocktakes to Excel. On: SM AD CC AC MG OW.
17. ↳ Доступ к отчету остатков на складе — Access to the stock on hand report. On: SM VW AC MG OW.
18. ↳↳ Доступ к выгрузке остатков в Excel — Permission to download stock on hand to Excel. On: SM AC MG OW.
19. ↳ Доступ к отчету по продажам — Access to the sales report. On: SM VW AC MG OW.
20. ↳↳ Доступ к выгрузке отчета по продажам в Excel — Permission to download the sales report to Excel. On: SM AC MG OW.
21. ↳ Доступ к отчету по списанию расходников — Access to the consumables write-off report. On: SM VW AC MG OW.
22. ↳↳ Доступ к выгрузке отчета по списанию расходников в Excel — download it to Excel. On: SM AC MG OW.
23. ↳ Доступ к отчету по списанию товаров — Access to the product write-offs report. On: SM VW AC MG OW.
24. ↳↳ Доступ к выгрузке отчета по списанию товаров в Excel — download it to Excel. On: SM AC MG OW.
25. ↳ Доступ к отчету по оборачиваемости — Access to turnover report. On: SM VW AC MG OW.
26. ↳↳ Доступ к выгрузке отчета по оборачиваемости в Excel — download it to Excel. On: SM AC MG OW.
27. ↳ Доступ к управлению товарами — Access to product management — view «Все товары». On: all except SP.
28. ↳↳ Доступ к созданию товаров — Access to creating products. On: AD CC AC MG OW.
29. ↳↳ Доступ к изменению товаров — Access to editing products — limited by the eight field rights below. On: AD CC AC MG OW.
30. Название, Артикул, Штрихкод — Name, SKU, Barcode. On: AD CC AC MG OW.
31. Категория — Category. On: AD CC AC MG OW.
32. Цена продажи — Price. On: AD CC AC MG OW.
33. Себестоимость — Prime cost. On: AD CC AC MG OW.
34. Единицы измерения — Units. On: AD CC AC MG OW.
35. Критичный остаток, Желаемый остаток — Critical stock level, Desired stock level. On: AD CC AC MG OW.
36. Масса — Weight. On: AD CC AC MG OW.
37. Комментарий — Comment. On: AD CC AC MG OW.
38. ↳↳ Доступ к архивации и восстановлению товаров — Access to archiving and restoring products. On: AD CC AC MG OW.
39. ↳↳ Доступ к удалению товаров — Access to deleting products — cannot be undone. On: AD CC AC MG OW.

## 5. Сотрудники / Team (8)
Source: https://alteg.io/ru/support/knowledge-base/323440/ (EN at https://alteg.io/en/support/knowledge-base/323440/)

Group totals: SM 7, MG 8, OW 8, others off. The group switch is «Доступ к разделу Сотрудники»: a read-only staff list.

1. Создание сотрудников — Create team members — add a person with name and position. On: SM MG OW.
2. Редактирование сотрудников — Edit team members — most staff settings; not their services, access or pay schemes. On: SM MG OW.
3. Удаление сотрудников — Delete team members — removes the person and their data. On: SM MG OW.
4. Увольнение сотрудников — Dismiss team members — keeps their statistics. On: SM MG OW.
5. Доступ к разделу Должности — Access to Positions section. On: SM MG OW.
6. ↳ Создание должностей — Create positions. On: SM MG OW.
7. ↳ Удаление должностей — Remove positions — only when no one holds the position. On: SM MG OW.
8. Редактирование графика работы — Edit work schedule — edit in «График работы» and the staff card; does not by itself show the schedule. On: MG OW.

## 6. Услуги / Services (12)
Source: https://alteg.io/ru/support/knowledge-base/323530/

Group totals: SM 0/12 (group on, view only), MG 12, OW 12, others off. The group switch is «Доступ к разделу Услуги»: view and Excel export. All 12 rights are on for MG and OW only.

1. Создание услуг — Create services — also needs the edit right.
2. Редактирование услуг — Edit services — edit and delete categories; service type, capacity, receipt name, repeat-visit reminders, translations, order.
3. ↳ Название услуги и Название для онлайн-записи — The name of service and Name for online booking.
4. ↳ Категория услуги — Service category — move a service to another category.
5. ↳ Цена услуги — Service price — base price, per-staff prices, tax and VAT.
6. ↳ Загрузка и изменение изображений — Uploading and changing images — also needs the widget right.
7. ↳ Отображение услуги в виджете — Displaying the service in the booking widget — the «Онлайн-запись» tab of a service.
8. ↳ Онлайн-оплата услуги — Online payment for the service.
9. ↳ Ресурсы услуги — Service resources — attach and detach resources.
10. Изменять услуги сотрудников и их длительность — Change team members' services and their duration.
11. Изменять технологические карты — Modify bills of materials.
12. Удаление услуг — Delete services.

## 7. Уведомления / Notifications (2)
Source: https://alteg.io/ru/support/knowledge-base/323629/

Group totals: SM 2, MG 2, OW 2, others off.

1. Доступ к разделу SMS-уведомления — Access to the SMS Notifications section — old interface only. On: SM MG OW.
2. Доступ к разделу Email-уведомления — Access to the Email Notifications section — old interface only. On: SM MG OW.

The help article describes a third right that the PDF does not list: «Доступ к разделу Типы уведомлений» — Access to the "Notification types" section — channels, scenarios, templates, sending parameters.

## 8. Настройки / Settings (10)
Source: https://alteg.io/ru/support/knowledge-base/4847114440093/

Group totals: SM 6, AD 0/10, CC 0/10, MG 8, OW 10, others off. The help article says «сотрудники с доступом» where the PDF says «пользователи».

1. Доступ к системным настройкам — Access to system settings — general settings of the location. On: SM MG OW.
2. Доступ к настройкам локации — Access to location settings — contacts, description, photos, legal details. On: SM MG OW.
3. Управлять пользователями — Manage users — root right for managing other people's access. On: SM MG OW.
4. ↳ Удалять пользователей — Remove users — removes access to the location, not the person's account. On: SM MG OW.
5. ↳ Приглашение пользователей к управлению локацией — Invite users to manage a location. On: SM MG OW.
6. ↳ Настройка уведомлений пользователя — Configure user notifications. On: MG OW.
7. ↳ Управлять правами пользователей — Manage user rights. On: SM MG OW. Uncounted scope setting: «Управлять всеми правами» (SM, OW) or «Управлять правами в рамках своего набора прав» (MG), where a person can hand out only rights they hold.
8. Изменение настроек WebHook — Change Webhook settings — the developer settings. On: OW.
9. Изменение настроек получения платёжных документов — Change settings for receiving payment documents. On: OW.
10. Настройка списка категорий клиентов — Set up the list of client categories — also booking and event categories. On: MG OW.

## 9. Клиентская база / All clients (26)
Sources: https://alteg.io/ru/support/knowledge-base/4847183574045/ and https://alteg.io/en/support/knowledge-base/4847183574045-client-database-access-rights/

Group totals: SM 10, VW 10, AD 18, CC 18, MG 24, OW 26, SP and AC off.

1. Показывать номера телефонов и email в списке клиентов — Show phone numbers and email in client list. On: AD CC MG OW.
2. Показывать номер телефона и email в карточке клиента — Show the phone number and email in the client's card. On: AD CC MG OW.
3. Просмотр фамилии и отчества клиента — View client last name and middle name — otherwise «Эльвира А.»; applies everywhere. On: SM VW AD CC MG OW.
4. ↳ Редактирование фамилии и отчества клиента — Edit client last name and middle name. On: AD CC MG OW.
5. Редактировать данные клиента в карточке клиента — Edit client data in client's card — everything except comment and note. On: AD CC MG OW.
6. Просматривать список лояльности клиента — View client loyalty list — the «Лояльность» tab. On: SM VW AD CC MG OW.
7. Просматривать примечание — View client card comment. On: SM VW AD CC MG OW.
8. ↳ Редактировать примечание — Edit client card comment. On: AD CC MG OW.
9. Удалять клиентов — Delete clients. On: OW.
10. Выгружать список клиентов — Export the client list — to Excel. On: OW.
11. Просматривать комментарии — View comments. On: SM VW AD CC MG OW.
12. Добавлять комментарии — Add comments. On: AD CC MG OW.
13. Удалять свои комментарии — Delete your own comments. On: MG OW.
14. Удалять чужие комментарии — Delete others' comments. On: MG OW.
15. Просматривать и скачивать файлы — View and download files. On: SM VW MG OW.
16. ↳ Загружать файлы — Upload files. On: MG OW.
17. ↳ Удалять файлы — Delete files. On: MG OW.
18. Просмотр дополнительных полей клиента — View client custom fields. On: SM VW AD CC MG OW.
19. ↳ Изменять дополнительные поля клиента — Edit client custom fields. On: AD CC MG OW.
20. Показывать клиентов — Show the clients — all clients, or only those who visited chosen staff. Default «Всех сотрудников» for SM VW AD CC MG OW.
21. Просмотр истории посещений клиента — View client visit history. On: SM VW AD CC MG OW.
22. Счета — Accounts — view a client's personal accounts. On: SM VW AD CC MG OW.
23. ↳ Открыть счет — Open an account. On: AD CC MG OW.
24. ↳ Пополнить счет — Replenish account — also needs a payment or transaction right. On: AD CC MG OW.
25. ↳ Просмотр истории операций по счетам — View account transaction history. On: SM VW AD CC MG OW.
26. Настройка программ лояльности — Set up loyalty programs — at location level. On: MG OW.

## 10. Отчёты / Reports (25)
The help text also calls the block «Раздел «Обзор»». Sources: https://alteg.io/ru/support/knowledge-base/4847195067677/ and https://alteg.io/en/support/knowledge-base/4847195067677-overview-access-rights/

Group totals: SM 24, VW 21, AD 6, MG 25, OW 25, SP CC AC off.

1. Основные показатели — Main dashboard. On: SM VW MG OW.
2. Просматривать список записей — View the list of bookings — reports «Записи» and «События», with a «Период». On: SM VW AD MG OW.
3. ↳ Выгружать список записей в Excel — Export the list of bookings to Excel. On: SM AD MG OW.
4. ↳ Показывать номера телефонов в записях — Show phone numbers in bookings. On: SM VW AD MG OW.
5. События — Events — label only, no description found. On: SM VW AD MG OW.
6. Визиты — Visits — label only, no description found. On: SM VW AD MG OW.
7. ↳ Показывать номера телефонов в сводке — Show phone numbers in the summary. On: SM VW AD MG OW.
8. Анализ возвращаемости — Return rate. On: SM VW MG OW.
9. Загруженность сотрудников — Team members workload. On: SM VW MG OW.
10. Аналитика администраторов — Receptionist analytics. On: SM VW MG OW.
11. Продажи по сотрудникам — Sales by team members. On: SM VW MG OW.
12. Динамика продаж по сотрудникам — Sales by team member over time. On: SM VW MG OW.
13. Продажи по услугам — Sales by services. On: SM VW MG OW.
14. Продажи по клиентам — Sales by clients. On: SM VW MG OW.
15. Акции — Promotions. On: SM VW MG OW.
16. Просматривать отзывы — View reviews. On: SM VW MG OW.
17. ↳ Удалять отзывы — Delete reviews. On: MG OW.
18. Просматривать детализацию сообщений — View the details of messages — history of all messages sent to clients and staff. On: SM VW MG OW.
19. ↳ Выгрузка детализации сообщений в Excel — Export the details of messages to Excel. On: SM MG OW.
20. ↳ Показывать номера телефонов в сообщениях — Show phone numbers in messages. On: SM VW MG OW.
21. Раздел «Звонки» — Calls. On: SM VW MG OW.
22. ↳ Доступ к выгрузке звонков Excel — Export calls to Excel. On: SM MG OW.
23. ↳ Показывать номера телефонов клиентов — Show phone numbers in calls. On: SM VW MG OW.
24. Экспорт данных — Data exports — the log of who downloaded which Excel export and when. On: SM VW MG OW. Source: https://alteg.io/en/support/knowledge-base/4904523614877/
25. Журнал изменений данных — Data changes — the log of adds, edits and deletes of bookings, financial and stock operations, with author. On: SM VW MG OW. Source: https://alteg.io/en/support/knowledge-base/4904571763229/

## 11. Лояльность / Loyalty (8)
Source: https://alteg.io/ru/support/knowledge-base/4847118897693/

Group totals: SM 1, VW 1, AD 4, CC 4, MG 8, OW 8, SP and AC off. These rights only use loyalty that is already set up, in the client card and the booking window.

1. Выдача и удаление карт лояльности клиента — Issuance and removal of client loyalty cards. On: AD CC MG OW.
2. Ручное пополнение/списание с карт лояльности — Manual credit/debit of loyalty cards. On: AD CC MG OW.
3. Редактирование баланса абонементов — Membership balance editing. On: MG OW.
4. Редактирование срока действия абонементов — Membership validity editing. On: MG OW.
5. Просмотр истории абонементов — View membership history. On: SM VW AD CC MG OW.
6. Редактирование баланса сертификатов — Editing the balance of gift cards. On: MG OW.
7. Редактирование срока действия сертификатов — Editing the expiration date of gift cards. On: MG OW.
8. Оплата сертификатом и абонементом без кода — Purchase with gift card and membership without code — apply a card already on the client without typing its code. On: AD CC MG OW.

## 12. Лицензия / Billing (1)
Source: https://alteg.io/ru/support/knowledge-base/4847265161245/

1. Доступ к разделу Счета — Access to the Billing section — the licence, balance history and payments to Altegio. On: SM AC OW. Manager has the group on with 0 of 1.

## 13. Онлайн-запись / Online booking (1)
Source: https://alteg.io/ru/support/knowledge-base/4847118897693/

The group switch gives almost all online-booking settings.

1. Управление обработкой персональных данных — Manage processing of personal data — edit the consent text, its language, and whether it shows in online booking. On: MG OW. SM has the group on with 0 of 1.

## Single rights (4)
Source: https://alteg.io/ru/support/knowledge-base/4847265161245/

1. Разрешить доступ к локации только с IP-адресов (v4, v6) — Allow access to the location only from IP addresses (v4, v6) — a restriction, not a grant; a field for allowed addresses or partial addresses appears. Off for every role.
2. Ресурсы — Resources — no description found. On: SM VW MG OW.
3. Совершать SMS рассылки клиентам — Send bulk SMS to clients — covers all SMS types, since SMS is paid by the company. On: MG OW.
4. Добавление локации в сети — Add locations to the chain. On: MG OW.

## How roles work
Sources: https://alteg.io/ru/support/knowledge-base/19029472943261/ and https://alteg.io/en/support/knowledge-base/19029472943261-user-roles/

- **Presets, edited per person.** There are 8 fixed role templates. Picking one fills in the defaults above, and any right can then be changed for that person before Save. Rights are stored per person; no page describes creating a custom role or editing a template for everyone.
- **Bulk switches.** Each group has a toggle for the whole group. A three-dot menu on the «Права доступа» field and on each group grants or removes all rights.
- **Copying.** «Скопировать права» on the Access tab copies another staff member's rights, at invitation or later.
- **Transfer.** «Перенести доступ на другого сотрудника» moves login and rights to another staff card, with an option to delete the source.
- **Licence.** A person is paid if they have a schedule or any edit right. The two free roles are «Только просмотр» and «Менеджер системы».
- **Rights change history.** Altegio's help does not document one. Its «Журнал изменений данных» report covers bookings, finance and stock only.
- **YCLIENTS only:**
  - A «История изменений» tab on a person's access page shows time, type, author, and rights before and after: https://support.yclients.com/5-9-744--nastrojka-dostupa-k-servisu/
  - Six roles, without the two free ones; each has "recommended" rights on and "additional" rights available; returning to a previous role restores its settings: https://support.yclients.com/5-9-282--roli-sotrudnikov-i-nastrojka-prav-dostupa/
  - Access can be copied to other branches.
  - Two blocks that Altegio's PDF does not have: «Чаевые» (with «Настройка чаевых») and «Аналитика» (with «Создание, редактирование и выгрузка отчетов в конструкторе отчетов»): https://support.yclients.com/5-9-10-310--prava-dostupa-k-licenzii-chaevym-analitike-i-otpravke-sms/

## Not found
- Which two «Окно записи» rights are missing on the live account (29 against 31).
- Why the two free roles show smaller totals (27 instead of 31, 36 instead of 38), and which rights they lack.
- Descriptions for «Ресурсы», «События» and «Визиты»; the PDF gives labels only.
- A rights change history in Altegio itself.
- Custom roles or editable role templates.
- Whether «Доступ к разделу Типы уведомлений» is still on the screen; the help article has it, the PDF does not.
- An "Analytics" right: the calendar article says day statistics need "access to Analytics", but the PDF has no such right.
- The chain-level rights (chain interface, Settings > Users). I did not collect them; the article is https://alteg.io/ru/support/knowledge-base/4905456904861/
- A PDF for YCLIENTS' own role defaults; I did not look further once Altegio's was found.

## Ours

*Built 19.11.2026. Every right above is a row of `src/lib/auth/rights-catalogue.ts` (key, group, parent, RU / ET / EN, the eight roles' defaults, `built`). A login's set is in `users.rights_preset`, `rights`, `rights_values` (`docs/data-model.md`, «Access rights»). One function answers every question: `can(user, right, scope?)` in `src/lib/auth/rights.ts`. The screen is «Доступ» → the login → «Права» (`src/app/admin/(app)/account/[id]/`).*

**Enforced** means our system has the function and the server asks the right before it does it. **Locked** means we have no such function: the switch is shown grey with «нет в системе», keeps the role's default, and `can()` answers no until `built` is set and a check is wired.

| Group | Rights | Enforced | Locked |
|---|---|---|---|
| 1. Журнал записей | 8 | 6 | 2 |
| 2. Окно записи | 31 | 15 | 16 |
| 3. Финансы | 38 | 0 | 38 |
| 4. Товары | 39 | 0 | 39 |
| 5. Сотрудники | 8 | 4 | 4 |
| 6. Услуги | 12 | 7 | 5 |
| 7. Уведомления | 2 | 0 | 2 |
| 8. Настройки | 10 | 6 | 4 |
| 9. Клиентская база | 26 | 16 | 10 |
| 10. Отчёты | 25 | 3 | 22 |
| 11. Лояльность | 8 | 0 | 8 |
| 12. Лицензия | 1 | 0 | 1 |
| 13. Онлайн-запись | 1 | 0 | 1 |
| Single rights | 4 | 1 | 3 |
| **Total** | **213** | **58** | **155** |

A group's switch works in the seven groups that have an enforced right: with it off, everything inside answers no, and for «Сотрудники», «Услуги» and «Клиентская база» the section itself is closed (its page says «Нет доступа», the menus leave it out). «Сотрудники» is two pages now, the barbers' list and «График работы»; with «Отчёты» off, or without «Просматривать список записей», «Записи» is closed the same way.

*«Отчёты», 19.11.2026:* its first three rights came alive with the page «Записи» (`/admin/records`). They were locked until then, so every login had kept its role's default for them: the owner and the front desk have all three from the start (the list gives «Администратор» the file too, unlike the client base's), a barber's login none.

### Each enforced right, and the file that asks

Paths are under `src/`. «→» names the function.

| Right | Key | Asked in |
|---|---|---|
| **1. Журнал записей** | | |
| Просматривать расписание и записи сотрудников (all, or chosen barbers) | `journal.staff` | `lib/admin/calendar.ts` → `calendarFor` (the columns shown); `lib/admin/visits.ts` → every change, for the visit's column; `app/admin/(app)/actions.ts` → `addBlock`; `app/admin/(app)/frame-actions.ts` → the sale's barber; `lib/barber/day.ts` → `barberDaysFor`; `lib/auth/current.ts` → `requireStaff`, `app/b/(app)/pick/page.tsx` and `app/b/(app)/actions.ts` → `viewAs` (whose column an admin may open); `app/admin/(app)/page.tsx` (a login that sees no column gets «Нет доступа»); `lib/admin/schedule.ts` → `loadSchedule` (the grid's rows) and `mayChange` (every barber a cell, a template or a copy names, the one copied from too); `lib/admin/records.ts` → `scopeSql` (the list, its count, its file, «Отменить выбранные», the pencil) |
| Ограничить доступ к истории расписания и записей (no limit, or days back) | `journal.history` | `lib/admin/calendar.ts` → `calendarFor`, `clampDay`; `lib/barber/day.ts` → `barberDaysFor`; `lib/admin/records.ts` → `scopeSql` |
| Изменять график работы и время для записи сотрудника в журнале | `journal.schedule` | `app/admin/(app)/actions.ts` → `addBlock`, `deleteBlock`; `lib/barber/requests.ts` → `whoOf` (a barber's own break, day off, special time, weekly hours: at once with it, a request without) and `answerRequest` |
| Показывать номера телефонов | `journal.phones` | `lib/admin/calendar.ts` → `calendarFor`; `lib/barber/day.ts` → `barberDaysFor` (masked without it) |
| Перенос записи | `journal.move` | `lib/admin/visits.ts` → `adminUpdateVisit` (a move needs this or «Изменять сотрудника и время записи») |
| Показывать статистику | `journal.stats` | `app/admin/(app)/page.tsx` (the day's numbers); `lib/barber/day.ts` → `barberDaysFor` (the day's sum); `app/b/(app)/week/page.tsx` |
| **2. Окно записи** | | |
| Доступ к данным клиентов | `visit.client_data` | `lib/admin/calendar.ts` → `calendarFor`; `lib/barber/day.ts` → `barberDaysFor`; `lib/barber/clients.ts` → `clientCard` |
| Доступ к созданию новых клиентов в записи | `visit.client_create` | `lib/admin/visits.ts` → `adminCreateVisit` |
| Доступ к выпадающему списку с данными о клиентах | `visit.client_list` | `lib/admin/calendar.ts` → `searchClients`; `lib/barber/book.ts` → `searchMyClients` |
| ↳ Показывать номера телефонов | `visit.client_list.phones` | the same two (masked, and digits find nobody) |
| Создавать записи | `visit.create` | `lib/admin/visits.ts` → `adminCreateVisit` |
| Изменять записи (period: no limit, or today on) | `visit.edit` | `lib/admin/visits.ts` → `adminUpdateVisit`, `adminSetStatus` |
| ↳ Изменять записи со статусом визита «Клиент пришел» (our «пришёл» and «готово») | `visit.edit.arrived` | `lib/admin/visits.ts` → `adminUpdateVisit`, `adminSetStatus`; `lib/barber/clients.ts` → `setVisitNote` |
| ↳ Изменять сотрудника и время записи | `visit.edit.staff_time` | `lib/admin/visits.ts` → `adminUpdateVisit` |
| ↳ Изменять комментарий | `visit.edit.comment` | `lib/admin/visits.ts` → `adminUpdateVisit`; `lib/barber/clients.ts` → `setVisitNote` |
| ↳ Изменять состав услуг | `visit.edit.services` | `lib/admin/visits.ts` → `adminUpdateVisit` |
| Удалять записи (ours: cancel; a visit is never deleted) | `visit.delete` | `lib/admin/visits.ts` → `adminCancelVisit` (the calendar's sheet, and each visit of «Записи» → «Отменить выбранные») |
| ↳ Удаление записей со статусом «Клиент пришел» | `visit.delete.arrived` | `lib/admin/visits.ts` → `adminCancelVisit` |
| Проводить продажу товаров | `visit.sell` | `app/b/(app)/sell/actions.ts` → `searchAction`, `barcodeAction`, `photoAction`; `app/b/(app)/sell/page.tsx` |
| ↳ Создание товарных транзакций (period: a sale dated before today) | `visit.sell.create` | `app/admin/(app)/frame-actions.ts` → `sellAction`; `app/b/(app)/sell/actions.ts` → `sellAction` |
| ↳ Редактирование товарных транзакций (period: a sale made before today) | `visit.sell.edit` | `app/b/(app)/sell/actions.ts` → `undoAction`; `app/admin/(app)/invoices/actions.ts` → `reverseSaleAction`, `retrySaleAction` |
| **5. Сотрудники** | | |
| Создание сотрудников | `staff.create` | `lib/admin/staff.ts` → `saveStaffProfile` |
| Редактирование сотрудников | `staff.edit` | `lib/admin/staff.ts` → `saveStaffProfile`; `app/admin/(app)/staff/actions.ts` → `uploadPhoto` |
| Увольнение сотрудников (ours: the barber's «active» switch) | `staff.dismiss` | `lib/admin/staff.ts` → `saveStaffProfile` |
| Редактирование графика работы | `staff.schedule` | `app/admin/(app)/staff/actions.ts` → `saveHours`, `saveDay`, `addOff`, `removeOff`, `addSpecial`, `removeSpecial`; `lib/admin/schedule.ts` → `saveDays`, `fillTemplate`, `copySchedule` («График работы»: the marked cells, a template, a copy) |
| **6. Услуги** | | |
| Создание услуг (with «Редактирование услуг») | `services.create` | `lib/admin/services.ts` → `saveService` |
| Редактирование услуг | `services.edit` | `lib/admin/services.ts` → `saveService` |
| ↳ Название услуги и Название для онлайн-записи | `services.edit.name` | the same, when the name changes |
| ↳ Цена услуги | `services.edit.price` | the same, when the price changes |
| ↳ Отображение услуги в виджете | `services.edit.online` | the same, when «online» changes |
| Изменять услуги сотрудников и их длительность | `services.staff` | `app/admin/(app)/staff/actions.ts` → `saveOffers`; `lib/barber/requests.ts` → `whoOf` (a barber's own price and time: at once with it, a request without) and `answerRequest` |
| Удаление услуг (ours: switching a service off) | `services.delete` | `lib/admin/services.ts` → `saveService` |
| **8. Настройки** | | |
| Доступ к системным настройкам | `settings.system` | `app/admin/(app)/requests/actions.ts` → `setReminder` |
| Управлять пользователями | `settings.users` | `app/admin/(app)/account/page.tsx` (the logins); `account/actions.ts` → `linkUserStaff` |
| ↳ Удалять пользователей (ours: switch a login off or on) | `settings.users.remove` | `account/actions.ts` → `toggleUser` |
| ↳ Приглашение пользователей к управлению локацией | `settings.users.invite` | `account/actions.ts` → `addUser`; `lib/auth/rights-store.ts` → `mayAddLogin` |
| ↳ Управлять правами пользователей | `settings.users.rights` | `account/[id]/page.tsx`; `account/actions.ts` → `saveRightsAction`, `copyRightsAction`; `lib/auth/rights-store.ts` → `saveRights` |
| Настройка списка категорий клиентов (ours: a category word nobody has yet) | `settings.categories` | `lib/admin/clients.ts` → `saveClient`; `lib/admin/client-bulk.ts` → `bulkAddLabel` |
| **9. Клиентская база** | | |
| Показывать номера телефонов и email в списке клиентов | `clients.list_contacts` | `lib/admin/clients.ts` → `listClients`, `clientWhere` (the search); `lib/admin/client-export.ts` (the file's columns) |
| Показывать номер телефона и email в карточке клиента | `clients.card_contacts` | `lib/admin/clients.ts` → `clientDetail`, `saveClient`; `lib/barber/clients.ts` → `clientCard` |
| Редактировать данные клиента в карточке клиента | `clients.edit` | `lib/admin/clients.ts` → `saveClient`; `app/admin/(app)/clients/actions.ts` → the photo; `lib/admin/client-bulk.ts` → `bulkAddLabel` |
| Просматривать примечание | `clients.note` | `lib/admin/clients.ts` → `clientDetail`; `lib/admin/calendar.ts` → `calendarFor`; `lib/barber/day.ts` → `barberDaysFor`; `lib/barber/clients.ts` → `clientCard` |
| ↳ Редактировать примечание | `clients.note.edit` | `lib/admin/clients.ts` → `saveClient`; `lib/barber/clients.ts` → `setClientNote` |
| Удалять клиентов | `clients.delete` | `lib/admin/clients.ts` → `deleteClient`; `lib/admin/client-bulk.ts` → `bulkDelete` (many at once: also an owner's login, as before) |
| Выгружать список клиентов | `clients.export` | `lib/admin/client-export.ts` → `exportClients` |
| Просматривать комментарии | `clients.comments` | `lib/admin/client-card.ts` → `listComments` |
| Добавлять комментарии | `clients.comments_add` | `app/admin/(app)/clients/actions.ts` → `addCommentAction` |
| Удалять свои комментарии | `clients.comments_delete_own` | `lib/admin/client-card.ts` → `deleteComment` |
| Удалять чужие комментарии | `clients.comments_delete_others` | `lib/admin/client-card.ts` → `deleteComment` |
| Просматривать и скачивать файлы | `clients.files` | `lib/admin/client-card.ts` → `listFiles`; `app/admin/(app)/clients/[id]/files/[fileId]/route.ts` |
| ↳ Загружать файлы | `clients.files.upload` | `app/admin/(app)/clients/[id]/files/route.ts` |
| ↳ Удалять файлы | `clients.files.delete` | `app/admin/(app)/clients/actions.ts` → `deleteFileAction` |
| Показывать клиентов (all, or those of chosen barbers) | `clients.show` | `lib/admin/client-scope.ts` → `clientSeen`, `seenClientsSql`, used by the list, the card, the export, the bulk actions, the calendar's client search and a new visit; `lib/barber/book.ts` → `columnClientsSeen`; `lib/admin/records.ts` → `scopeSql` («Записи» has only the visits of clients the login is shown) |
| Просмотр истории посещений клиента | `clients.history` | `lib/admin/clients.ts` → `clientDetail`; `app/admin/(app)/clients/actions.ts` → `clientStatsAction`; `lib/barber/clients.ts` → `clientCard` |
| **10. Отчёты** | | |
| Просматривать список записей (ours: the page «Записи»; no «Период», and «События» is not built) | `reports.bookings` | `lib/admin/records.ts` → `listRecords`, `exportRecords`, `cancelRecords`, `visitForSheet`; `app/admin/(app)/records/page.tsx` («Нет доступа» without it); `app/admin/(app)/layout.tsx` and `more/page.tsx` (the menus) |
| ↳ Выгружать список записей в Excel | `reports.bookings.export` | `lib/admin/records.ts` → `exportRecords` (the route `app/admin/(app)/records/export/route.ts`; each export is an audit row) |
| ↳ Показывать номера телефонов в записях | `reports.bookings.phones` | `lib/admin/records.ts` → `listRecords` (masked without it), `recordWhere` (digits then find nobody), `exportRecords` (no phone column) |
| Просматривать отзывы (ours: the page «Отзывы»; the phone of a linked client only with `clients.list_contacts`) | `reports.reviews` | `lib/reviews.ts` → `listReviews`, `reviewsMay`; `app/admin/(app)/reviews/page.tsx` («Нет доступа» without it); `lib/admin/app-nav.ts` (the menus) |
| ↳ Удалять отзывы (ours: «Скрыть» takes a review off the booking page and keeps it listed; «Показать» puts it back) | `reports.reviews.delete` | `lib/reviews.ts` → `setReviewHidden` (each change an audit row); `app/admin/(app)/reviews/actions.ts` → `setReviewHiddenAction` |
| **Single** | | |
| Совершать SMS рассылки клиентам (ours: a mass message by any channel, and a message by hand) | `single.bulk_sms` | `lib/admin/client-bulk.ts` → `queueMassMessage`; `app/admin/(app)/clients/actions.ts` → `massPreviewAction`, `sendMessageAction` |

### What is ours and not the list's

- **The day this shipped nothing changed.** Each login's first set is its old role written down (`legacyRights` in `src/lib/auth/rights-store.ts`): an owner «Владелец» as it is; the front desk everything but the logins, the export, the reminder switch; a barber what his app let him do in his own column. The salon's two switches for barbers (`barber_self_time`, `barber_self_price`) became two rights of each barber's login («Изменять график работы…» and «Изменять услуги сотрудников…») and are read by that backfill alone.
- **The role is the side of the app:** «Владелец» → owner, «Специалист» → the barber app (the login must be a barber), the other six → the salon's side. `users.role` follows the preset on save.
- **«Клиент пришел» is two of our statuses,** «пришёл» and «готово».
- **A period** has two values where it works here: no limit, or «today» (nothing dated before today).
- **Hand-out limits:** a login that is not an owner hands out only the working rights it holds itself and values no wider than its own; never changes an owner's login or makes an owner. Nobody removes his own right to manage rights. The last owner stays an owner.
- **Deleting many clients at once** needs «Удалять клиентов» and an owner's login: before the rights the front desk could delete one client from his card but not many, and that is kept.
- **Not rights at all, still by the side of the app:** «Счета» and its company settings (the owner's), the test-run reports (the owner's), a login's own password, language, starred pages, table columns and notifications, and «Мои расчёты» in the barber app.
- **Locked although the brief named them:** «Изменять стоимость услуг» and «Изменять длительность» (a visit's price and length are the sum of its services; nothing sets them by hand), «Удаление сотрудников» (a barber is switched off, never deleted), and «Просмотр фамилии и отчества клиента» (a client has one name field).
