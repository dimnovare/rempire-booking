"use client";

/**
 * «Новый получатель» and «Редактировать получателя»: one window with the
 * receiver's details and one «Сохранить», as the invoicing tool's contact
 * window. What a receiver is and what is checked: src/lib/billing/parties.ts.
 */
import { useState } from "react";
import { cleanPhone } from "@/lib/admin/location-form";
import type { Receiver } from "@/lib/billing/parties";
import { useA } from "../../../lang";
import { saveReceiverAction } from "../actions";
import { Dialog, Field } from "../ui";

export type Opt = { id: string; name: string };
type Draft = { staffId: string; issuerId: string; kind: string; legalName: string; regCode: string; vatNumber: string; address: string; email: string; phone: string; vatMode: string; termsDays: string; locale: string; active: boolean };

const draftOf = (r?: Receiver | null, staffId = ""): Draft => ({
  staffId: r ? (r.staffId ?? "") : staffId,
  issuerId: r?.issuerId ?? "",
  kind: r?.kind ?? "fie",
  legalName: r?.legalName ?? "",
  regCode: r?.regCode ?? "",
  vatNumber: r?.vatNumber ?? "",
  address: r?.address ?? "",
  email: r?.email ?? "",
  phone: r?.phone ?? "",
  vatMode: r?.vatMode ?? "vat",
  termsDays: String(r?.termsDays ?? 14), // Isolta's default term
  locale: r?.locale ?? "et",
  active: r?.active ?? true,
});

function wrong(A: ReturnType<typeof useA>, d: Draft): string | null {
  if (!d.legalName.trim()) return A.inv.bad("legalName");
  if (d.kind !== "person" && !/^\d{6,12}$/.test(d.regCode.trim())) return A.inv.bad("regCode");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return A.inv.bad("email");
  // as the salon's own numbers are checked: a plausible number, +372 when typed without a code
  if (cleanPhone(d.phone) === null) return A.inv.bad("phone");
  const t = Number(d.termsDays);
  if (!Number.isInteger(t) || t < 0 || t > 120) return A.inv.bad("termsDays");
  return null;
}

export function ReceiverDialog({ receiver, defaultStaff = "", staff, issuers, onClose, onSaved }: { receiver?: Receiver | null; defaultStaff?: string; staff: (Opt & { active: boolean })[]; issuers: Opt[]; onClose: () => void; onSaved: (id: string) => void }) {
  const A = useA();
  const [d, setD] = useState<Draft>(() => draftOf(receiver, defaultStaff));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = receiver?.id ?? null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });

  const save = async () => {
    const w = wrong(A, d);
    if (w) return setErr(w);
    setBusy(true);
    setErr(null);
    try {
      const r = await saveReceiverAction(id, {
        staffId: d.staffId || null,
        issuerId: d.issuerId || null,
        kind: d.kind,
        legalName: d.legalName,
        regCode: d.regCode,
        vatNumber: d.vatNumber,
        address: d.address,
        email: d.email,
        phone: d.phone,
        vatMode: d.vatMode,
        termsDays: Number(d.termsDays),
        locale: d.locale,
        active: d.active,
      });
      if (r.ok) return onSaved(r.id);
      setErr(A.inv.bad(r.field));
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  return (
    <Dialog
      title={id ? A.inv.rcv.editTitle : A.inv.newReceiver}
      onClose={() => !busy && onClose()}
      foot={
        <button type="submit" form="rcv-form" className="iv-btn is-main" disabled={busy}>
          {id ? A.save : A.inv.addReceiver}
        </button>
      }
    >
      <form
        id="rcv-form"
        className="iv-fs"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="iv-seg" role="group" aria-label={A.inv.rcv.kind}>
          {(["fie", "ou", "person"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={d.kind === k} onClick={() => set("kind", k)}>
              {A.inv.kinds[k]}
            </button>
          ))}
        </div>
        <div className="iv-fields">
          <Field label={A.inv.legalName} className="is-all">
            <input required maxLength={160} value={d.legalName} onChange={(e) => set("legalName", e.target.value)} />
          </Field>
          <Field label={A.inv.regCode}>
            <input inputMode="numeric" maxLength={12} required={d.kind !== "person"} value={d.regCode} onChange={(e) => set("regCode", e.target.value)} />
          </Field>
          <Field label={A.inv.vatNumber}>
            <input maxLength={20} placeholder="EE…" value={d.vatNumber} onChange={(e) => set("vatNumber", e.target.value.toUpperCase())} />
          </Field>
          <Field label={A.inv.address} className="is-all">
            <input maxLength={300} value={d.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label={A.inv.email} className="is-all">
            <input type="email" required maxLength={254} value={d.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          {/* Isolta's contact has «Номер телефона» (migration 044); not printed on the invoice */}
          <Field label={A.inv.phone} className="is-all">
            <input type="tel" inputMode="tel" autoComplete="off" maxLength={40} placeholder="+372…" value={d.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label={A.inv.vatMode}>
            <select value={d.vatMode} onChange={(e) => set("vatMode", e.target.value)}>
              <option value="vat">{A.inv.vatOn}</option>
              <option value="none">{A.inv.vatOff}</option>
            </select>
          </Field>
          <Field label={A.inv.terms}>
            <input type="number" inputMode="numeric" min={0} max={120} value={d.termsDays} onChange={(e) => set("termsDays", e.target.value)} />
          </Field>
          <Field label={A.inv.locale}>
            <select value={d.locale} onChange={(e) => set("locale", e.target.value)}>
              <option value="et">Eesti</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label={A.inv.staff}>
            <select value={d.staffId} onChange={(e) => set("staffId", e.target.value)}>
              <option value="">{A.inv.noStaff}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          {issuers.length > 1 && (
            <Field label={A.inv.company}>
              <select value={d.issuerId} onChange={(e) => set("issuerId", e.target.value)}>
                <option value="">—</option>
                {issuers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <label className="iv-switch">
          <span>{A.inv.active}</span>
          <input type="checkbox" role="switch" className="adm-sw" checked={d.active} onChange={(e) => set("active", e.target.checked)} />
        </label>
        {err && (
          <p className="iv-err" role="alert">
            {err}
          </p>
        )}
      </form>
    </Dialog>
  );
}
