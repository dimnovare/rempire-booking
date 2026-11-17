"use client";

import { useState } from "react";
import type { ServiceRow } from "@/lib/admin/services";
import { A, eur, mins, ru } from "../../copy";
import { PlusIcon } from "../../icons";
import { Sheet } from "../sheet";
import { saveServiceAction } from "./actions";

type Draft = { name: { ru: string; et: string; en: string }; duration: string; price: string; range: boolean; priceMax: string; buffer: string; online: boolean; active: boolean; allBarbers: boolean };

const draftOf = (s?: ServiceRow): Draft => ({
  name: { ru: s?.name.ru ?? "", et: s?.name.et ?? "", en: s?.name.en ?? "" },
  duration: String(s?.durationMin ?? 30),
  price: s ? String(s.priceCents / 100) : "",
  range: s?.priceMaxCents != null,
  priceMax: s?.priceMaxCents != null ? String(s.priceMaxCents / 100) : "",
  buffer: String(s?.bufferMin ?? 0),
  online: s?.online ?? true,
  active: s?.active ?? true,
  allBarbers: true,
});

const cents = (s: string) => Math.round(Number(s.replace(",", ".")) * 100);
const BUFFERS = ["0", "5", "10", "15"];

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
        priceMaxCents: d.range && d.priceMax.trim() ? cents(d.priceMax) : null,
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

  // a buffer set before the four choices existed stays a choice
  const buffers = BUFFERS.includes(d.buffer) ? BUFFERS : [...BUFFERS, d.buffer];

  return (
    <main className={`adm-page${open ? " has-panel" : ""}`}>
      <div className="adm-page-head">
        <h1 className="adm-h1">{A.services.title}</h1>
        <button type="button" className="adm-btn adm-btn-line adm-btn-sm" onClick={() => edit("new")}>
          <PlusIcon size={14} />
          {A.add}
        </button>
      </div>
      <ul className="adm-list">
        {services.map((s) => (
          <li key={s.id}>
            <button type="button" className={`adm-item${s.active ? "" : " is-off"}`} aria-expanded={open === s.id} onClick={() => edit(s.id)}>
              <span className="txt">
                <span className="plain">{ru(s.name)}</span>
                <small>
                  {mins(s.durationMin)} · {A.services.barbersN(s.barbers)}
                  {!s.active ? ` · ${A.services.inactive}` : !s.online ? ` · ${A.services.offline}` : ""}
                </small>
              </span>
              <span className="end price">
                {s.priceMaxCents ? `${eur(s.priceCents).replace(" €", "")}–${eur(s.priceMaxCents)}` : eur(s.priceCents)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <Sheet
          title={open === "new" ? A.services.add : ru(d.name) || A.services.title}
          onClose={() => setOpen(null)}
          bar={
            <>
              {err && (
                <p className="adm-err" role="alert">
                  {err}
                </p>
              )}
              <div className="adm-bar-row">
                <div className="sum">
                  <small>{A.services.perBarber}</small>
                </div>
                <button type="submit" form="svc-form" className="adm-btn adm-btn-lime" disabled={busy}>
                  {A.save}
                </button>
              </div>
            </>
          }
        >
          <form
            id="svc-form"
            className="adm-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="adm-field">
              <span>{A.services.nameRu}</span>
              <input required maxLength={120} value={d.name.ru} onChange={(e) => setD({ ...d, name: { ...d.name, ru: e.target.value } })} />
            </label>
            <div className="adm-row">
              <label className="adm-field">
                <span>{A.services.price}</span>
                <input type="number" inputMode="decimal" required min={0} step="0.5" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} />
              </label>
              <label className="adm-field">
                <span>{A.services.duration}</span>
                <input type="number" inputMode="numeric" required min={5} max={720} step={5} value={d.duration} onChange={(e) => setD({ ...d, duration: e.target.value })} />
              </label>
            </div>
            <div className="adm-field">
              <span>{A.services.bufferLabel}</span>
              <div className="adm-seg adm-seg-wide" role="group" aria-label={A.services.buffer}>
                {buffers.map((b) => (
                  <button key={b} type="button" aria-pressed={d.buffer === b} onClick={() => setD({ ...d, buffer: b })}>
                    {b === "0" ? "0" : `${b} ${A.min}`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="adm-toggle">
                <span>{A.services.range}</span>
                <input type="checkbox" role="switch" className="adm-sw" checked={d.range} onChange={(e) => setD({ ...d, range: e.target.checked })} />
              </label>
              {d.range && (
                <label className="adm-field" style={{ paddingBottom: 8 }}>
                  <span>{A.services.priceTo}</span>
                  <input type="number" inputMode="decimal" min={0} step="0.5" value={d.priceMax} onChange={(e) => setD({ ...d, priceMax: e.target.value })} />
                </label>
              )}
              <label className="adm-toggle">
                <span>{A.services.online}</span>
                <input type="checkbox" role="switch" className="adm-sw" checked={d.online} onChange={(e) => setD({ ...d, online: e.target.checked })} />
              </label>
              <label className="adm-toggle">
                <span>{A.services.active}</span>
                <input type="checkbox" role="switch" className="adm-sw" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />
              </label>
              {open === "new" && (
                <label className="adm-toggle">
                  <span>{A.services.allBarbers}</span>
                  <input type="checkbox" role="switch" className="adm-sw" checked={d.allBarbers} onChange={(e) => setD({ ...d, allBarbers: e.target.checked })} />
                </label>
              )}
            </div>
            <details className="adm-fold" open={open === "new" || undefined}>
              <summary>{A.services.otherNames}</summary>
              <div className="adm-form">
                <label className="adm-field">
                  <span>{A.services.nameEt}</span>
                  <input maxLength={120} value={d.name.et} onChange={(e) => setD({ ...d, name: { ...d.name, et: e.target.value } })} />
                </label>
                <label className="adm-field">
                  <span>{A.services.nameEn}</span>
                  <input maxLength={120} value={d.name.en} onChange={(e) => setD({ ...d, name: { ...d.name, en: e.target.value } })} />
                </label>
              </div>
            </details>
          </form>
        </Sheet>
      )}
    </main>
  );
}
