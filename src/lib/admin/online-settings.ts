/**
 * «Настройки → Онлайн-запись»: how clients book online, as the salon's
 * Altegio sets it (docs/altegio-pages.md, Part 4 C «Онлайн-запись»:
 * settings/grid, settings/records, settings/master_step; Dim, decisions
 * round 15: copy it before the switch). Until now these lived in
 * businesses.settings with nobody to change them; this is the one place
 * that does.
 *
 *   slot_step_min      «Шаг»: the step of the start times, 5–120 minutes.
 *                      The slot type stays Altegio's «Оптимальный» (from
 *                      the start of the barber's day, plus a start where a
 *                      visit ends: src/lib/slots.ts). It is no choice here,
 *                      the page only says so. The phone journal and the
 *                      barber app snap to the same step.
 *   min_notice_min     «Время до начала визита»: how soon from now a client
 *                      may book; 0 is «Не выбрано».
 *   horizon_days       how many days ahead the booking page opens. A barber
 *                      may stop sooner, at his own «График до» (042).
 *   cancel_cutoff_min  «Перенос и отмена записи»: a client moves or cancels
 *                      online «Без ограничений» (0) or until so many whole
 *                      hours before the visit (src/lib/visits.ts canChange;
 *                      the visit page says it in hours).
 *   any_staff_on       «Любой специалист»: the booking page offers «Любой
 *                      свободный барбер»; off, /api/slots and the booking
 *                      refuse «anyone» too (availability.ts, booking.ts).
 *
 * **The right.** Altegio has no single right for these: its group
 * «Онлайн-запись» says the group's switch gives almost all online-booking
 * settings (docs/altegio-rights.md, § 13). So the switch of that group
 * (canGroup «online») is the door of the page and of its save; the one
 * right inside it, «Управление обработкой персональных данных», stays
 * locked. «Владелец» and «Менеджер» have the switch on, the front desk not.
 *
 * **One save**, as «Уведомления» does it: read against the settings as
 * they are, inside a transaction that holds the business row, every value
 * checked by readSettings' own limits; only what differs is written, with
 * one audit row (entity «business», action «settings», the changed keys
 * before and after), which «Изменения данных» shows.
 *
 * No Next.js here: the page, its action and the tests call the same code.
 * The keys, the options and the check of a value are online-form.ts, which
 * the form in the browser reads too (this file opens the database).
 */
import { canGroup, type Holder } from "../auth/rights";
import type { Business } from "../availability";
import { withTx } from "../db";
import { ONLINE_KEYS, onlineOf, validOnline, type OnlineKey } from "./online-form";

export { ONLINE_KEYS, onlineOf, validOnline, type OnlineKey, type OnlineSettings } from "./online-form";

/** May this login open the page and save it? The group «Онлайн-запись»'s own switch (see above). */
export const onlineMay = (user: Holder | null | undefined): boolean => canGroup(user, "online");

export type OnlineSaved = { ok: true; changed: OnlineKey[] } | { ok: false; field: string };

/**
 * Save what the page sent: any of the five keys, each checked; a key not
 * sent stays as it is. Refused whole when the login may not, or a value is
 * not of its kind (by the key's name). A save that changes nothing writes
 * nothing.
 */
export async function saveOnlineSettings(business: Pick<Business, "id">, user: Holder & { id: string }, input: Partial<Record<OnlineKey, unknown>>): Promise<OnlineSaved> {
  if (!onlineMay(user)) return { ok: false, field: "forbidden" };
  const asked = (input && typeof input === "object" ? input : {}) as Partial<Record<OnlineKey, unknown>>;
  const sent = ONLINE_KEYS.filter((k) => asked[k] !== undefined);
  for (const k of sent) if (!validOnline(k, asked[k])) return { ok: false, field: k };
  return withTx<OnlineSaved>(async (tx) => {
    const [row] = await tx<{ settings: unknown }>("select settings from businesses where id = $1 for update", [business.id]);
    if (!row) return { ok: false, field: "business" };
    const was = onlineOf(row.settings);
    const changed = sent.filter((k) => asked[k] !== was[k]);
    if (!changed.length) return { ok: true, changed: [] };
    const patch = Object.fromEntries(changed.map((k) => [k, asked[k]]));
    await tx("update businesses set settings = coalesce(settings, '{}'::jsonb) || $2::jsonb where id = $1", [business.id, JSON.stringify(patch)]);
    const before = Object.fromEntries(changed.map((k) => [k, was[k]]));
    await tx("insert into audit (actor, entity, entity_id, action, before, after) values ($1, 'business', $2, 'settings', $3::jsonb, $4::jsonb)", [
      user.id,
      business.id,
      JSON.stringify(before),
      JSON.stringify(patch),
    ]);
    return { ok: true, changed };
  });
}
