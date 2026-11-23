/**
 * The salon's phone and address for the error pages only: they show when
 * the database can't be read, so they can't ask «Настройки → Контакты»
 * for the live numbers. Everywhere else the contacts come from there.
 * If Renat changes the main number, change it here too
 * (docs/test-plan.md § 11).
 */
export const SALON_FALLBACK = {
  name: "REMPIRE",
  phone: "+372 5623 7237",
  tel: "+37256237237",
  address: "Mardi 1, 10145 Tallinn",
} as const;
