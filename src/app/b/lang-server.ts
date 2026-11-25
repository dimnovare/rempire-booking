/**
 * The barber app's language for this request: the login's own
 * (users.locale); before the login, the one picked on this device's login
 * page (src/lib/lang-cookie.ts), else the phone's language.
 */
import { headers } from "next/headers";
import { cache } from "react";
import { currentStaffUser } from "@/lib/auth/current";
import { dbConfigured } from "@/lib/db";
import { isLocale, pickLocale, type Locale } from "@/lib/i18n";
import { pickedLang } from "@/lib/lang-cookie";
import { COPY, type Copy } from "./copy";

export const barberLang = cache(async (): Promise<Locale> => {
  const user = dbConfigured() ? await currentStaffUser() : null;
  if (user && isLocale(user.locale)) return user.locale;
  return (await pickedLang()) ?? pickLocale((await headers()).get("accept-language"));
});

export async function getB(): Promise<Copy> {
  return COPY[await barberLang()];
}
