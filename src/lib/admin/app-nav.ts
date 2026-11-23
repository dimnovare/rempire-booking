/**
 * What the staff app's frame offers one login (docs/apps.md, «One app for
 * Renat»): the tabs of a phone's bottom bar and the rows of «Ещё». A tab or
 * a row the login has no right to is left out here; every page still asks
 * the same rights itself (src/lib/auth/rights.ts, `can`).
 *
 * No Next.js and no database: the layouts, the «Ещё» page and the tests
 * read the same lists.
 */
import { can, canGroup, type Holder } from "../auth/rights";
import { appKind } from "../auth/side";

/**
 * The sections and tiles a login has no right to, by the keys the menus
 * use (sections.tsx; «sale» is the tile «Продажа товара»).
 */
export function offFor(user: Holder): string[] {
  return [
    ...(["clients", "staff", "services"] as const).filter((g) => !canGroup(user, g)),
    // «График работы» goes with the section «Сотрудники», «Записи» with its own right
    ...(canGroup(user, "staff") ? [] : ["schedule"]),
    ...(can(user, "reports.bookings") ? [] : ["records"]),
    ...(can(user, "reports.reviews") ? [] : ["reviews"]),
    ...(can(user, "reports.dashboard") ? [] : ["analytics"]),
    ...(can(user, "reports.visits") ? [] : ["visits"]),
    // «Сообщения» with its own right; «Изменения данных» is the owner's alone (change-log.ts)
    ...(can(user, "reports.messages") ? [] : ["messages"]),
    ...(user.role === "owner" ? [] : ["changes"]),
    // «Настройки → Локация»: its three pages with «Доступ к настройкам локации»; with none left the group is not drawn
    ...(can(user, "settings.location") ? [] : ["brand", "contacts", "gallery"]),
    // «Уведомления» with «Доступ к разделу Типы уведомлений»
    ...(can(user, "notify.types") ? [] : ["notifications"]),
    ...(can(user, "visit.sell") && can(user, "visit.sell.create") ? [] : ["sale"]),
  ];
}

export type BarKey = "mine" | "calendar" | "clients" | "reports" | "invoices" | "more";

/**
 * A phone's bottom bar for an owner or the front desk, five tabs at most.
 * Linked to a barber: «Мой день» comes first and «Счета» goes behind
 * «Ещё». Not linked: the salon's four and «Ещё». A barber's own bar is the
 * barber app's (src/app/b/(app)/nav.tsx) and is not listed here.
 *
 * «Отчёты» is the phone's «Основные показатели» (/admin/analytics), with
 * that page's right; «Запросы» is a row of «Ещё» (Dim, decision round 11),
 * and its red dot is on «Ещё».
 */
export function barOf(user: Holder): BarKey[] {
  const off = offFor(user);
  const keys: BarKey[] = appKind(user) === "own" ? ["mine", "calendar", "clients", "reports", "more"] : ["calendar", "clients", "reports", "invoices", "more"];
  return keys.filter((k) => !off.includes(k === "reports" ? "analytics" : k));
}

/** Where each tab goes: «Мой день» is the barber app's own day (/b), the rest are the salon's pages. */
export const TAB_HREF: Record<BarKey, string> = {
  mine: "/b",
  calendar: "/admin",
  clients: "/admin/clients",
  reports: "/admin/analytics",
  invoices: "/admin/invoices",
  more: "/admin/more",
};

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

/**
 * The tab that is lit on a page. «Мой день» is his day and his week; every
 * page that has no tab of its own in this login's bar is behind «Ещё»: the
 * sections listed there, «Доступ», and the barber pages it opens (his time,
 * a sale, his sums, this device's notifications).
 */
export function litTab(path: string, bar: readonly BarKey[]): BarKey | null {
  if (!path) return null;
  const has = (k: BarKey) => (bar.includes(k) ? k : bar.includes("more") ? "more" : null);
  if (under(path, "/b")) return path === "/b" || under(path, "/b/week") ? has("mine") : has("more");
  if (path === "/admin") return has("calendar");
  for (const k of ["clients", "reports", "invoices"] as const) if (under(path, TAB_HREF[k])) return has(k);
  return under(path, "/admin") ? has("more") : null;
}

export type MineRow = "time" | "sell" | "money";
export type SalonRow = "staff" | "schedule" | "services" | "catalogue" | "analytics" | "records" | "reviews" | "visits" | "messages" | "changes" | "requests" | "invoices" | "notifications" | "sale";
export type SettingsRow = "brand" | "contacts" | "gallery";
export type AccountRow = "account" | "notify" | "language" | "logout";
export type MoreRows = { mine: MineRow[]; salon: SalonRow[]; settings: SettingsRow[]; account: AccountRow[] };

/** The salon's rows in the order of the sections (sections.tsx), «Продажа товара» last. */
const SALON: readonly SalonRow[] = ["staff", "schedule", "services", "catalogue", "analytics", "records", "reviews", "visits", "messages", "changes", "requests", "invoices", "notifications", "sale"];
/** The row a tab stands for: «Отчёты» is «Основные показатели». */
const TAB_ROW: Partial<Record<BarKey, SalonRow>> = { reports: "analytics", invoices: "invoices" };

/**
 * «Ещё», in four groups:
 *   - «Моё, как барбера», only for a login linked to a barber: his time,
 *     «Продать товар» (with the right to sell), his sums;
 *   - «Салон»: every section that has no tab of its own in this login's
 *     bar, each only with its right («Запросы» among them, and the salon's
 *     «Уведомления»: Dim, round 13, as the admin we follow), and «Продажа
 *     товара»;
 *   - «Настройки»: the salon's page on the booking site, «Бренд»,
 *     «Контакты», «Галерея», with the right to change it;
 *   - «Аккаунт»: the logins and rights, his own «Уведомления» (this
 *     device's pushes; the same name, as in the admin we follow), the
 *     language, the way out.
 */
export function moreOf(user: Holder): MoreRows {
  const off = offFor(user);
  const bar = barOf(user);
  const mine: MineRow[] = appKind(user) === "own" ? ["time", ...(can(user, "visit.sell") ? (["sell"] as const) : []), "money"] : [];
  const tabs = bar.map((k) => TAB_ROW[k]);
  const salon = SALON.filter((k) => !off.includes(k) && !tabs.includes(k));
  const settings = (["brand", "contacts", "gallery"] as const).filter((k) => !off.includes(k));
  return { mine, salon, settings, account: ["account", "notify", "language", "logout"] };
}
