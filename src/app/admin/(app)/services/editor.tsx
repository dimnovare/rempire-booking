"use client";

/**
 * «Услуги»: the list and the editor of one service. On a phone a tap opens
 * the editor as a sheet. From 900px the editor is always open beside the
 * list (the first service to start with), so a click only swaps what it
 * shows. What was typed for a service stays while another one is looked at:
 * its row says «не сохранено» until it is saved.
 */
import { useState } from "react";
import type { ServiceRow } from "@/lib/admin/services";
import { A, eur, mins, ru } from "../../copy";
import { PlusIcon } from "../../icons";
import { Pane } from "../sheet";
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
const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);
const BUFFERS = ["0", "5", "10", "15"];
const NEW = "new";

export function ServicesEditor({ services }: { services: ServiceRow[] }) {
  // which service the editor shows; a phone shows the editor only once a row is tapped
  const [sel, setSel] = useState<string>(services[0]?.id ?? NEW);
  const [shown, setShown] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const current = services.find((s) => s.id === sel);
  const isNew = !current;
  const d = drafts[sel] ?? draftOf(current);
  const setD = (next: Draft) => setDrafts({ ...drafts, [sel]: next });
  const unsaved = (s: ServiceRow) => drafts[s.id] != null && !same(drafts[s.id], draftOf(s));
  const dirty = isNew || !same(d, draftOf(current));

  const pick = (id: string) => {
    setSel(id);
    setMsg(null);
    setShown(true);
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await saveServiceAction(isNew ? null : sel, {
        name: d.name,
        durationMin: Number(d.duration),
        priceCents: cents(d.price),
        priceMaxCents: d.range && d.priceMax.trim() ? cents(d.priceMax) : null,
        bufferMin: Number(d.buffer || 0),
        online: d.online,
        active: d.active,
        allBarbers: isNew && d.allBarbers,
      });
      if (r.ok) {
        const rest = { ...drafts };
        delete rest[sel];
        setDrafts(rest);
        setSel(r.id);
        setShown(false);
        setMsg({ ok: true, text: A.saved });
        setTimeout(() => setMsg((m) => (m?.ok ? null : m)), 4000);
      } else setMsg({ ok: false, text: A.visit.invalid(r.field) });
    } catch {
      setMsg({ ok: false, text: A.error });
    } finally {
      setBusy(false);
    }
  };

  // a buffer set before the four choices existed stays a choice
  const buffers = BUFFERS.includes(d.buffer) ? BUFFERS : [...BUFFERS, d.buffer];
  const C = A.services.cols;

  return (
    <main className="adm-page adm-wide adm-two">
      <div className="adm-two-main">
        <div className="adm-page-head">
          <h1 className="adm-h1">{A.services.title}</h1>
          <button type="button" className="adm-btn adm-btn-line adm-btn-sm" onClick={() => pick(NEW)}>
            <PlusIcon size={14} />
            {A.add}
          </button>
        </div>
        <div>
          <div className="adm-svc-head" aria-hidden="true">
            <span>{C.name}</span>
            <span>{C.time}</span>
            <span>{C.barbers}</span>
            <span>{C.online}</span>
            <span>{C.price}</span>
          </div>
          <ul className="adm-list">
            {services.map((s) => (
              <li key={s.id}>
                <button type="button" className={`adm-item adm-svc${s.active ? "" : " is-off"}`} aria-current={sel === s.id ? "true" : undefined} onClick={() => pick(s.id)}>
                  <span className="txt">
                    <span className="plain">
                      {ru(s.name)}
                      {unsaved(s) && <span className="adm-tag lime">{A.services.unsaved}</span>}
                    </span>
                    <small>
                      {mins(s.durationMin)} · {A.services.barbersN(s.barbers)}
                      {!s.active ? ` · ${A.services.inactive}` : !s.online ? ` · ${A.services.offline}` : ""}
                    </small>
                  </span>
                  <span className="c">
                    {mins(s.durationMin)}
                    {s.bufferMin > 0 ? ` + ${s.bufferMin}` : ""}
                  </span>
                  <span className="c">{A.services.barbersN(s.barbers)}</span>
                  <span className="c">{!s.active ? A.services.inactive : s.online ? A.services.onlineYes : A.services.offline}</span>
                  <span className="end price">{s.priceMaxCents ? `${eur(s.priceCents).replace(" €", "")}–${eur(s.priceMaxCents)}` : eur(s.priceCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Pane
        title={isNew ? A.services.add : ru(d.name) || A.services.title}
        open={shown}
        onClose={() => setShown(false)}
        bar={
          <>
            {msg && (
              <p className={msg.ok ? "adm-ok" : "adm-err"} role={msg.ok ? "status" : "alert"}>
                {msg.text}
              </p>
            )}
            <div className="adm-bar-row">
              <div className="sum">
                <small>{A.services.perBarber}</small>
              </div>
              <button type="submit" form="svc-form" className="adm-btn adm-btn-lime" disabled={busy || !dirty}>
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
            {isNew && (
              <label className="adm-toggle">
                <span>{A.services.allBarbers}</span>
                <input type="checkbox" role="switch" className="adm-sw" checked={d.allBarbers} onChange={(e) => setD({ ...d, allBarbers: e.target.checked })} />
              </label>
            )}
          </div>
          <div className="adm-field">
            <span>{A.services.otherNames}</span>
            <div className="adm-row adm-row-long">
              <input aria-label={A.services.nameEt} placeholder="ET" maxLength={120} value={d.name.et} onChange={(e) => setD({ ...d, name: { ...d.name, et: e.target.value } })} />
              <input aria-label={A.services.nameEn} placeholder="EN" maxLength={120} value={d.name.en} onChange={(e) => setD({ ...d, name: { ...d.name, en: e.target.value } })} />
            </div>
          </div>
        </form>
      </Pane>
    </main>
  );
}
