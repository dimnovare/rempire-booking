"use client";

import { useState } from "react";
import type { ServiceRow } from "@/lib/admin/services";
import { A, eur, mins, ru } from "../../copy";
import { saveServiceAction } from "./actions";

type Draft = { name: { ru: string; et: string; en: string }; duration: string; price: string; priceMax: string; buffer: string; online: boolean; active: boolean; allBarbers: boolean };

const draftOf = (s?: ServiceRow): Draft => ({
  name: { ru: s?.name.ru ?? "", et: s?.name.et ?? "", en: s?.name.en ?? "" },
  duration: String(s?.durationMin ?? 30),
  price: s ? String(s.priceCents / 100) : "",
  priceMax: s?.priceMaxCents != null ? String(s.priceMaxCents / 100) : "",
  buffer: String(s?.bufferMin ?? 0),
  online: s?.online ?? true,
  active: s?.active ?? true,
  allBarbers: true,
});

const cents = (s: string) => Math.round(Number(s.replace(",", ".")) * 100);

export function ServicesEditor({ services }: { services: ServiceRow[] }) {
  const [open, setOpen] = useState<string | "new" | null>(null);
  const [d, setD] = useState<Draft>(draftOf());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const edit = (id: string | "new") => {
    setD(draftOf(id === "new" ? undefined : services.find((s) => s.id === id)));
    setErr(null);
    setOpen(id);
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await saveServiceAction(open === "new" ? null : open, {
        name: d.name,
        durationMin: Number(d.duration),
        priceCents: cents(d.price),
        priceMaxCents: d.priceMax.trim() ? cents(d.priceMax) : null,
        bufferMin: Number(d.buffer || 0),
        online: d.online,
        active: d.active,
        allBarbers: open === "new" && d.allBarbers,
      });
      if (r.ok) setOpen(null);
      else setErr(A.visit.invalid(r.field));
    } catch {
      setErr(A.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="adm-page-head">
        <h1 className="adm-h1">{A.services.title}</h1>
        <button type="button" className="adm-btn adm-btn-line adm-btn-sm" onClick={() => edit("new")}>
          + {A.add}
        </button>
      </div>
      <ul className="adm-list">
        {services.map((s) => (
          <li key={s.id}>
            <button type="button" className={`adm-item${s.active ? "" : " is-off"}`} onClick={() => edit(s.id)}>
              <span className="txt">
                <b style={{ fontFamily: "var(--body)", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 16 }}>
                  {ru(s.name)}
                  {!s.active ? <span className="adm-tag">{A.services.inactive}</span> : !s.online ? <span className="adm-tag">{A.services.offline}</span> : null}
                </b>
                <small>
                  {mins(s.durationMin)} · {A.services.barbersN(s.barbers)}
                </small>
              </span>
              <span className="end">
                {eur(s.priceCents)}
                {s.priceMaxCents ? `–${eur(s.priceMaxCents)}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div className="adm-sheet-wrap" onClick={() => setOpen(null)}>
          <div className="adm-sheet" role="dialog" aria-label={A.services.title} onClick={(e) => e.stopPropagation()}>
            <div className="adm-sheet-head">
              <h2>{open === "new" ? A.services.add : ru(d.name) || A.services.title}</h2>
              <button type="button" className="adm-icon" aria-label={A.close} onClick={() => setOpen(null)}>
                ×
              </button>
            </div>
            <form
              className="adm-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {(["ru", "et", "en"] as const).map((k) => (
                <label key={k} className="adm-field">
                  <span>{k === "ru" ? A.services.nameRu : k === "et" ? A.services.nameEt : A.services.nameEn}</span>
                  <input required={k === "ru"} maxLength={120} value={d.name[k]} onChange={(e) => setD({ ...d, name: { ...d.name, [k]: e.target.value } })} />
                </label>
              ))}
              <div className="adm-grid2">
                <label className="adm-field">
                  <span>{A.services.duration}</span>
                  <input type="number" inputMode="numeric" required min={5} max={720} step={5} value={d.duration} onChange={(e) => setD({ ...d, duration: e.target.value })} />
                </label>
                <label className="adm-field">
                  <span>{A.services.price}</span>
                  <input type="number" inputMode="decimal" required min={0} step="0.5" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} />
                </label>
                <label className="adm-field">
                  <span>{A.services.priceMax}</span>
                  <input type="number" inputMode="decimal" min={0} step="0.5" value={d.priceMax} onChange={(e) => setD({ ...d, priceMax: e.target.value })} />
                </label>
                <label className="adm-field">
                  <span>{A.services.buffer}</span>
                  <input type="number" inputMode="numeric" min={0} max={120} step={5} value={d.buffer} onChange={(e) => setD({ ...d, buffer: e.target.value })} />
                </label>
              </div>
              <label className="adm-check">
                <input type="checkbox" checked={d.online} onChange={(e) => setD({ ...d, online: e.target.checked })} />
                <span>{A.services.online}</span>
              </label>
              <label className="adm-check">
                <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />
                <span>{A.services.active}</span>
              </label>
              {open === "new" && (
                <label className="adm-check">
                  <input type="checkbox" checked={d.allBarbers} onChange={(e) => setD({ ...d, allBarbers: e.target.checked })} />
                  <span>{A.services.allBarbers}</span>
                </label>
              )}
              {err && <p className="adm-err">{err}</p>}
              <button className="adm-btn adm-btn-lime" disabled={busy}>
                {A.save}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
