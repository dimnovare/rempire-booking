/**
 * The admin's words, in three languages: Russian (Renat's, and the default),
 * Estonian and English. Each login has its own (users.locale; Dim,
 * 17.11.2026). copy.ru.ts is the reference shape.
 *
 * A client component takes its dictionary with useA() (lang.tsx), a server
 * component with `await getA()` (lang-server.ts). Never a module-level
 * constant: the language is known only per request.
 */
import type { Locale } from "@/lib/i18n";
import { en } from "./copy.en";
import { et } from "./copy.et";
import { ru } from "./copy.ru";

export type Copy = typeof ru;
export const COPY: Record<Locale, Copy> = { ru, et, en };

/** Each language by its own name, so it can be found from any of the others. */
export const LANG_NAMES: Record<Locale, string> = { ru: "Русский", et: "Eesti", en: "English" };

export { eur } from "./copy.shared";
