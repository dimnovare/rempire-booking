/**
 * The admin's language for this request. Each login has its own
 * (users.locale); before the login it is what was last picked on this
 * device (src/lib/lang-cookie.ts), and Russian if nothing was.
 */
import { cache } from "react";
import { currentStaffUser } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n";
import { pickedLang } from "@/lib/lang-cookie";
import { COPY, type Copy } from "./copy";

export const adminLang = cache(async (): Promise<Locale> => {
  const user = dbConfigured() ? await currentStaffUser() : null;
  if (user && isLocale(user.locale)) return user.locale;
  return (await pickedLang()) ?? DEFAULT_LOCALE;
});

/** The words for a server component. */
export async function getA(): Promise<Copy> {
  return COPY[await adminLang()];
}
