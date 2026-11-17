"use server";

/**
 * «Моё время» (B4): the barber's own breaks, days off, special time, weekly
 * hours and prices. Each action asks requireStaff() for the one column this
 * login may change and builds its own input from plain strings and numbers;
 * the rules and Renat's switches are src/lib/barber/requests.ts.
 */
import { refresh } from "next/cache";
import { requireStaff } from "@/lib/auth/current";
import {
  barberAddSpecial,
  barberRemoveSpecial,
  barberRemoveTimeOff,
  barberSetHours,
  barberSetPrice,
  barberTimeOff,
  barberWithdraw,
  type ChangeCode,
  type ChangeResult,
  type TimeOffInput,
  type Who,
} from "@/lib/barber/requests";
import { sendPushSoon } from "@/lib/outbox";

const s = (v: unknown, max = 40) => String(v ?? "").slice(0, max);
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : NaN);

async function ctx() {
  const c = await requireStaff();
  const who: Who = { userId: c.user.id, staffId: c.staff.id, staffName: c.staff.name, viewing: c.viewing };
  return { business: c.business, who };
}

function after<T extends { ok: boolean }>(r: T): T {
  if (r.ok) {
    refresh();
    sendPushSoon();
  }
  return r;
}

export async function addOff(input: { offKind: string; date?: string; start?: string; end?: string; fromDate?: string; toDate?: string; note?: string }): Promise<ChangeResult> {
  const { business, who } = await ctx();
  const kind = s(input?.offKind);
  const clean: TimeOffInput | null =
    kind === "block"
      ? { offKind: "block", date: s(input.date), start: s(input.start), end: s(input.end), note: s(input.note, 300) }
      : kind === "vacation" || kind === "sick"
        ? { offKind: kind, fromDate: s(input.fromDate), toDate: s(input.toDate), note: s(input.note, 300) }
        : null;
  if (!clean) return { ok: false, code: "invalid" };
  return after(await barberTimeOff(business, who, clean));
}

export async function removeOff(id: string): Promise<{ ok: true } | { ok: false; code: ChangeCode }> {
  const { business, who } = await ctx();
  return after(await barberRemoveTimeOff(business, who, s(id)));
}

export async function addSpecial(input: { date: string; start: string; end: string; extraCents: number; weeks: number; note?: string }): Promise<ChangeResult> {
  const { business, who } = await ctx();
  return after(
    await barberAddSpecial(business, who, {
      date: s(input?.date),
      start: s(input?.start),
      end: s(input?.end),
      extraCents: int(input?.extraCents),
      weeks: int(input?.weeks),
      note: s(input?.note, 300),
    }),
  );
}

export async function removeSpecial(id: string): Promise<{ ok: true } | { ok: false; code: ChangeCode }> {
  const { business, who } = await ctx();
  return after(await barberRemoveSpecial(business, who, s(id)));
}

export async function setHours(days: Record<string, [string, string][]>): Promise<ChangeResult> {
  const { business, who } = await ctx();
  const clean: Record<string, [string, string][]> = {};
  for (let wd = 1; wd <= 7; wd++) {
    const spans = days?.[String(wd)];
    clean[String(wd)] = Array.isArray(spans) ? spans.slice(0, 6).map((x) => [s(Array.isArray(x) ? x[0] : ""), s(Array.isArray(x) ? x[1] : "")]) : [];
  }
  return after(await barberSetHours(business, who, clean));
}

export async function setPrice(input: { serviceId: string; priceCents: number; durationMin: number }): Promise<ChangeResult> {
  const { business, who } = await ctx();
  return after(await barberSetPrice(business, who, { serviceId: s(input?.serviceId), priceCents: int(input?.priceCents), durationMin: int(input?.durationMin) }));
}

export async function withdraw(id: string): Promise<boolean> {
  const { business, who } = await ctx();
  const ok = await barberWithdraw(business, who, s(id));
  if (ok) refresh();
  return ok;
}
