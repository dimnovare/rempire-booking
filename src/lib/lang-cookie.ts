/**
 * The language last picked on this device, for the pages seen before a
 * login: both login pages (Русский · Eesti · English) and the admin's own
 * «Язык». One cookie for the whole site, so a barber who picked Eesti on
 * /admin/login also gets it on /b/login. After the login, users.locale rules.
 */
import { cookies } from "next/headers";
import { isLocale, type Locale } from "@/lib/i18n";

export const LANG_COOKIE = "rb_lang";
/** The admin's own cookie before 25.11.2026 (path /admin): still read, never written. */
const OLD_COOKIE = "adm_lang";

export async function pickedLang(): Promise<Locale | undefined> {
  const jar = await cookies();
  const v = jar.get(LANG_COOKIE)?.value ?? jar.get(OLD_COOKIE)?.value;
  return isLocale(v) ? v : undefined;
}

/** Keep the choice on this device. Server Actions only. */
export async function rememberLang(lang: Locale): Promise<void> {
  (await cookies()).set(LANG_COOKIE, lang, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
