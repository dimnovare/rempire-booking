"use client";

/**
 * «Услуги»: the list and the editor of one service. On a phone a tap opens
 * the editor as a sheet. From 900px the editor is always open beside the
 * list (the first service to start with), so a click only swaps what it
 * shows. A service that exists saves by itself (autosave.tsx); a new one is
 * made with the one button.
 */
import { useState } from "react";
import type { ServiceRow } from "@/lib/admin/services";
import { eur, type Copy } from "../../copy";
import { useA } from "../../lang";
import { PlusIcon } from "../../icons";
import { SaveState, useAutoSave } from "../autosave";
import { Pane } from "../sheet";
import { Titled } from "../star";
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

const num = (s: string) => Number(s.replace(",", "."));
const cents = (s: string) => Math.round(num(s) * 100);
const BUFFERS = ["0", "5", "10", "15"];
const NEW = "new";

/** What is wrong with a draft, or null. A half-typed price or time is not sent. */
function wrong(A: Copy, d: Draft): string | null {
  if (!d.name.ru.trim()) return A.services.needName;
  if (d.price.trim() === "" || !(num(d.price) >= 0)) return A.visit.invalid("priceCents");
  if (!(Number.isInteger(Number(d.duration)) && Number(d.duration) >= 5 && Number(d.duration) <= 720)) return A.visit.invalid("durationMin");
  if (d.range && d.priceMax.trim() !== "" && !(num(d.priceMax) >= num(d.price))) return A.visit.invalid("priceMaxCents");
  return null;
}

export function ServicesEditor({ services }: { services: ServiceRow[] }) {
  const A = useA();
  // which service the editor shows; a phone shows the editor only once a row is tapped
  const [sel, setSel] = useState<string>(services[0]?.id ?? NEW);
  const [shown, setShown] = useState(false);
  const current = services.find((s) => s.id === sel);
  const C = A.services.cols;

  const pick = (id: string) => {
    setSel(id);
    setShown(true);
  };

  return (
    <main className="adm-page adm-wide adm-two">
      <div className="adm-two-main">
        <div className="adm-page-head">
          <Titled page="services">
            <h1 className="adm-h1">{A.services.title}</h1>
          </Titled>
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
                    <span className="plain">{A.pick(s.name)}</span>
                    <small>
                      {A.mins(s.durationMin)} · {A.services.barbersN(s.barbers)}
                      {!s.active ? ` · ${A.services.inactive}` : !s.online ? ` · ${A.services.offline}` : ""}
                    </small>
                  </span>
                  <span className="c">
                    {A.mins(s.durationMin)}
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

      {/* a pane per service: its state starts from that service, and what is waiting is sent when another one is picked */}
      <ServicePane
        key={current?.id ?? NEW}
        service={current}
        open={shown}
        onClose={() => setShown(false)}
        onCreated={(id) => {
          setSel(id);
          setShown(false);
        }}
      />
    </main>
  );
}

function ServicePane({ service, open, onClose, onCreated }: { service?: ServiceRow; open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const A = useA();
  const [d, setD] = useState<Draft>(() => draftOf(service));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = service?.id ?? null;

  const send = (v: Draft) =>
    saveServiceAction(id, {
      name: v.name,
      durationMin: Number(v.duration),
      priceCents: cents(v.price),
      priceMaxCents: v.range && v.priceMax.trim() ? cents(v.priceMax) : null,
      bufferMin: Number(v.buffer || 0),
      online: v.online,
      active: v.active,
      allBarbers: !id && v.allBarbers,
    });
  const auto = useAutoSave<Draft>(d, setD, send, { off: !id, check: (v) => wrong(A, v), label: (service && A.pick(service.name)) || A.services.title });

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await send(d);
      // stays busy on success: this pane is replaced by the new service's own
      if (r.ok) return onCreated(r.id);
      setErr(A.visit.invalid(r.field));
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  // a buffer set before the four choices existed stays a choice
  const buffers = BUFFERS.includes(d.buffer) ? BUFFERS : [...BUFFERS, d.buffer];

  return (
    <Pane
      title={id ? A.pick(d.name) || A.services.title : A.services.add}
      open={open}
      onClose={() => {
        auto.flush();
        onClose();
      }}
      bar={
        id ? (
          <SaveState auto={auto} onDone={onClose} />
        ) : (
          <>
            {err && (
              <p className="adm-err" role="alert">
                {err}
              </p>
            )}
            <button type="submit" form="svc-form" className="adm-btn adm-btn-lime" disabled={busy}>
              {A.services.add}
            </button>
          </>
        )
      }
    >
      <form
        id="svc-form"
        className="adm-form"
        onBlur={auto.flush}
        onSubmit={(e) => {
          e.preventDefault();
          if (id) auto.flush();
          else void create();
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
          {!id && (
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
        <p className="adm-meta">{A.services.perBarber}</p>
      </form>
    </Pane>
  );
}
