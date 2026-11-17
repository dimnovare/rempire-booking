/**
 * The admin's language for this request. Each login has its own
 * (users.locale); before the login it is what was last picked on this
 * device (a cookie), and Russian if nothing was.
 */
import { cookies } from "next/headers";
import { cache } from "react";
import { currentStaffUser } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n";
import { COPY, type Copy } from "./copy";

const LANG_COOKIE = "adm_lang";

export const adminLang = cache(async (): Promise<Locale> => {
  const user = dbConfigured() ? await currentStaffUser() : null;
  if (user && isLocale(user.locale)) return user.locale;
  const picked = (await cookies()).get(LANG_COOKIE)?.value;
  return isLocale(picked) ? picked : DEFAULT_LOCALE;
});

/** The words for a server component. */
export async function getA(): Promise<Copy> {
  return COPY[await adminLang()];
}

/** Keep the choice on this device, for the login page. Server Actions only. */
export async function rememberLang(lang: Locale): Promise<void> {
  (await cookies()).set(LANG_COOKIE, lang, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 60 * 60 * 24 * 365,
  });
}
