/**
 * The login page's words, one set for both apps (the admin, /admin/login,
 * and the barber app, /b/login): they are one page (Dim, 25.11.2026, design
 * artifact 53PfD3DxCRkbDyjwLVvBHB, «Вход»). RU is the reference shape.
 *
 * Who answers is never named: «владелец салона», not a person.
 */
import type { Locale } from "@/lib/i18n";

export type LoginError =
  | "bad"
  | "badCode"
  | "expired"
  | "wait"
  | "waitCode"
  | "noEmail"
  | "mailFailed"
  | "noDb"
  | "role"
  | "roleB"
  | "nostaff"
  | "google"
  | "googleUnknown"
  | "googleOther";

const ru = {
  title: "Вход",
  lead: "Приложение барбера",
  method: "Способ входа",
  tabCode: "Код из письма",
  tabPassword: "Пароль",
  email: "E-mail",
  password: "Пароль",
  show: "Показать пароль",
  code: "Код из письма",
  sendCode: "Прислать код",
  codeHint: "Код придёт на e-mail и действует 10 минут. Пароль не нужен.",
  sentTo: "Если такой вход есть, код ушёл на",
  sentValid: "Он действует 10 минут.",
  otherEmail: "Другой e-mail",
  resendIn: (t: string) => `Прислать код ещё раз можно через ${t}`,
  resend: "Прислать код ещё раз",
  enter: "Войти",
  sending: "Отправляю…",
  entering: "Вхожу…",
  forgot: "Забыли пароль? Войдите по коду",
  or: "или",
  google: "Войти через Google",
  googleHint: "В приложении на iPhone Google может открыться в Safari. Надёжнее войти по коду.",
  lang: "Язык",
  install: "Как установить на телефон",
  toBarber: "Открыть приложение барбера",
  err: {
    bad: "Неверный e-mail или пароль.",
    badCode: "Неверный код.",
    expired: "Код больше не действует. Пришлите новый.",
    wait: "Слишком много попыток. Подождите 15 минут.",
    waitCode: "Слишком много писем. Попробуйте через час.",
    noEmail: "Вход по коду пока не настроен: почта ещё не подключена. Войдите по паролю.",
    mailFailed: "Письмо не ушло. Попробуйте позже или войдите по паролю.",
    noDb: "База данных не подключена.",
    role: "У этого входа нет доступа к админке.",
    roleB: "У этого входа нет доступа к приложению барбера.",
    nostaff: "Этот вход не привязан к барберу. Попросите владельца салона привязать его в разделе «Доступ».",
    google: "Не получилось войти через Google. Попробуйте ещё раз или войдите по коду.",
    googleUnknown: "Для этого Google-аккаунта нет входа. Попросите владельца салона добавить ваш e-mail в разделе «Доступ».",
    googleOther: "Этот вход уже связан с другим Google-аккаунтом.",
  } as Record<LoginError, string>,
};

export type LoginWords = typeof ru;

const et: LoginWords = {
  title: "Sisselogimine",
  lead: "Barberi rakendus",
  method: "Sisselogimise viis",
  tabCode: "Kood e-kirjast",
  tabPassword: "Parool",
  email: "E-post",
  password: "Parool",
  show: "Näita parooli",
  code: "Kood e-kirjast",
  sendCode: "Saada kood",
  codeHint: "Kood tuleb e-postile ja kehtib 10 minutit. Parooli pole vaja.",
  sentTo: "Kui selline kasutaja on olemas, läks kood aadressile",
  sentValid: "See kehtib 10 minutit.",
  otherEmail: "Muu e-post",
  resendIn: (t) => `Uue koodi saab saata ${t} pärast`,
  resend: "Saada kood uuesti",
  enter: "Logi sisse",
  sending: "Saadan…",
  entering: "Login sisse…",
  forgot: "Unustasite parooli? Logige sisse koodiga",
  or: "või",
  google: "Logi sisse Google'iga",
  googleHint: "iPhone'i rakenduses võib Google avaneda Safaris. Kindlam on logida sisse koodiga.",
  lang: "Keel",
  install: "Kuidas telefoni paigaldada",
  toBarber: "Ava barberi rakendus",
  err: {
    bad: "Vale e-post või parool.",
    badCode: "Vale kood.",
    expired: "Kood enam ei kehti. Saatke uus.",
    wait: "Liiga palju katseid. Oodake 15 minutit.",
    waitCode: "Liiga palju kirju. Proovige tunni aja pärast.",
    noEmail: "Koodiga sisselogimine ei ole veel seadistatud: e-post pole ühendatud. Logige sisse parooliga.",
    mailFailed: "Kiri ei läinud teele. Proovige hiljem või logige sisse parooliga.",
    noDb: "Andmebaas ei ole ühendatud.",
    role: "Sellel kasutajal ei ole adminni ligipääsu.",
    roleB: "Sellel kasutajal ei ole barberi rakenduse ligipääsu.",
    nostaff: "See kasutaja ei ole barberiga seotud. Paluge salongi omanikul see jaotises «Ligipääs» siduda.",
    google: "Google'iga sisselogimine ei õnnestunud. Proovige uuesti või logige sisse koodiga.",
    googleUnknown: "Selle Google'i kontoga sisselogimist ei ole. Paluge salongi omanikul lisada teie e-post jaotises «Ligipääs».",
    googleOther: "See sisselogimine on juba seotud teise Google'i kontoga.",
  },
};

const en: LoginWords = {
  title: "Log in",
  lead: "Barber app",
  method: "How to log in",
  tabCode: "Code by e-mail",
  tabPassword: "Password",
  email: "E-mail",
  password: "Password",
  show: "Show the password",
  code: "Code from the e-mail",
  sendCode: "Send the code",
  codeHint: "The code comes by e-mail and works for 10 minutes. No password needed.",
  sentTo: "If that login exists, the code went to",
  sentValid: "It works for 10 minutes.",
  otherEmail: "Other e-mail",
  resendIn: (t) => `You can send a new code in ${t}`,
  resend: "Send the code again",
  enter: "Log in",
  sending: "Sending…",
  entering: "Logging in…",
  forgot: "Forgot the password? Log in with a code",
  or: "or",
  google: "Log in with Google",
  googleHint: "In the iPhone app, Google may open in Safari. A code is more reliable.",
  lang: "Language",
  install: "How to install it on your phone",
  toBarber: "Open the barber app",
  err: {
    bad: "Wrong e-mail or password.",
    badCode: "Wrong code.",
    expired: "The code no longer works. Send a new one.",
    wait: "Too many tries. Wait 15 minutes.",
    waitCode: "Too many e-mails. Try again in an hour.",
    noEmail: "Login by code is not set up yet: e-mail is not connected. Log in with a password.",
    mailFailed: "The e-mail did not go out. Try later or log in with a password.",
    noDb: "No database connected.",
    role: "This login has no access to the admin.",
    roleB: "This login has no access to the barber app.",
    nostaff: "This login is not linked to a barber. Ask the salon's owner to link it under «Access».",
    google: "Could not log in with Google. Try again or log in with a code.",
    googleUnknown: "There is no login for this Google account. Ask the salon's owner to add your e-mail under «Access».",
    googleOther: "This login is already linked to another Google account.",
  },
};

export const LOGIN: Record<Locale, LoginWords> = { ru, et, en };

/** Reasons other pages send to a login page as ?e=… (requireAdmin / requireStaff, the Google callback). */
export const LINK_ERRORS = ["role", "nostaff", "bad", "google", "googleUnknown", "googleOther"] as const;
