"use server";

/** The barber pages' changes. Each checks the login itself and copies its arguments by name. */
import { refresh } from "next/cache";
import { PHOTO_MAX_BYTES, addSpecialTime, removeSpecialTime, saveStaffOffers, saveStaffPhoto, saveStaffProfile, saveWeeklyHours, setDayOverride, type OfferInput } from "@/lib/admin/staff";
import { addTimeOff, removeTimeOff } from "@/lib/admin/visits";
import { requireAdmin } from "@/lib/auth/current";

type Result = { ok: true } | { ok: false; field: string };
const str = (v: unknown) => (v == null ? "" : String(v));
const l10n = (v: unknown) => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { ru: str(o.ru), et: str(o.et), en: str(o.en) };
};

export async function saveProfile(id: string | null, p: { name: string; role: { ru: string; et: string; en: string }; photoUrl: string; bookable: boolean; active: boolean }): Promise<{ ok: true; id: string } | { ok: false; field: string }> {
  const { user, business } = await requireAdmin();
  const r = await saveStaffProfile(
    business,
    id ? String(id) : null,
    { name: str(p?.name), role: l10n(p?.role), photoUrl: str(p?.photoUrl), bookable: p?.bookable === true, active: p?.active === true },
    user.id,
  );
  if (r.ok) refresh();
  return r;
}

/** A barber's portrait: one image in the form's «photo» field, already shrunk by the browser. Returns the link to show. */
export async function uploadPhoto(staffId: string, form: FormData): Promise<{ ok: true; url: string } | { ok: false; field: string }> {
  const { user, business } = await requireAdmin();
  const file = form?.get?.("photo");
  if (!(file instanceof Blob) || file.size < 1 || file.size > PHOTO_MAX_BYTES) return { ok: false, field: "photo" };
  const r = await saveStaffPhoto(business, String(staffId), new Uint8Array(await file.arrayBuffer()), user.id);
  if (r.ok) refresh();
  return r;
}

export async function saveOffers(staffId: string, offers: OfferInput[]): Promise<Result> {
  const { user, business } = await requireAdmin();
  const list = (Array.isArray(offers) ? offers : []).slice(0, 200).map((o) => ({
    serviceId: str(o?.serviceId),
    offered: o?.offered === true,
    priceCents: o?.priceCents == null ? null : Number(o.priceCents),
    durationMin: o?.durationMin == null ? null : Number(o.durationMin),
  }));
  const r = await saveStaffOffers(business, String(staffId), list, user.id);
  if (r.ok) refresh();
  return r;
}

export async function saveHours(staffId: string, days: Record<number, [string, string][]>): Promise<Result> {
  const { user, business } = await requireAdmin();
  const clean: Record<number, unknown> = {};
  for (let wd = 1; wd <= 7; wd++) clean[wd] = Array.isArray(days?.[wd]) ? days[wd] : [];
  const r = await saveWeeklyHours(business, String(staffId), clean, user.id);
  if (r.ok) refresh();
  return r;
}

export async function saveDay(staffId: string, date: string, spans: [string, string][] | null, note: string): Promise<Result> {
  const { user, business } = await requireAdmin();
  const r = await setDayOverride(business, String(staffId), String(date), spans === null ? null : Array.isArray(spans) ? spans : [], str(note), user.id);
  if (r.ok) refresh();
  return r;
}

export async function addOff(b: { staffId: string; from: number; to: number; kind: string; note: string }): Promise<Result & { visitsInside?: number }> {
  const { user, business } = await requireAdmin();
  const r = await addTimeOff(business, { staffId: str(b?.staffId), from: Number(b?.from), to: Number(b?.to), kind: str(b?.kind), note: str(b?.note) }, user.id);
  if (!r.ok) return r;
  refresh();
  return { ok: true, visitsInside: r.visitsInside };
}

export async function removeOff(id: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const ok = await removeTimeOff(business, String(id), user.id);
  if (ok) refresh();
  return ok;
}

export async function addSpecial(s: { staffId: string; from: number; to: number; extraCents: number; note: string }): Promise<Result> {
  const { user, business } = await requireAdmin();
  const r = await addSpecialTime(business, { staffId: str(s?.staffId), from: Number(s?.from), to: Number(s?.to), extraCents: Number(s?.extraCents), note: str(s?.note) }, user.id);
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

export async function removeSpecial(id: string): Promise<boolean> {
  const { user, business } = await requireAdmin();
  const ok = await removeSpecialTime(business, String(id), user.id);
  if (ok) refresh();
  return ok;
}
