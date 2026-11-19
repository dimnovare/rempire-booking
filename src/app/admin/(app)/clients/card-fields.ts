/**
 * What the two forms of a client's card hold, and how they are read from
 * the client (src/lib/admin/clients.ts). Shared by the page, which fills
 * them, the actions, which answer with them as saved, and the tabs.
 */
// only the type from the server module: this file is read in the browser too
import type { ClientDetail } from "@/lib/admin/clients";
import { birthdayText } from "@/lib/birthday";
import { CLIENT_KINDS, type ClientKind } from "@/lib/client-notify";
import type { Locale } from "@/lib/i18n";

/** The card's tabs, in their order; the first is the one a card opens on. */
export const TABS = ["card", "history", "stats", "messages", "send", "notify", "files"] as const;
export type TabKey = (typeof TABS)[number];
export const isTab = (t: unknown): t is TabKey => typeof t === "string" && (TABS as readonly string[]).includes(t);

/** A client was added, changed or deleted: the list behind the card asks for its page again. */
export const CLIENTS_CHANGED = "rb:clients-changed";

/** «Карточка клиента», the left column. Every field as it is typed. */
export type CardFields = {
  name: string;
  phone: string;
  phone2: string;
  email: string;
  /** «14.03.1990», or «14.03» when the year is not known */
  birthday: string;
  /** "", «male» or «female» */
  gender: string;
  /** "", «bronze», «silver» or «gold» */
  importance: string;
  cardNo: string;
  /** whole percent as typed; "" is 0. Stored and shown only: it changes no price */
  discount: string;
  locale: Locale;
  noOnline: boolean;
  note: string;
  labels: string[];
};

export function cardFieldsOf(d: ClientDetail): CardFields {
  return {
    name: d.name,
    phone: d.phone ?? "",
    phone2: d.phone2 ?? "",
    email: d.email ?? "",
    birthday: birthdayText(d.birthday),
    gender: d.gender ?? "",
    importance: d.importance ?? "",
    cardNo: d.cardNo,
    discount: d.discountPct ? String(d.discountPct) : "",
    locale: d.locale,
    noOnline: d.noOnline,
    note: d.note,
    labels: d.labels,
  };
}

/** «Уведомления»: `adsOff` is the tick «не отправлять»; a channel and a kind are true while he takes them. */
export type NotifyFields = { adsOff: boolean; sms: boolean; email: boolean; push: boolean; kinds: Record<ClientKind, boolean> };

export function notifyFieldsOf(d: ClientDetail): NotifyFields {
  return {
    adsOff: d.marketingOptOut,
    sms: !d.smsOptOut,
    email: !d.emailOptOut,
    push: !d.pushOptOut,
    kinds: Object.fromEntries(CLIENT_KINDS.map((k) => [k, !d.notifyOff.includes(k)])) as Record<ClientKind, boolean>,
  };
}
