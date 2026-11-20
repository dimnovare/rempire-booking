/**
 * Renat's questions page (/ru/q/<token>), in plain Russian.
 *
 * Set 3, 20.11.2026 (Dim, decisions round 10: «replace the questions, same
 * link»): what the re-scan of Altegio and Isolta could not answer
 * (docs/port-check.md, «❓ Renat»), first; then the questions of the first
 * set that are still open, under their old ids, so whatever Renat wrote
 * there shows again. Dropped from the first set: «access» (we are in both
 * systems), «costs» (read in their billing), «universal» (now «place») and
 * «altegio_extra» (now «pay», «skipped» and the dashboards). Their answers
 * stay in qa_answers. docs/questions-for-renat.ru.md keeps the same list.
 *
 * 20.11.2026 evening (Dim: «check if those are still actual»): the questions
 * Renat answered on 18.11 (emails, commission, self, telegram, qr) left the
 * list; his answers are in DECIDED. Isolta shows no renewal date (its
 * licence API gives a rolling "last 12 months"), so «switch.isolta» asks
 * Renat for the date of Isolta's last invoice to him.
 *
 * Each field saves on its own («switch.ok», «extra.note»…). The page sends
 * one field at a time; every change is logged (qa_answer_log), so a later
 * addition never loses what was written first.
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
  "Ренат, мы ещё раз посмотрели, как REMPIRE работает в Altegio и Isolta, и почти всё уже перенесли. " +
  "Здесь 10 коротких вопросов. Что ты уже ответил, теперь внизу, в «Уже решено». " +
  "Ответы сохраняются сами: можно закрыть страницу, вернуться и дописать.";

export const QUESTIONS: Question[] = [
  /* Dim, round 10: before Altegio renews itself on 2 December. */
  {
    id: "switch",
    title: "Переход до 2 декабря",
    lead:
      "Altegio стоит 92,99 € в месяц и сам продлится 2 декабря. Поэтому хотим перейти на новую систему до этого дня. " +
      "Isolta стоит 94,80 € + НДС в год и тоже продлевается сама; отказаться надо за месяц до продления. " +
      "Дату продления Isolta не показывает: её видно по последнему счёту от Isolta на почте.",
    fields: [
      { id: "ok", kind: "one", label: "До 2 декабря тебе подходит?", options: ["Да", "Нет, нужно позже"] },
      { id: "isolta", kind: "text", label: "Когда пришёл последний счёт от Isolta? Если не знаешь, оставь пустым" },
    ],
  },
  {
    id: "pay",
    title: "Оплата визитов",
    lead:
      "В Altegio оплату визита отмечает только Евгений, остальные барберы не отмечают. " +
      "Новая система может записывать, сколько клиент заплатил, наличными или картой.",
    fields: [
      { id: "need", kind: "one", label: "Это нужно?", options: ["Да, всем барберам", "Только тем, кто хочет", "Нет, не нужно"] },
      { id: "note", kind: "text", label: "Как сейчас считаете деньги за визиты?" },
    ],
  },
  {
    id: "app",
    title: "Приложение Altegio для клиентов",
    lead:
      "Каждая восьмая запись приходит из приложения Altegio. После перехода его не будет: клиенты записываются " +
      "по ссылке, с сайта rempire.ee или из Google Maps. Ссылку можно сохранить на телефон как приложение.",
    fields: [{ id: "ok", kind: "one", label: "Так нормально?", options: ["Да", "Нет, нужно своё приложение", "Не знаю"] }],
  },
  {
    id: "reviews",
    title: "Новые отзывы",
    lead:
      "Отзывы из Altegio переносим и показываем при записи. На странице салона клиент сможет сам написать отзыв, " +
      "а ты его одобришь. Сейчас Altegio не просит клиента оставить отзыв, новые приходили из его приложения.",
    fields: [{ id: "ask", kind: "one", label: "Просить отзыв после визита?", options: ["Да, через 3 часа", "Нет"] }],
  },
  {
    id: "paid",
    title: "Оплата счетов барберами",
    lead:
      "В Isolta ни один счёт не отмечен оплаченным, поэтому все 422 стоят как просроченные. " +
      "В новой системе можно отмечать оплату и видеть, кто должен. Пока мы эту кнопку спрятали.",
    fields: [
      {
        id: "track",
        kind: "one",
        label: "Где ты видишь, кто заплатил?",
        options: ["В банке, этого хватает", "Барберы платят сразу, следить не нужно", "Хочу отмечать в новой системе"],
      },
      { id: "terms", kind: "text", label: "У одних срок оплаты 5 дней, у других 14. От чего это зависит?" },
    ],
  },
  {
    id: "drafts",
    title: "Черновики в Isolta",
    lead: "В Isolta 58 неотправленных черновиков, по 5–12 в год. Выставленные счета переносим, черновики только если нужны.",
    fields: [
      { id: "what", kind: "one", label: "Черновики нужны?", options: ["Нет, не нужны", "Нужны, объясню ниже", "Не знаю"] },
      { id: "note", kind: "text", label: "Если нужны, зачем" },
    ],
  },
  {
    id: "accountant",
    title: "Бухгалтер",
    lead: "Новая система выгружает счета в Excel и PDF. Что нужно твоему бухгалтеру и как часто?",
    fields: [{ id: "needs", kind: "text", label: "Что бухгалтер берёт сейчас из Isolta или Altegio" }],
  },
  {
    id: "place",
    title: "Тату-студия",
    lead: "Ты писал, что в системе будут любые услуги: тату, массаж и другие. В Altegio у REMPIRE один филиал. Где будет тату?",
    fields: [
      { id: "tattoo", kind: "one", label: "Тату:", options: ["В той же системе, в салоне на Mardi 1", "Отдельно, в своём месте", "Пока не нужно"] },
      { id: "note", kind: "text", label: "Что-то ещё?" },
    ],
  },
  /* Dim, round 10: «list them in the Q&A for Renat if he needs any» */
  {
    id: "skipped",
    title: "Что не переносим",
    lead: "Этим в Altegio и Isolta не пользуются, поэтому в новой системе этого нет. Отметь, если что-то всё же нужно.",
    fields: [
      {
        id: "need",
        kind: "many",
        label: "Нужно:",
        options: [
          "Склад и учёт товаров в салоне",
          "Онлайн-оплата и предоплата",
          "Расчёт зарплат",
          "Скидки и карты постоянных клиентов",
          "Сертификаты и абонементы",
          "Акции",
          "Групповые записи",
          "Звонки и телефония",
          "Электронные счета (e-arve)",
          "Напоминания барберам об оплате счёта",
        ],
      },
      { id: "note", kind: "text", label: "Если что-то нужно, зачем" },
    ],
  },
  /* first set: Renat answered it on 18.11; it stays so he can add more */
  {
    id: "extra",
    title: "Что ещё важно",
    lead: "Что не нравится в Altegio, чего не хватает, что точно нельзя потерять. Пиши сколько хочешь, можно дописывать потом.",
    fields: [{ id: "note", kind: "text", label: "Твои мысли", rows: 6 }],
  },
];

/** Settled by Dim (17.11 and 20.11.2026) and by Renat's answers of 18.11. Renat can object in «decided.note». */
export const DECIDED: string[] = [
  "Переходим до 2 декабря, пока Altegio не продлился ещё на месяц.",
  "Запись подтверждается сразу. Барбер сам открыл время, значит клиент записывается без подтверждения. В экстренном случае барбер может отменить запись.",
  "Время для записи как сейчас в Altegio: каждые 30 минут от начала дня барбера, записаться можно в последний момент.",
  "Сообщения клиентам как сейчас: SMS за 2 часа и письмо за 12 часов до визита, поздравление в день рождения, приглашение прийти снова после неявки. SMS идут через твой Messaggio.",
  "Без депозита и предоплаты, как сейчас.",
  "Особое время: барбер сам открывает вечер, выходной или обед по своей цене, например +20 €. Доплата целиком идёт барберу.",
  "Из Altegio переносим всё, что можно: клиентов с номерами, историю визитов, отзывы. Отзывы видны при записи, звёзды у каждого барбера.",
  "Счета барберам: PDF на почту. Нумерация продолжает Isolta, со счёта 423. Старые счета из Isolta переносим как историю.",
  "17 % барберу от продажи товара: от конечной цены с НДС, от обычной цены, даже если у товара скидка.",
  "Товар себе барбер берёт по закупочной цене с НДС, без 17 %.",
  "Барбер сам меняет свой график, отпуск и выходные, цены и время своих услуг.",
  "Уведомления барберам приходят в приложении барбера. Тебе: новая запись онлайн, перенос или отмена клиентом.",
  "Новую систему сначала пробуешь ты сам, барберов добавим потом.",
  "Сделаем табличку с QR-кодом для записи: одна на салон, на ресепшн.",
];
export const DECIDED_NOTE: Field = { id: "note", kind: "text", label: "Если что-то здесь не так, напиши" };

/** What we read in Altegio and Isolta ourselves (20.11.2026), so we do not ask. */
export const WE_READ: string[] = [
  "Altegio: барберы, услуги, цены, график, сообщения клиентам, настройки онлайн-записи, отчёты.",
  "Isolta: фирма, счета барберам, сроки оплаты, нумерация, как выглядит счёт.",
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
