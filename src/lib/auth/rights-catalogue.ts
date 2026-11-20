/**
 * Every access right, as data (the owner, 19.11.2026: «add all switches»).
 * The list is the one in docs/altegio-rights.md: 209 rights in 13 groups and
 * 4 single rights, each with its place in the tree, its words in three
 * languages and the roles that have it on by default.
 *
 *   key     stable; code asks for a right by it (src/lib/auth/rights.ts)
 *   parent  a nested right: it is off while its parent is off
 *   on      the role presets that start with it switched on
 *   built   true: our system has the function, so the switch works;
 *           false: shown, locked («нет в системе»), and comes alive when
 *           the function is built: flip the flag and wire a check.
 *
 * RU and EN are the published words of the list we follow; ET is ours,
 * plain. Nothing here knows about logins or the database.
 */

/** The eight role presets, in the list's own order. */
export const ROLE_CODES = ["SM", "VW", "SP", "AD", "CC", "AC", "MG", "OW"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];
export const isRoleCode = (v: unknown): v is RoleCode => typeof v === "string" && (ROLE_CODES as readonly string[]).includes(v);

export type Words = { ru: string; et: string; en: string };

/**
 * A preset's name, and the side of the app it opens (users.role, the coarse
 * gate): «Владелец» the owner's, «Специалист» the barber app, the other six
 * the salon's side.
 */
export const PRESETS: Record<RoleCode, Words & { role: "owner" | "admin" | "staff" }> = {
  SM: { ru: "Менеджер системы", et: "Süsteemihaldur", en: "System manager", role: "admin" },
  VW: { ru: "Только просмотр", et: "Ainult vaatamine", en: "Viewer", role: "admin" },
  SP: { ru: "Специалист", et: "Spetsialist", en: "Professional", role: "staff" },
  AD: { ru: "Администратор", et: "Administraator", en: "Receptionist", role: "admin" },
  CC: { ru: "Колл-центр", et: "Kõnekeskus", en: "Call center", role: "admin" },
  AC: { ru: "Бухгалтер", et: "Raamatupidaja", en: "Accountant", role: "admin" },
  MG: { ru: "Менеджер", et: "Juhataja", en: "Manager", role: "admin" },
  OW: { ru: "Владелец", et: "Omanik", en: "Owner", role: "owner" },
};

/** The 13 groups in the list's order, then the single rights (which have no group switch). */
export const GROUP_KEYS = ["journal", "visit", "finance", "goods", "staff", "services", "notify", "settings", "clients", "reports", "loyalty", "licence", "online", "single"] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

const ALL = "SM VW SP AD CC AC MG OW";

/**
 * A group: its words, how many rights the list gives it, the presets whose
 * group switch is on, and whether the switch does anything here (`built`:
 * at least one right inside it works).
 */
export const GROUPS: Record<GroupKey, Words & { size: number; on: string; built: boolean }> = {
  journal: { ru: "Журнал записей", et: "Broneeringute kalender", en: "Appointment Calendar", size: 8, on: "SM VW SP AD CC MG OW", built: true },
  visit: { ru: "Окно записи", et: "Broneeringu aken", en: "Appointment window", size: 31, on: "SM VW SP AD CC MG OW", built: true },
  finance: { ru: "Финансы", et: "Rahandus", en: "Finance", size: 38, on: ALL, built: false },
  goods: { ru: "Товары", et: "Tooted", en: "Products", size: 39, on: "SM VW AD CC AC MG OW", built: false },
  staff: { ru: "Сотрудники", et: "Töötajad", en: "Team", size: 8, on: "SM MG OW", built: true },
  services: { ru: "Услуги", et: "Teenused", en: "Services", size: 12, on: "SM MG OW", built: true },
  notify: { ru: "Уведомления", et: "Teavitused", en: "Notifications", size: 2, on: "SM MG OW", built: false },
  settings: { ru: "Настройки", et: "Seaded", en: "Settings", size: 10, on: "SM AD CC MG OW", built: true },
  clients: { ru: "Клиентская база", et: "Kliendibaas", en: "All clients", size: 26, on: "SM VW AD CC MG OW", built: true },
  reports: { ru: "Отчёты", et: "Aruanded", en: "Reports", size: 25, on: "SM VW AD MG OW", built: true },
  loyalty: { ru: "Лояльность", et: "Lojaalsus", en: "Loyalty", size: 8, on: "SM VW AD CC MG OW", built: false },
  licence: { ru: "Лицензия", et: "Litsents", en: "Billing", size: 1, on: "SM AC MG OW", built: false },
  online: { ru: "Онлайн-запись", et: "Veebibroneering", en: "Online booking", size: 1, on: "SM MG OW", built: false },
  // no switch of its own: four rights that stand alone
  single: { ru: "Отдельные права", et: "Üksikõigused", en: "Single rights", size: 4, on: ALL, built: true },
};

/** How many of a group's rights each preset has on, as the list gives it (docs/altegio-rights.md, «Group totals»). */
export const GROUP_TOTALS: Record<GroupKey, Record<RoleCode, number>> = {
  journal: { SM: 5, VW: 5, SP: 3, AD: 8, CC: 7, AC: 0, MG: 8, OW: 8 },
  visit: { SM: 5, VW: 5, SP: 0, AD: 28, CC: 24, AC: 0, MG: 28, OW: 31 },
  finance: { SM: 20, VW: 9, SP: 2, AD: 6, CC: 5, AC: 28, MG: 36, OW: 36 },
  goods: { SM: 17, VW: 10, SP: 0, AD: 26, CC: 26, AC: 39, MG: 39, OW: 39 },
  staff: { SM: 7, VW: 0, SP: 0, AD: 0, CC: 0, AC: 0, MG: 8, OW: 8 },
  services: { SM: 0, VW: 0, SP: 0, AD: 0, CC: 0, AC: 0, MG: 12, OW: 12 },
  notify: { SM: 2, VW: 0, SP: 0, AD: 0, CC: 0, AC: 0, MG: 2, OW: 2 },
  settings: { SM: 6, VW: 0, SP: 0, AD: 0, CC: 0, AC: 0, MG: 8, OW: 10 },
  clients: { SM: 10, VW: 10, SP: 0, AD: 18, CC: 18, AC: 0, MG: 24, OW: 26 },
  reports: { SM: 24, VW: 21, SP: 0, AD: 6, CC: 0, AC: 0, MG: 25, OW: 25 },
  loyalty: { SM: 1, VW: 1, SP: 0, AD: 4, CC: 4, AC: 0, MG: 8, OW: 8 },
  licence: { SM: 1, VW: 0, SP: 0, AD: 0, CC: 0, AC: 1, MG: 0, OW: 1 },
  online: { SM: 0, VW: 0, SP: 0, AD: 0, CC: 0, AC: 0, MG: 1, OW: 1 },
  single: { SM: 1, VW: 1, SP: 0, AD: 0, CC: 0, AC: 0, MG: 3, OW: 3 },
};

// the role sets that come up again and again
const NOT_AC = "SM VW SP AD CC MG OW";
const NOT_SP = "SM VW AD CC AC MG OW";
const VIEW = "SM VW AD CC MG OW";
const EDIT = "AD CC MG OW";
const DESK = "AD MG OW";
const TOP = "MG OW";
const FIN = "AC MG OW";
const FIN_SEE = "SM VW AC MG OW";
const FIN_OUT = "SM AC MG OW";
const STOCK = "AD CC AC MG OW";
const ADM3 = "SM MG OW";
const REP = "SM VW MG OW";
const REP_AD = "SM VW AD MG OW";

/** key, parent, the presets it is on for, built (1) or locked (0), RU, EN, ET. */
const ROWS = [
  // ---- 1. Журнал записей (8)
  ["journal.positions", null, NOT_AC, 0, "Просматривать расписание и записи должностей", "View schedule and bookings of positions", "Näha ametikohtade graafikut ja broneeringuid"],
  ["journal.staff", null, NOT_AC, 1, "Просматривать расписание и записи сотрудников", "View schedule and appointments of team members", "Näha töötajate graafikut ja broneeringuid"],
  ["journal.history", null, NOT_AC, 1, "Ограничить доступ к истории расписания и записей", "Limit access to history of schedule and appointments", "Piirata ligipääsu graafiku ja broneeringute ajaloole"],
  ["journal.schedule", null, DESK, 1, "Изменять график работы и время для записи сотрудника в журнале", "Change team member's work schedule and appointment time in the Appointment Calendar", "Muuta kalendris töötaja töögraafikut ja broneerimisaega"],
  ["journal.phones", null, VIEW, 1, "Показывать номера телефонов", "Show phone number", "Näidata telefoninumbreid"],
  ["journal.move", null, EDIT, 1, "Перенос записи", "Reschedule appointment", "Broneeringu ümbertõstmine"],
  ["journal.stats", null, VIEW, 1, "Показывать статистику", "Show statistics", "Näidata statistikat"],
  ["journal.waitlist", null, EDIT, 0, "Показывать лист ожидания", "Show waiting list", "Näidata ootenimekirja"],

  // ---- 2. Окно записи (31)
  ["visit.assistants", null, DESK, 0, "Добавление, изменение и удаление ассистентов", "Add, edit and delete assistants", "Assistentide lisamine, muutmine ja kustutamine"],
  ["visit.assistant_share", null, DESK, 0, "Изменение доли вознаграждения ассистента", "Edit assistant compensation share", "Assistendi tasuosa muutmine"],
  ["visit.client_data", null, VIEW, 1, "Доступ к данным клиентов", "Access to the clients' data (Including phone number)", "Ligipääs klientide andmetele (ka telefoninumbrile)"],
  ["visit.client_create", null, EDIT, 1, "Доступ к созданию новых клиентов в записи", "Access to create new clients in the appointment", "Uue kliendi lisamine broneeringus"],
  ["visit.client_list", null, VIEW, 1, "Доступ к выпадающему списку с данными о клиентах", "Access to drop-down list with client data", "Ligipääs klientide rippmenüüle"],
  ["visit.client_list.phones", "visit.client_list", VIEW, 1, "Показывать номера телефонов", "Show phone number", "Näidata telefoninumbreid"],
  ["visit.fields_view", null, VIEW, 0, "Просмотр дополнительных полей записи", "View appointment custom fields", "Broneeringu lisaväljade vaatamine"],
  ["visit.create", null, "AD CC OW", 1, "Создавать записи", "Create appointments", "Luua broneeringuid"],
  ["visit.edit", null, EDIT, 1, "Изменять записи", "Change appointments", "Muuta broneeringuid"],
  ["visit.edit.arrived", "visit.edit", EDIT, 1, "Изменять записи со статусом визита «Клиент пришел»", 'Change appointments with the "Arrived" status', "Muuta broneeringuid staatusega «Klient saabus»"],
  ["visit.edit.arrived.paid", "visit.edit.arrived", EDIT, 0, "Доступ на редактирование оплаченной записи в статусе «Клиент пришел»", 'Access to edit paid bookings in the "Arrived" status', "Makstud broneeringu muutmine staatuses «Klient saabus»"],
  ["visit.edit.confirmed_paid", "visit.edit", EDIT, 0, "Доступ на редактирование оплаченной записи в статусе «Клиент подтвердил»", 'Access to edit paid appointments in the "Confirmed" status', "Makstud broneeringu muutmine staatuses «Klient kinnitas»"],
  ["visit.edit.price", "visit.edit", EDIT, 0, "Изменять стоимость услуг", "Change the cost of services", "Muuta teenuste hinda"],
  ["visit.edit.discount", "visit.edit", EDIT, 0, "Изменять скидку на услуги", "Change the discount for services", "Muuta teenuste allahindlust"],
  ["visit.edit.fields", "visit.edit", EDIT, 0, "Изменять дополнительные поля записи", "Change appointment custom fields", "Muuta broneeringu lisavälju"],
  ["visit.edit.staff_time", "visit.edit", EDIT, 1, "Изменять сотрудника и время записи", "Change team member and appointment time", "Muuta töötajat ja broneeringu aega"],
  ["visit.edit.duration", "visit.edit", EDIT, 0, "Изменять длительность", "Change duration", "Muuta kestust"],
  ["visit.edit.comment", "visit.edit", EDIT, 1, "Изменять комментарий", "Change comment", "Muuta kommentaari"],
  ["visit.edit.services", "visit.edit", EDIT, 1, "Изменять состав услуг", "Change services", "Muuta teenuste koosseisu"],
  ["visit.delete", null, TOP, 1, "Удалять записи", "Delete bookings", "Kustutada broneeringuid"],
  ["visit.delete.arrived", "visit.delete", TOP, 1, "Удаление записей со статусом «Клиент пришел»", 'Delete appointments with the "Arrived" status', "Kustutada broneeringuid staatusega «Klient saabus»"],
  ["visit.delete.paid", "visit.delete", TOP, 0, "Удаление оплаченных записей", "Delete paid appointments", "Kustutada makstud broneeringuid"],
  ["visit.sell", null, EDIT, 1, "Проводить продажу товаров", "Sell products", "Müüa tooteid"],
  ["visit.sell.create", "visit.sell", EDIT, 1, "Создание товарных транзакций", "Create product transactions", "Kaubatehingute loomine"],
  ["visit.sell.edit", "visit.sell", EDIT, 1, "Редактирование товарных транзакций", "Edit transactions for products", "Kaubatehingute muutmine"],
  ["visit.sell.edit.price", "visit.sell.edit", EDIT, 0, "Изменять стоимость товаров", "Change the cost of products", "Muuta toodete hinda"],
  ["visit.sell.edit.discount", "visit.sell.edit", EDIT, 0, "Изменять скидку на товары", "Change the discount for products", "Muuta toodete allahindlust"],
  ["visit.pay", null, "AD OW", 0, "Проводить оплату", "Process the payment", "Võtta vastu makseid"],
  ["visit.pay.account", "visit.pay", "AD OW", 0, "Проводить оплату с личного счета клиента", "Make a payment from the client's personal account", "Maksta kliendi isiklikult kontolt"],
  ["visit.consumables", null, EDIT, 0, "Редактирование расходников", "Edit consumables", "Kulumaterjalide muutmine"],
  ["visit.chain_data", null, VIEW, 0, "Доступ к данным клиентов по сети", "Client data access throughout a chain", "Ligipääs klientide andmetele kogu ketis"],

  // ---- 3. Финансы (38)
  ["finance.registers", null, ALL, 0, "Кассы: Доступ ко всем кассам / только к выбранным", "Cash registers: all / selected", "Kassad: kõik / ainult valitud"],
  ["finance.flow", null, NOT_SP, 0, "Просмотр движений средств", "View the cash flow", "Rahaliikumiste vaatamine"],
  ["finance.flow.create", "finance.flow", STOCK, 0, "Создание транзакций", "Create transactions", "Tehingute loomine"],
  ["finance.flow.edit", "finance.flow", STOCK, 0, "Редактирование транзакций", "Edit transactions", "Tehingute muutmine"],
  ["finance.flow.delete", "finance.flow", FIN, 0, "Удаление транзакций", "Delete transactions", "Tehingute kustutamine"],
  ["finance.flow.export", "finance.flow", FIN_OUT, 0, "Доступ к выгрузке движений средств в Excel", "Export the cash flow to Excel", "Rahaliikumiste eksport Excelisse"],
  ["finance.accounts", null, FIN_SEE, 0, "Доступ к счетам и кассам", "Access to accounts and cash register", "Ligipääs kontodele ja kassadele"],
  ["finance.accounts.balance", "finance.accounts", FIN_SEE, 0, "Доступ к балансу", "Access to balance", "Ligipääs saldole"],
  ["finance.partners", null, FIN_SEE, 0, "Доступ к контрагентам", "Access to counterparties", "Ligipääs tehingupartneritele"],
  ["finance.partners.create", "finance.partners", FIN, 0, "Доступ к созданию", "Access to creation", "Loomise õigus"],
  ["finance.partners.edit", "finance.partners", FIN, 0, "Доступ к изменению", "Access to editing", "Muutmise õigus"],
  ["finance.partners.delete", "finance.partners", FIN, 0, "Доступ к удалению", "Access to removal", "Kustutamise õigus"],
  ["finance.partners.export", "finance.partners", FIN_OUT, 0, "Доступ к выгрузке в Excel", "Access to download to Excel", "Excelisse eksportimise õigus"],
  ["finance.categories", null, FIN_SEE, 0, "Доступ к статье платежей", "Access to the payment category", "Ligipääs makseliikidele"],
  ["finance.categories.create", "finance.categories", FIN, 0, "Доступ к созданию", "Access to creation", "Loomise õigus"],
  ["finance.categories.edit", "finance.categories", FIN, 0, "Доступ к изменению", "Access to editing", "Muutmise õigus"],
  ["finance.categories.delete", "finance.categories", FIN, 0, "Доступ к удалению", "Access to removal", "Kustutamise õigus"],
  ["finance.pos_ops", null, FIN_OUT, 0, "Операции с ККМ", "Operations with POS", "Kassaaparaadi toimingud"],
  ["finance.pos_settings", null, ADM3, 0, "Настройки ККМ", "POS settings", "Kassaaparaadi seaded"],
  ["finance.pos_settings.edit", "finance.pos_settings", TOP, 0, "Доступ к изменению", "Access to editing", "Muutmise õigus"],
  ["finance.online_pay", null, ADM3, 0, "Онлайн-платежи", "Online payments", "Veebimaksed"],
  ["finance.online_pay.edit", "finance.online_pay", TOP, 0, "Доступ к изменению", "Access to editing", "Muutmise õigus"],
  ["finance.pay_settings", null, ADM3, 0, "Доступ к настройкам оплаты", "Access to payment settings", "Ligipääs makseseadetele"],
  ["finance.pay_settings.edit", "finance.pay_settings", TOP, 0, "Доступ к изменению", "Access to editing", "Muutmise õigus"],
  ["finance.pay_schemes", null, FIN_OUT, 0, "Доступ к схемам расчета заработной платы", "Access to payroll calculation schemes", "Ligipääs palgaarvestuse skeemidele"],
  ["finance.payroll", null, FIN_OUT, 0, "Доступ к расчету заработной платы", "Access to payroll calculation", "Ligipääs palgaarvestusele"],
  ["finance.payroll.accrue", "finance.payroll", FIN, 0, "Доступ к начислению заработной платы", "Access to payroll", "Palga arvestamise õigus"],
  ["finance.payroll_own", null, "SP", 0, "Доступ к расчету заработной платы только конкретного сотрудника", "Access to a specific team member payroll calculation", "Ligipääs ainult kindla töötaja palgaarvestusele"],
  ["finance.payroll_own.accrue", "finance.payroll_own", "", 0, "Доступ к начислению заработной платы", "Access to payroll", "Palga arvestamise õigus"],
  ["finance.period_report", null, FIN_SEE, 0, "Доступ к отчету за период", "Access to the report for the period", "Ligipääs perioodi aruandele"],
  ["finance.period_report.export", "finance.period_report", FIN_OUT, 0, "Доступ к выгрузке в Excel отчета за период", "Permission to export the report for the period to Excel", "Perioodi aruande eksport Excelisse"],
  ["finance.annual_report", null, FIN_SEE, 0, "Доступ к годовому отчету", "Access to the annual report", "Ligipääs aastaaruandele"],
  ["finance.annual_report.export", "finance.annual_report", FIN_OUT, 0, "Доступ к выгрузке в Excel годового отчета", "Permission to export the annual report to Excel", "Aastaaruande eksport Excelisse"],
  ["finance.receipt", null, STOCK, 0, "Доступ к печати чека", "Access to receipt printing", "Tšeki printimise õigus"],
  ["finance.daily", null, FIN_SEE, 0, "Доступ к отчету по кассе за день", "Access to daily cashier report", "Ligipääs päeva kassaaruandele"],
  ["finance.daily.export", "finance.daily", FIN_OUT, 0, "Доступ к выгрузке в Excel", "Access to download to Excel", "Excelisse eksportimise õigus"],
  ["finance.policies_view", null, DESK, 0, "Просмотр платёжных политик", "View payment policies", "Maksepoliitikate vaatamine"],
  ["finance.policies_manage", null, TOP, 0, "Управление платёжными политиками", "Manage payment policies", "Maksepoliitikate haldamine"],

  // ---- 4. Товары (39)
  ["goods.stores", null, NOT_SP, 0, "Склады: Доступ ко всем складам / только к выбранным", "Storage locations: all / selected", "Laod: kõik / ainult valitud"],
  ["goods.cost", null, NOT_SP, 0, "Просмотр себестоимости товаров/расходников", "View the prime cost of products and consumables", "Toodete ja kulumaterjalide omahinna vaatamine"],
  ["goods.moves", null, NOT_SP, 0, "Просмотр движений товаров", "View product movements", "Kaubaliikumiste vaatamine"],
  ["goods.moves.transfer", "goods.moves", STOCK, 0, "Перемещение товаров между складами", "Transfer products between inventories", "Kauba liigutamine ladude vahel"],
  ["goods.moves.create", "goods.moves", STOCK, 0, "Создание товарных транзакций", "Create product transactions", "Kaubatehingute loomine"],
  ["goods.moves.create.receipts", "goods.moves.create", STOCK, 0, "Оформление прихода товаров", "Record product receipts", "Kauba vastuvõtu vormistamine"],
  ["goods.moves.create.sales", "goods.moves.create", STOCK, 0, "Оформление продаж товаров", "Record product sales", "Kaubamüügi vormistamine"],
  ["goods.moves.edit", "goods.moves", STOCK, 0, "Редактирование товарных транзакций", "Edit transactions for products", "Kaubatehingute muutmine"],
  ["goods.moves.edit.receipts", "goods.moves.edit", STOCK, 0, "Оформление прихода товаров", "Record product receipts", "Kauba vastuvõtu vormistamine"],
  ["goods.moves.edit.sales", "goods.moves.edit", STOCK, 0, "Оформление продаж товаров", "Record product sales", "Kaubamüügi vormistamine"],
  ["goods.moves.delete", "goods.moves", FIN, 0, "Удаление товарных транзакций", "Delete transactions for products", "Kaubatehingute kustutamine"],
  ["goods.moves.export", "goods.moves", FIN_OUT, 0, "Доступ к выгрузке движений товаров в Excel", "Permission to download product movements to Excel", "Kaubaliikumiste eksport Excelisse"],
  ["goods.stocktake", "goods.moves", NOT_SP, 0, "Доступ к инвентаризации", "Access to inventory control", "Ligipääs inventuurile"],
  ["goods.stocktake.edit", "goods.stocktake", STOCK, 0, "Доступ к созданию и редактированию инвентаризации", "Access to create and edit inventory", "Inventuuri loomine ja muutmine"],
  ["goods.stocktake.delete", "goods.stocktake", FIN, 0, "Доступ к удалению инвентаризации", "Access to delete inventory", "Inventuuri kustutamine"],
  ["goods.stocktake.export", "goods.stocktake", "SM AD CC AC MG OW", 0, "Доступ к выгрузке инвентаризации в Excel", "Permission to download stocktakes to Excel", "Inventuuri eksport Excelisse"],
  ["goods.stock_report", "goods.moves", FIN_SEE, 0, "Доступ к отчету остатков на складе", "Access to the stock on hand report", "Ligipääs laojäägi aruandele"],
  ["goods.stock_report.export", "goods.stock_report", FIN_OUT, 0, "Доступ к выгрузке остатков в Excel", "Permission to download stock on hand to Excel", "Laojäägi eksport Excelisse"],
  ["goods.sales_report", "goods.moves", FIN_SEE, 0, "Доступ к отчету по продажам", "Access to the sales report", "Ligipääs müügiaruandele"],
  ["goods.sales_report.export", "goods.sales_report", FIN_OUT, 0, "Доступ к выгрузке отчета по продажам в Excel", "Permission to download the sales report to Excel", "Müügiaruande eksport Excelisse"],
  ["goods.consumables_report", "goods.moves", FIN_SEE, 0, "Доступ к отчету по списанию расходников", "Access to the consumables write-off report", "Ligipääs kulumaterjalide mahakandmise aruandele"],
  ["goods.consumables_report.export", "goods.consumables_report", FIN_OUT, 0, "Доступ к выгрузке отчета по списанию расходников в Excel", "Permission to download the consumables write-off report to Excel", "Kulumaterjalide mahakandmise aruande eksport Excelisse"],
  ["goods.writeoff_report", "goods.moves", FIN_SEE, 0, "Доступ к отчету по списанию товаров", "Access to the product write-offs report", "Ligipääs kauba mahakandmise aruandele"],
  ["goods.writeoff_report.export", "goods.writeoff_report", FIN_OUT, 0, "Доступ к выгрузке отчета по списанию товаров в Excel", "Permission to download the product write-offs report to Excel", "Kauba mahakandmise aruande eksport Excelisse"],
  ["goods.turnover_report", "goods.moves", FIN_SEE, 0, "Доступ к отчету по оборачиваемости", "Access to turnover report", "Ligipääs käibekiiruse aruandele"],
  ["goods.turnover_report.export", "goods.turnover_report", FIN_OUT, 0, "Доступ к выгрузке отчета по оборачиваемости в Excel", "Permission to download the turnover report to Excel", "Käibekiiruse aruande eksport Excelisse"],
  ["goods.manage", "goods.moves", NOT_SP, 0, "Доступ к управлению товарами", "Access to product management", "Ligipääs toodete haldamisele"],
  ["goods.manage.create", "goods.manage", STOCK, 0, "Доступ к созданию товаров", "Access to creating products", "Toodete loomine"],
  ["goods.manage.edit", "goods.manage", STOCK, 0, "Доступ к изменению товаров", "Access to editing products", "Toodete muutmine"],
  ["goods.manage.edit.name", "goods.manage.edit", STOCK, 0, "Название, Артикул, Штрихкод", "Name, SKU, Barcode", "Nimetus, artikkel, triipkood"],
  ["goods.manage.edit.category", "goods.manage.edit", STOCK, 0, "Категория", "Category", "Kategooria"],
  ["goods.manage.edit.price", "goods.manage.edit", STOCK, 0, "Цена продажи", "Price", "Müügihind"],
  ["goods.manage.edit.cost", "goods.manage.edit", STOCK, 0, "Себестоимость", "Prime cost", "Omahind"],
  ["goods.manage.edit.units", "goods.manage.edit", STOCK, 0, "Единицы измерения", "Units", "Mõõtühikud"],
  ["goods.manage.edit.stock_levels", "goods.manage.edit", STOCK, 0, "Критичный остаток, Желаемый остаток", "Critical stock level, Desired stock level", "Kriitiline jääk, soovitud jääk"],
  ["goods.manage.edit.weight", "goods.manage.edit", STOCK, 0, "Масса", "Weight", "Kaal"],
  ["goods.manage.edit.comment", "goods.manage.edit", STOCK, 0, "Комментарий", "Comment", "Kommentaar"],
  ["goods.manage.archive", "goods.manage", STOCK, 0, "Доступ к архивации и восстановлению товаров", "Access to archiving and restoring products", "Toodete arhiveerimine ja taastamine"],
  ["goods.manage.delete", "goods.manage", STOCK, 0, "Доступ к удалению товаров", "Access to deleting products", "Toodete kustutamine"],

  // ---- 5. Сотрудники (8)
  ["staff.create", null, ADM3, 1, "Создание сотрудников", "Create team members", "Töötajate lisamine"],
  ["staff.edit", null, ADM3, 1, "Редактирование сотрудников", "Edit team members", "Töötajate muutmine"],
  ["staff.delete", null, ADM3, 0, "Удаление сотрудников", "Delete team members", "Töötajate kustutamine"],
  ["staff.dismiss", null, ADM3, 1, "Увольнение сотрудников", "Dismiss team members", "Töötajate vallandamine"],
  ["staff.positions", null, ADM3, 0, "Доступ к разделу Должности", "Access to Positions section", "Ligipääs jaotisele «Ametikohad»"],
  ["staff.positions.create", "staff.positions", ADM3, 0, "Создание должностей", "Create positions", "Ametikohtade loomine"],
  ["staff.positions.delete", "staff.positions", ADM3, 0, "Удаление должностей", "Remove positions", "Ametikohtade kustutamine"],
  ["staff.schedule", null, TOP, 1, "Редактирование графика работы", "Edit work schedule", "Töögraafiku muutmine"],

  // ---- 6. Услуги (12)
  ["services.create", null, TOP, 1, "Создание услуг", "Create services", "Teenuste loomine"],
  ["services.edit", null, TOP, 1, "Редактирование услуг", "Edit services", "Teenuste muutmine"],
  ["services.edit.name", "services.edit", TOP, 1, "Название услуги и Название для онлайн-записи", "The name of service and Name for online booking", "Teenuse nimi ja nimi veebibroneeringus"],
  ["services.edit.category", "services.edit", TOP, 0, "Категория услуги", "Service category", "Teenuse kategooria"],
  ["services.edit.price", "services.edit", TOP, 1, "Цена услуги", "Service price", "Teenuse hind"],
  ["services.edit.images", "services.edit", TOP, 0, "Загрузка и изменение изображений", "Uploading and changing images", "Piltide üleslaadimine ja muutmine"],
  ["services.edit.online", "services.edit", TOP, 1, "Отображение услуги в виджете", "Displaying the service in the booking widget", "Teenuse näitamine broneerimisvidinas"],
  ["services.edit.online_pay", "services.edit", TOP, 0, "Онлайн-оплата услуги", "Online payment for the service", "Teenuse veebimakse"],
  ["services.edit.resources", "services.edit", TOP, 0, "Ресурсы услуги", "Service resources", "Teenuse ressursid"],
  ["services.staff", null, TOP, 1, "Изменять услуги сотрудников и их длительность", "Change team members' services and their duration", "Muuta töötajate teenuseid ja nende kestust"],
  ["services.materials", null, TOP, 0, "Изменять технологические карты", "Modify bills of materials", "Muuta tehnoloogilisi kaarte"],
  ["services.delete", null, TOP, 1, "Удаление услуг", "Delete services", "Teenuste kustutamine"],

  // ---- 7. Уведомления (2)
  ["notify.sms", null, ADM3, 0, "Доступ к разделу SMS-уведомления", "Access to the SMS Notifications section", "Ligipääs jaotisele «SMS-teavitused»"],
  ["notify.email", null, ADM3, 0, "Доступ к разделу Email-уведомления", "Access to the Email Notifications section", "Ligipääs jaotisele «E-kirja teavitused»"],

  // ---- 8. Настройки (10)
  ["settings.system", null, ADM3, 1, "Доступ к системным настройкам", "Access to system settings", "Ligipääs süsteemiseadetele"],
  ["settings.location", null, ADM3, 0, "Доступ к настройкам локации", "Access to location settings", "Ligipääs asukoha seadetele"],
  ["settings.users", null, ADM3, 1, "Управлять пользователями", "Manage users", "Hallata kasutajaid"],
  ["settings.users.remove", "settings.users", ADM3, 1, "Удалять пользователей", "Remove users", "Eemaldada kasutajaid"],
  ["settings.users.invite", "settings.users", ADM3, 1, "Приглашение пользователей к управлению локацией", "Invite users to manage a location", "Kutsuda kasutajaid asukohta haldama"],
  ["settings.users.notify", "settings.users", TOP, 0, "Настройка уведомлений пользователя", "Configure user notifications", "Kasutaja teavituste seadistamine"],
  ["settings.users.rights", "settings.users", ADM3, 1, "Управлять правами пользователей", "Manage user rights", "Hallata kasutajate õigusi"],
  ["settings.webhook", null, "OW", 0, "Изменение настроек WebHook", "Change Webhook settings", "WebHooki seadete muutmine"],
  ["settings.pay_docs", null, "OW", 0, "Изменение настроек получения платёжных документов", "Change settings for receiving payment documents", "Maksedokumentide saamise seadete muutmine"],
  ["settings.categories", null, TOP, 1, "Настройка списка категорий клиентов", "Set up the list of client categories", "Kliendikategooriate loendi seadistamine"],

  // ---- 9. Клиентская база (26)
  ["clients.list_contacts", null, EDIT, 1, "Показывать номера телефонов и email в списке клиентов", "Show phone numbers and email in client list", "Näidata klientide loendis telefoninumbreid ja e-posti"],
  ["clients.card_contacts", null, EDIT, 1, "Показывать номер телефона и email в карточке клиента", "Show the phone number and email in the client's card", "Näidata kliendikaardil telefoninumbrit ja e-posti"],
  ["clients.surname", null, VIEW, 0, "Просмотр фамилии и отчества клиента", "View client last name and middle name", "Kliendi perekonna- ja isanime vaatamine"],
  ["clients.surname.edit", "clients.surname", EDIT, 0, "Редактирование фамилии и отчества клиента", "Edit client last name and middle name", "Kliendi perekonna- ja isanime muutmine"],
  ["clients.edit", null, EDIT, 1, "Редактировать данные клиента в карточке клиента", "Edit client data in client's card", "Muuta kliendi andmeid kliendikaardil"],
  ["clients.loyalty", null, VIEW, 0, "Просматривать список лояльности клиента", "View client loyalty list", "Vaadata kliendi lojaalsusnimekirja"],
  ["clients.note", null, VIEW, 1, "Просматривать примечание", "View client card comment", "Vaadata märkust"],
  ["clients.note.edit", "clients.note", EDIT, 1, "Редактировать примечание", "Edit client card comment", "Muuta märkust"],
  ["clients.delete", null, "OW", 1, "Удалять клиентов", "Delete clients", "Kustutada kliente"],
  ["clients.export", null, "OW", 1, "Выгружать список клиентов", "Export the client list", "Eksportida klientide loendit"],
  ["clients.comments", null, VIEW, 1, "Просматривать комментарии", "View comments", "Vaadata kommentaare"],
  ["clients.comments_add", null, EDIT, 1, "Добавлять комментарии", "Add comments", "Lisada kommentaare"],
  ["clients.comments_delete_own", null, TOP, 1, "Удалять свои комментарии", "Delete your own comments", "Kustutada enda kommentaare"],
  ["clients.comments_delete_others", null, TOP, 1, "Удалять чужие комментарии", "Delete others' comments", "Kustutada teiste kommentaare"],
  ["clients.files", null, REP, 1, "Просматривать и скачивать файлы", "View and download files", "Vaadata ja alla laadida faile"],
  ["clients.files.upload", "clients.files", TOP, 1, "Загружать файлы", "Upload files", "Laadida faile üles"],
  ["clients.files.delete", "clients.files", TOP, 1, "Удалять файлы", "Delete files", "Kustutada faile"],
  ["clients.fields", null, VIEW, 0, "Просмотр дополнительных полей клиента", "View client custom fields", "Kliendi lisaväljade vaatamine"],
  ["clients.fields.edit", "clients.fields", EDIT, 0, "Изменять дополнительные поля клиента", "Edit client custom fields", "Muuta kliendi lisavälju"],
  ["clients.show", null, VIEW, 1, "Показывать клиентов", "Show the clients", "Näidata kliente"],
  ["clients.history", null, VIEW, 1, "Просмотр истории посещений клиента", "View client visit history", "Kliendi külastuste ajaloo vaatamine"],
  ["clients.accounts", null, VIEW, 0, "Счета", "Accounts", "Kontod"],
  ["clients.accounts.open", "clients.accounts", EDIT, 0, "Открыть счет", "Open an account", "Avada konto"],
  ["clients.accounts.topup", "clients.accounts", EDIT, 0, "Пополнить счет", "Replenish account", "Täiendada kontot"],
  ["clients.accounts.history", "clients.accounts", VIEW, 0, "Просмотр истории операций по счетам", "View account transaction history", "Kontotehingute ajaloo vaatamine"],
  ["clients.loyalty_setup", null, TOP, 0, "Настройка программ лояльности", "Set up loyalty programs", "Lojaalsusprogrammide seadistamine"],

  // ---- 10. Отчёты (25)
  ["reports.dashboard", null, REP, 1, "Основные показатели", "Main dashboard", "Põhinäitajad"],
  ["reports.bookings", null, REP_AD, 1, "Просматривать список записей", "View the list of bookings", "Vaadata broneeringute loendit"],
  ["reports.bookings.export", "reports.bookings", "SM AD MG OW", 1, "Выгружать список записей в Excel", "Export the list of bookings to Excel", "Eksportida broneeringute loend Excelisse"],
  ["reports.bookings.phones", "reports.bookings", REP_AD, 1, "Показывать номера телефонов в записях", "Show phone numbers in bookings", "Näidata broneeringutes telefoninumbreid"],
  ["reports.events", null, REP_AD, 0, "События", "Events", "Sündmused"],
  ["reports.visits", null, REP_AD, 1, "Визиты", "Visits", "Külastused"],
  ["reports.visits.phones", "reports.visits", REP_AD, 1, "Показывать номера телефонов в сводке", "Show phone numbers in the summary", "Näidata kokkuvõttes telefoninumbreid"],
  ["reports.return_rate", null, REP, 0, "Анализ возвращаемости", "Return rate", "Tagasituleku analüüs"],
  ["reports.workload", null, REP, 0, "Загруженность сотрудников", "Team members workload", "Töötajate koormus"],
  ["reports.receptionists", null, REP, 0, "Аналитика администраторов", "Receptionist analytics", "Administraatorite analüütika"],
  ["reports.sales_staff", null, REP, 0, "Продажи по сотрудникам", "Sales by team members", "Müük töötajate kaupa"],
  ["reports.sales_staff_time", null, REP, 0, "Динамика продаж по сотрудникам", "Sales by team member over time", "Müügi dünaamika töötajate kaupa"],
  ["reports.sales_services", null, REP, 0, "Продажи по услугам", "Sales by services", "Müük teenuste kaupa"],
  ["reports.sales_clients", null, REP, 0, "Продажи по клиентам", "Sales by clients", "Müük klientide kaupa"],
  ["reports.promotions", null, REP, 0, "Акции", "Promotions", "Kampaaniad"],
  ["reports.reviews", null, REP, 1, "Просматривать отзывы", "View reviews", "Vaadata arvustusi"],
  ["reports.reviews.delete", "reports.reviews", TOP, 1, "Удалять отзывы", "Delete reviews", "Kustutada arvustusi"],
  ["reports.messages", null, REP, 1, "Просматривать детализацию сообщений", "View the details of messages", "Vaadata sõnumite üksikasju"],
  ["reports.messages.export", "reports.messages", ADM3, 0, "Выгрузка детализации сообщений в Excel", "Export the details of messages to Excel", "Sõnumite üksikasjade eksport Excelisse"],
  ["reports.messages.phones", "reports.messages", REP, 1, "Показывать номера телефонов в сообщениях", "Show phone numbers in messages", "Näidata sõnumites telefoninumbreid"],
  ["reports.calls", null, REP, 0, "Раздел «Звонки»", "Calls", "Jaotis «Kõned»"],
  ["reports.calls.export", "reports.calls", ADM3, 0, "Доступ к выгрузке звонков Excel", "Export calls to Excel", "Kõnede eksport Excelisse"],
  ["reports.calls.phones", "reports.calls", REP, 0, "Показывать номера телефонов клиентов", "Show phone numbers in calls", "Näidata klientide telefoninumbreid"],
  ["reports.exports", null, REP, 0, "Экспорт данных", "Data exports", "Andmete eksport"],
  ["reports.changes", null, REP, 0, "Журнал изменений данных", "Data changes", "Andmemuudatuste logi"],

  // ---- 11. Лояльность (8)
  ["loyalty.cards", null, EDIT, 0, "Выдача и удаление карт лояльности клиента", "Issuance and removal of client loyalty cards", "Kliendi lojaalsuskaartide väljastamine ja eemaldamine"],
  ["loyalty.cards_manual", null, EDIT, 0, "Ручное пополнение/списание с карт лояльности", "Manual credit/debit of loyalty cards", "Lojaalsuskaartide käsitsi täiendamine ja mahaarvamine"],
  ["loyalty.membership_balance", null, TOP, 0, "Редактирование баланса абонементов", "Membership balance editing", "Abonementide saldo muutmine"],
  ["loyalty.membership_validity", null, TOP, 0, "Редактирование срока действия абонементов", "Membership validity editing", "Abonementide kehtivusaja muutmine"],
  ["loyalty.membership_history", null, VIEW, 0, "Просмотр истории абонементов", "View membership history", "Abonementide ajaloo vaatamine"],
  ["loyalty.gift_balance", null, TOP, 0, "Редактирование баланса сертификатов", "Editing the balance of gift cards", "Kinkekaartide saldo muutmine"],
  ["loyalty.gift_validity", null, TOP, 0, "Редактирование срока действия сертификатов", "Editing the expiration date of gift cards", "Kinkekaartide kehtivusaja muutmine"],
  ["loyalty.pay_without_code", null, EDIT, 0, "Оплата сертификатом и абонементом без кода", "Purchase with gift card and membership without code", "Maksmine kinkekaardi ja abonemendiga ilma koodita"],

  // ---- 12. Лицензия (1), 13. Онлайн-запись (1)
  ["licence.billing", null, "SM AC OW", 0, "Доступ к разделу Счета", "Access to the Billing section", "Ligipääs jaotisele «Arved»"],
  ["online.personal_data", null, TOP, 0, "Управление обработкой персональных данных", "Manage processing of personal data", "Isikuandmete töötlemise haldamine"],

  // ---- the single rights (4)
  ["single.ip", null, "", 0, "Разрешить доступ к локации только с IP-адресов (v4, v6)", "Allow access to the location only from IP addresses (v4, v6)", "Lubada ligipääs asukohale ainult IP-aadressidelt (v4, v6)"],
  ["single.resources", null, REP, 0, "Ресурсы", "Resources", "Ressursid"],
  ["single.bulk_sms", null, TOP, 1, "Совершать SMS рассылки клиентам", "Send bulk SMS to clients", "Saata klientidele SMS-massisõnumeid"],
  ["single.chain_add", null, TOP, 0, "Добавление локации в сети", "Add locations to the chain", "Asukoha lisamine ketti"],
] as const;

export type RightKey = (typeof ROWS)[number][0];

/**
 * A right that carries a value instead of a plain switch:
 *   scope    whose: everyone's («all») or the chosen barbers' (their ids)
 *   history  how far back: no limit (null) or so many days (0: no past days)
 * It is on whenever its group is: only the value is chosen.
 */
export type ValueKind = "scope" | "history";
const VALUE_KIND: Partial<Record<RightKey, ValueKind>> = {
  "journal.positions": "scope",
  "journal.staff": "scope",
  "journal.history": "history",
  "clients.show": "scope",
  "finance.registers": "scope",
  "goods.stores": "scope",
};

/** Rights with the list's «Период» setting, of the ones that work here: everything («all») or the current day only («today»). */
const PERIOD: readonly RightKey[] = ["visit.edit", "visit.sell.create", "visit.sell.edit"];

export type RightDef = {
  key: RightKey;
  group: GroupKey;
  parent: RightKey | null;
  /** how deep it is nested: 0 for a right of the group itself */
  depth: number;
  on: readonly RoleCode[];
  built: boolean;
  value: ValueKind | null;
  period: boolean;
} & Words;

const roles = (s: string): RoleCode[] => s.split(" ").filter(isRoleCode);

/** Every right, in the list's order. */
export const RIGHTS: readonly RightDef[] = ROWS.map(([key, parent, on, built, ru, en, et]) => ({
  key,
  group: key.slice(0, key.indexOf(".")) as GroupKey,
  parent,
  depth: 0,
  on: roles(on),
  built: built === 1,
  value: VALUE_KIND[key] ?? null,
  period: PERIOD.includes(key),
  ru,
  en,
  et,
}));

const BY_KEY = new Map<string, RightDef>(RIGHTS.map((r) => [r.key, r]));
for (const r of RIGHTS) {
  let depth = 0;
  for (let p = r.parent; p; p = BY_KEY.get(p)?.parent ?? null) depth++;
  (r as { depth: number }).depth = depth;
}

export const rightDef = (key: string): RightDef | undefined => BY_KEY.get(key);
export const isRightKey = (key: unknown): key is RightKey => typeof key === "string" && BY_KEY.has(key);

/** A group's switch in the stored set: «group:journal». Not a right, and not counted. */
export const groupKey = (g: GroupKey) => `group:${g}` as const;
/** The groups that have a switch (the single rights have none). */
export const SWITCH_GROUPS: readonly GroupKey[] = GROUP_KEYS.filter((g) => g !== "single");

export const rightsOf = (g: GroupKey): RightDef[] => RIGHTS.filter((r) => r.group === g);

/** A stored value: a scope («all» or barbers' ids), a history limit (null or days), a period («all» or «today»). */
export type RightValue = "all" | "today" | string[] | number | null;
export type RightValues = Record<string, RightValue>;

/** What a preset fills in: the switches that are on (group switches too) and the values. */
export type PresetSet = { on: string[]; values: RightValues };

/**
 * A preset's defaults. A scope starts as «all», a period as «all», the
 * history as «no limit», but for «Специалист», who starts with no past
 * days.
 */
export function presetRights(role: RoleCode): PresetSet {
  const on: string[] = [];
  for (const g of SWITCH_GROUPS) if (roles(GROUPS[g].on).includes(role)) on.push(groupKey(g));
  for (const r of RIGHTS) if (r.on.includes(role)) on.push(r.key);
  const values: RightValues = {};
  for (const r of RIGHTS) {
    if (r.value === "scope") values[r.key] = "all";
    else if (r.value === "history") values[r.key] = role === "SP" ? 0 : null;
    else if (r.period) values[r.key] = "all";
  }
  return { on, values };
}

/** The days back the history select offers; null is «no limit», 0 «no past days». */
export const HISTORY_DAYS = [null, 0, 1, 3, 7, 14, 30, 90, 180] as const;
