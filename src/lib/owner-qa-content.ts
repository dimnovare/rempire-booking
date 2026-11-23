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
 * Set 4, 23.11.2026, reworked the same day on Dim's notes: no switch date
 * is agreed with Renat, so none is stated; Renat is only told to check and
 * decide on Altegio and Isolta himself (a year, or 1-2 months while Dim is
 * away). «switch» gives way to «subs», then «site» (where the booking
 * moves), «access» (one place, fewer logins), «export» (Altegio mails its
 * export only to the owner) and «payer». Messaggio's login, the barbers'
 * e-mails and access come later: LATER. The down alert goes to Renat after
 * the switch: DECIDED. Logins and passwords are never asked here.
 *
 * 23.11.2026 evening (Dim): «payer» asks which side the accounts move to
 * (the salon, rempire.ee, or the shop, rempireshop.com), not who pays; «app»
 * and «place» are settled (no client app of our own, the installable page
 * is enough; another business, tattoo or other, is added when Renat wants
 * it) and left for DECIDED; «extra» left (answered 18.11, kickoff decision
 * 37). Renat's note under DECIDED of 18.11 is in DECIDED itself (the 17 %
 * lines), so the note field is new («decided.more») and starts empty.
 *
 * Each field saves on its own («subs.altegio», «extra.note»…). The page sends
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
  "Ренат, здесь 11 коротких вопросов о новой системе записи. Первые пять хорошо бы до 29 ноября: " +
  "с 30 ноября по 13 декабря Дима в отъезде. Остальные могут подождать. " +
  "Что ты уже ответил, внизу, в «Уже решено». " +
  "Ответы сохраняются сами: можно закрыть страницу, вернуться и дописать. Логины и пароли здесь не пиши.";

/** One choice for each subscription in «subs». */
const TERM = ["На год", "На 1–2 месяца", "Ещё не решил"];

export const QUESTIONS: Question[] = [
  /* Dim, 23.11: inform only; Renat checks and decides himself. */
  {
    id: "subs",
    title: "Altegio и Isolta",
    lead:
      "Altegio и Isolta продлеваются сами. Проверь и реши сам, продлевать ли их на год. " +
      "Дима будет в отъезде с 30 ноября по 13 декабря, поэтому, может быть, хватит ещё 1–2 месяцев, " +
      "а потом перейдём на новую систему.",
    fields: [
      { id: "altegio", kind: "one", label: "Altegio:", options: TERM },
      { id: "isolta", kind: "one", label: "Isolta:", options: TERM },
    ],
  },
  {
    id: "site",
    title: "Где будет онлайн-запись",
    lead:
      "Когда всё проверим, онлайн-запись переедет на постоянный адрес. " +
      "Если на rempire.ee, например book.rempire.ee, тогда понадобится доступ к настройкам домена rempire.ee. " +
      "Можно и без доступа: тот, кто ведёт сайт, сам добавит две строчки по нашей инструкции. " +
      "Или запись будет на адресе магазина, а rempire.ee и Google Карты просто ведут на неё.",
    fields: [
      {
        id: "where",
        kind: "one",
        label: "Запись будет:",
        options: ["На rempire.ee", "На адресе магазина rempireshop.com", "Не знаю, обсудим"],
      },
    ],
  },
  {
    id: "access",
    title: "Google Карты",
    lead:
      "Чтобы всё было в одном месте и логинов было меньше, позже понадобится доступ к Google-аккаунту салона: " +
      "там профиль на Google Картах, туда поставим кнопку «Записаться». Сейчас ничего не нужно.",
    fields: [
      {
        id: "google",
        kind: "one",
        label: "Доступ к этому аккаунту у тебя есть?",
        options: ["Да", "Нет, он у другого человека", "Не знаю"],
      },
    ],
  },
  {
    id: "export",
    title: "Клиенты и записи из Altegio",
    lead:
      "Клиентов и записи из Altegio мы сами выгрузить не можем: файл выгрузки Altegio отправляет только владельцу, " +
      "тебе на почту. Нужны две выгрузки в Excel: клиенты и все записи. Перешли эти письма Диме. " +
      "По ним проверим перенос, а перед самым переходом попросим ещё раз, свежие.",
    fields: [{ id: "done", kind: "one", label: "Выгрузил и переслал?", options: ["Да, переслал", "Сделаю", "Не нашёл, как выгрузить"] }],
  },
  /* Dim, 23.11 evening: the accounts move to Renat anyway; which side is the question */
  {
    id: "payer",
    title: "На кого перевести аккаунты",
    lead:
      "Сервер, база данных и почта новой системы сейчас на аккаунтах Димы. Позже всё переведём на тебя. " +
      "Нужно понять, к чему их привязать: к салону, rempire.ee, или к магазину, rempireshop.com.",
    fields: [{ id: "side", kind: "one", label: "Аккаунты:", options: ["К салону, rempire.ee", "К магазину, rempireshop.com", "Обсудим"] }],
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
];

/** Settled by Dim (17.11 and 20.11.2026) and by Renat's answers of 18.11. Renat can object in «decided.note». */
export const DECIDED: string[] = [
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
  "Если после перехода онлайн-запись перестанет работать, система сразу напишет тебе: тогда можно попросить клиентов звонить.",
  "Отдельного приложения для клиентов не делаем. Клиенты записываются по ссылке, с сайта или из Google Карт; кто хочет, сохраняет страницу записи на телефон как приложение.",
  "Тату-студию или любое другое направление можно будет добавить в систему отдельно, со своими мастерами, услугами и онлайн-записью, когда понадобится.",
];
/** A new id on 23.11: Renat's note of 18.11 («decided.note», the 17 % lines) is in DECIDED already. */
export const DECIDED_NOTE: Field = { id: "more", kind: "text", label: "Если что-то здесь не так, напиши" };

/** Asked when the work gets there, not now (Dim, 23.11). */
export const LATER: string[] = [
  "Логин Messaggio: попросим, когда дойдём до проверки SMS. Логины и пароли говори Диме лично, не здесь.",
  "Почта барберов: когда всё проверим. По ней барберы будут входить в своё приложение.",
  "Доступ к Google-аккаунту салона и, если запись будет на rempire.ee, к настройкам этого домена.",
];

/** What we read in Altegio and Isolta ourselves (20.11.2026), so we do not ask. */
export const WE_READ: string[] = [
  "Altegio: барберы, услуги, цены, график, сообщения клиентам, настройки онлайн-записи, отчёты.",
  "Isolta: фирма, счета барберам, сроки оплаты, нумерация, как выглядит счёт.",
];

/** Every field the page may save, by its full key. */
export const FIELDS: ReadonlyMap<string, Field> = new Map([
  ...QUESTIONS.flatMap((q) => q.fields.map((f) => [`${q.id}.${f.id}`, f] as const)),
  [`decided.${DECIDED_NOTE.id}`, DECIDED_NOTE] as const,
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
