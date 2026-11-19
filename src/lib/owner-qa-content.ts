/**
 * Renat's questions page (/ru/q/<token>), in plain Russian.
 *
 * The questions here are the ones Altegio and Isolta cannot answer. What we
 * will read from them ourselves is listed under «Это посмотрим сами»; what
 * Dim has already settled (17.11.2026) is under «Уже решено».
 * docs/questions-for-renat.ru.md keeps the same list.
 *
 * Each field saves on its own («commission.vat», «extra.note»…). The page
 * sends one field at a time; every change is logged (qa_answer_log), so a
 * later addition never loses what was written first.
 *
 * Content and checks only, so the page can import it; the database side is
 * src/lib/owner-qa.ts.
 */

export type Field =
  | { id: string; kind: "one" | "many"; label: string; options: string[] }
  | { id: string; kind: "text"; label: string; rows?: number }
  | { id: string; kind: "money"; label: string; hint: string };

export type Question = { id: string; title: string; lead: string; fields: Field[] };

export const INTRO =
  "Ренат, мы делаем для REMPIRE свою систему записи вместо Altegio и свои счета барберам вместо Isolta. " +
  "Здесь 11 коротких вопросов. Ответы сохраняются сами: можно закрыть страницу, вернуться и дописать.";

export const QUESTIONS: Question[] = [
  /* 18.11.2026, for the test run (docs/test-run.md): the two things the test
     days wait on, first on the page so a returning Renat sees them. */
  {
    id: "access",
    title: "Доступ к Altegio и Isolta",
    lead:
      "Чтобы перенести барберов, услуги, цены и график из Altegio, а данные для счетов из Isolta, " +
      "добавь info@diipsolutions.eu пользователем в обе системы. Хватит прав только на просмотр, если они есть.",
    fields: [
      { id: "altegio", kind: "one", label: "Altegio", options: ["Добавил", "Добавлю на этой неделе", "Не получается, нужна помощь"] },
      { id: "isolta", kind: "one", label: "Isolta", options: ["Добавил", "Добавлю на этой неделе", "Не получается, нужна помощь"] },
      { id: "note", kind: "text", label: "Если что-то мешает, напиши" },
    ],
  },
  /* «emails» stays the id so the field keys never change; Dim, 18.11: Renat
     may test alone first, the barbers' logins only if he wants them in. */
  {
    id: "emails",
    title: "Кто тестирует",
    lead:
      "Новую систему можно сначала попробовать самому, а можно сразу с барберами. " +
      "Каждый барбер входит в своё приложение по e-mail: туда приходит код для входа.",
    fields: [
      { id: "who", kind: "one", label: "Кто тестирует?", options: ["Сначала я сам", "Я и барберы"] },
      {
        id: "list",
        kind: "text",
        label: "Если с барберами: имя барбера и e-mail, который он открывает на телефоне, по одному в строке",
        rows: 6,
      },
    ],
  },
  {
    id: "commission",
    title: "17 % барберу от продажи товара",
    lead: "Барбер продаёт клиенту товар из магазина и получает 17 %. Как считаем?",
    fields: [
      { id: "vat", kind: "one", label: "От какой цены?", options: ["От цены с НДС: сколько заплатил клиент", "От цены без НДС"] },
      { id: "discount", kind: "one", label: "Если у товара скидка?", options: ["От цены со скидкой", "От обычной цены"] },
      { id: "note", kind: "text", label: "Если считаете иначе, напиши как" },
    ],
  },
  {
    id: "self",
    title: "Что барбер меняет сам",
    lead: "В приложении барбера. Что не отмечено, барбер отправляет тебе запросом, а ты подтверждаешь.",
    fields: [
      { id: "may", kind: "many", label: "Барбер сам меняет:", options: ["Свой график", "Отпуск и выходные", "Цены своих услуг", "Время своих услуг"] },
      { id: "note", kind: "text", label: "Что-то ещё?" },
    ],
  },
  {
    id: "telegram",
    title: "Уведомления барберам в Telegram",
    lead:
      "Новая запись, отмена или перенос, а утром план на день. Приходит в Telegram от нового бота REMPIRE, " +
      "не от бота магазина. Telegram бесплатный, SMS платные.",
    fields: [
      { id: "how", kind: "one", label: "Как удобнее барберам?", options: ["В Telegram", "В приложении барбера", "И там, и там", "Спрошу у барберов"] },
      { id: "note", kind: "text", label: "Например, у кого нет Telegram" },
    ],
  },
  {
    id: "owner_push",
    title: "Уведомления тебе",
    lead:
      "Тебе на телефон, как сейчас приходят заказы магазина. В приложении будет настройка, и ты сможешь " +
      "включить или выключить каждое. Что включить с самого начала?",
    fields: [
      {
        id: "which",
        kind: "many",
        label: "Присылать мне:",
        options: [
          "Новая запись онлайн",
          "Клиент перенёс или отменил запись",
          "Барбер отменил запись",
          "Запрос от барбера: отпуск, график, цены",
          "Вечером план на завтра по всему салону",
        ],
      },
      { id: "note", kind: "text", label: "Что-то ещё?" },
    ],
  },
  {
    id: "costs",
    title: "Сколько платишь сейчас в месяц",
    lead: "Ты говорил: Altegio около 35 €, Messaggio около 35 €. Поправь, если не так, и допиши Isolta. Так посчитаем, сколько сэкономим.",
    fields: [
      { id: "altegio", kind: "money", label: "Altegio, € в месяц", hint: "около 35" },
      { id: "messaggio", kind: "money", label: "Messaggio (SMS), € в месяц", hint: "около 35" },
      { id: "isolta", kind: "money", label: "Isolta, € в месяц", hint: "сколько?" },
    ],
  },
  {
    id: "universal",
    title: "Только REMPIRE или любой сервис",
    lead:
      "Систему можно сделать универсальной. Тогда потом ей пользуются тату-мастера, массажный салон или любой " +
      "другой сервис. От этого зависит, как мы строим её с самого начала.",
    fields: [
      { id: "who", kind: "one", label: "Для кого система?", options: ["Только барбершоп REMPIRE", "REMPIRE: барберы и тату", "Любой сервис: тату, массаж и другие", "Пока не знаю"] },
      { id: "note", kind: "text", label: "Есть мысли, кому ещё она подойдёт?" },
    ],
  },
  /* Dim, 19.11 (decisions round 8): «Финансы», «Отчёты» and «Лояльность» are built only if Renat uses them. */
  {
    id: "altegio_extra",
    title: "Касса, отчёты и скидки",
    lead:
      "В Altegio есть разделы «Финансы», «Отчёты» и «Лояльность». В новую систему переносим только то, чем ты " +
      "пользуешься. Скидки и карты в Altegio сейчас не настроены.",
    fields: [
      { id: "cash", kind: "one", label: "Оплату визитов в Altegio отмечаешь?", options: ["Да, каждый визит", "Иногда", "Нет, это не нужно"] },
      { id: "reports", kind: "one", label: "Отчёты и аналитику смотришь?", options: ["Да, часто", "Редко", "Нет"] },
      { id: "loyalty", kind: "one", label: "Скидки постоянным клиентам нужны?", options: ["Нет", "Да, скидка в процентах", "Да, по-другому"] },
      { id: "note", kind: "text", label: "Что из этого тебе важно" },
    ],
  },
  /* Dim, 18.11: not built yet, asked here as something we can add (docs/apps.md). */
  {
    id: "qr",
    title: "QR-код для салона",
    lead:
      "Можем сделать табличку с QR-кодом. Клиент наводит камеру телефона, и открывается запись: " +
      "так он записывается на следующий визит прямо в кресле. Табличку печатаешь сам и ставишь у зеркала, на стойке или на двери. " +
      "Можно сделать и свой код каждому барберу: он сразу открывает запись к этому барберу.",
    fields: [
      { id: "want", kind: "one", label: "Нужна такая табличка?", options: ["Да, одна на салон", "Да, своя у каждого барбера", "Пока не нужна"] },
      { id: "note", kind: "text", label: "Где бы ты её поставил?" },
    ],
  },
  {
    id: "extra",
    title: "Что ещё важно",
    lead: "Что не нравится в Altegio, чего не хватает, что точно нельзя потерять. Пиши сколько хочешь, можно дописывать потом.",
    fields: [{ id: "note", kind: "text", label: "Твои мысли", rows: 6 }],
  },
];

/** Settled by Dim, 17.11.2026. Renat can object in «decided.note». */
export const DECIDED: string[] = [
  "Запись подтверждается сразу. Барбер сам открыл время, значит клиент записывается без подтверждения. В экстренном случае барбер может отменить запись.",
  "Без депозита и предоплаты, как сейчас.",
  "Особое время: барбер сам открывает вечер, выходной или обед по своей цене, например +20 €. Доплата целиком идёт барберу.",
  "Из Altegio переносим всё, что можно: клиентов с номерами, историю визитов, отзывы.",
  "Счета барберам: PDF на почту.",
  "Товар себе барбер берёт по закупочной цене, без 17 %.",
];
export const DECIDED_NOTE: Field = { id: "note", kind: "text", label: "Если что-то здесь не так, напиши" };

/** What Altegio and Isolta will tell us, so we do not ask. */
export const WE_READ: string[] = [
  "Altegio: услуги, цены и время у каждого барбера, график, правило отмены.",
  "Isolta: какая фирма выставляет счета, НДС, аренда каждого барбера, как выглядит счёт.",
];

/** Every field the page may save, by its full key. */
export const FIELDS: ReadonlyMap<string, Field> = new Map([
  ...QUESTIONS.flatMap((q) => q.fields.map((f) => [`${q.id}.${f.id}`, f] as const)),
  ["decided.note", DECIDED_NOTE] as const,
]);

const TEXT_MAX = 5000;
const MONEY_MAX = 40;

export type Value = string | string[];

/** The value to store for `field`, or null if the page sent something it never offers. */
export function cleanValue(field: string, value: unknown): Value | null {
  const f = FIELDS.get(field);
  if (!f) return null;
  if (f.kind === "many") {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && f.options.includes(v))) return null;
    return f.options.filter((o) => value.includes(o)); // the page's order, no repeats
  }
  if (typeof value !== "string") return null;
  if (f.kind === "one") return value === "" || f.options.includes(value) ? value : null;
  const max = f.kind === "money" ? MONEY_MAX : TEXT_MAX;
  return value.length <= max ? value : null;
}

export function isAnswered(value: Value | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : !!value && value.trim() !== "";
}
