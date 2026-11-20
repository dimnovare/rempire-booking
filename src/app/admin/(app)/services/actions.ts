"use server";

/**
 * «Услуги»: the window's «Сохранить», the table's two in-place changes (the
 * online switch and the price) and a category's pencil. Each checks the
 * login itself and copies its arguments by name; the rights are asked by
 * src/lib/admin/services.ts, which is handed the login.
 */
import { refresh } from "next/cache";
import { renameCategory, saveService, setServiceOnline, setServicePrice, type SaveResult } from "@/lib/admin/services";
import { requireAdmin } from "@/lib/auth/current";

export type ServiceForm = {
  name: { ru: string; et: string; en: string };
  durationMin: number;
  priceCents: number;
  priceMaxCents: number | null;
  bufferMin: number;
  online: boolean;
  active: boolean;
  /** a new service without a barbers' list: every working barber does it */
  allBarbers: boolean;
  /** one of the categories, a new one by its name, or none; left out, it stays */
  category?: { id: string } | { name: { ru: string; et: string; en: string } } | null;
  /** the window's barbers: whether each does it, his price and time as shown */
  barbers?: { staffId: string; offered: boolean; priceCents: number; durationMin: number }[];
};

type Result = { ok: true } | { ok: false; field: string };
const s = (v: unknown) => (v == null ? "" : String(v));
const l10n = (v: unknown) => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { ru: s(o.ru), et: s(o.et), en: s(o.en) };
};

export async function saveServiceAction(id: string | null, f: ServiceForm): Promise<SaveResult> {
  const { user, business } = await requireAdmin();
  const c = f?.category;
  const category = c === undefined ? undefined : c === null ? null : typeof c === "object" && "id" in c ? { id: s(c.id) } : { name: l10n((c as { name?: unknown })?.name) };
  const r = await saveService(
    business,
    id ? String(id) : null,
    {
      name: l10n(f?.name),
      durationMin: Number(f?.durationMin),
      priceCents: Number(f?.priceCents),
      priceMaxCents: f?.priceMaxCents == null ? null : Number(f.priceMaxCents),
      bufferMin: Number(f?.bufferMin ?? 0),
      online: f?.online === true,
      active: f?.active === true,
      allBarbers: f?.allBarbers === true,
      category,
      barbers: Array.isArray(f?.barbers)
        ? f.barbers.slice(0, 200).map((b) => ({ staffId: s(b?.staffId), offered: b?.offered === true, priceCents: Number(b?.priceCents), durationMin: Number(b?.durationMin) }))
        : undefined,
    },
    user.id,
    // the login: its rights are asked for what the save changes
    user,
  );
  if (r.ok) refresh();
  return r;
}

/** «Онлайн-запись» in the table: at once. */
export async function setOnlineAction(id: string, online: boolean): Promise<Result> {
  const { user, business } = await requireAdmin();
  const r = await setServiceOnline(business, s(id), online === true, user.id, user);
  if (r.ok) refresh();
  return r;
}

/** «Цена» in the table: the base price, typed in place. */
export async function setPriceAction(id: string, priceCents: number): Promise<Result> {
  const { user, business } = await requireAdmin();
  const r = await setServicePrice(business, s(id), Number(priceCents), user.id, user);
  if (r.ok) refresh();
  return r;
}

/** A category's pencil: its name in the login's language. */
export async function renameCategoryAction(id: string, lang: string, text: string): Promise<Result> {
  const { user, business } = await requireAdmin();
  const l = lang === "et" || lang === "en" ? lang : "ru";
  const r = await renameCategory(business, s(id), l, s(text), user.id, user);
  if (r.ok) refresh();
  return r;
}
