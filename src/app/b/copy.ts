/**
 * The barber app's words, in three languages (each login has its own,
 * users.locale), the same way as the admin's. copy.ru.ts is the reference
 * shape. A client component takes its dictionary with useB() (lang.tsx), a
 * server component with COPY[ctx.user.locale] (lang-server.ts).
 */
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n";
import { en } from "./copy.en";
import { et } from "./copy.et";
import { ru, type Copy } from "./copy.ru";

export type { Copy };
export const COPY: Record<Locale, Copy> = { ru, et, en };

/** Each language by its own name, so it can be found from any of the others. */
export const LANG_NAMES: Record<Locale, string> = { ru: "Русский", et: "Eesti", en: "English" };

export const copyFor = (lang: unknown): Copy => COPY[isLocale(lang) ? lang : DEFAULT_LOCALE];
