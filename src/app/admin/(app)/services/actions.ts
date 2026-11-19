"use server";

import { refresh } from "next/cache";
import { saveService } from "@/lib/admin/services";
import { requireAdmin } from "@/lib/auth/current";

export type ServiceForm = {
  name: { ru: string; et: string; en: string };
  durationMin: number;
  priceCents: number;
  priceMaxCents: number | null;
  bufferMin: number;
  online: boolean;
  active: boolean;
  allBarbers: boolean;
};

export async function saveServiceAction(id: string | null, f: ServiceForm): Promise<{ ok: true; id: string } | { ok: false; field: string }> {
  const { user, business } = await requireAdmin();
  const s = (v: unknown) => (v == null ? "" : String(v));
  const r = await saveService(
    business,
    id ? String(id) : null,
    {
      name: { ru: s(f?.name?.ru), et: s(f?.name?.et), en: s(f?.name?.en) },
      durationMin: Number(f?.durationMin),
      priceCents: Number(f?.priceCents),
      priceMaxCents: f?.priceMaxCents == null ? null : Number(f.priceMaxCents),
      bufferMin: Number(f?.bufferMin ?? 0),
      online: f?.online === true,
      active: f?.active === true,
      allBarbers: f?.allBarbers === true,
    },
    user.id,
    // the login: its rights are asked for what the save changes (src/lib/admin/services.ts)
    user,
  );
  if (r.ok) refresh();
  return r;
}
