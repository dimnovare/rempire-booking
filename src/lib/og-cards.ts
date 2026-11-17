/** The link-preview cards' words (drawn by src/lib/og.tsx). */
export const OG_SIZE = { width: 1200, height: 630 };

export const OG_CARDS = {
  ru: { lines: ["Онлайн-", "запись"], band: "Mardi 1, Tallinn", alt: "REMPIRE: онлайн-запись" },
  et: { lines: ["Broneeri", "aeg"], band: "Mardi 1, Tallinn", alt: "REMPIRE: broneeri aeg" },
  en: { lines: ["Book", "a visit"], band: "Mardi 1, Tallinn", alt: "REMPIRE: book a visit" },
  qa: { lines: ["Вопросы", "по новой системе"], band: "Ответы сохраняются сами", alt: "REMPIRE: вопросы по новой системе записи" },
} as const;
export type OgCard = keyof typeof OG_CARDS;
export const isOgCard = (s: string): s is OgCard => Object.hasOwn(OG_CARDS, s);
