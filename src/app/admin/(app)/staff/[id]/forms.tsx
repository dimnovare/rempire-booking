"use client";

/** The barber page: each part saves on its own, so a change is one tap on its «Сохранить». */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { hhmm, momentAt } from "@/lib/admin/grid";
import type { DayOverride, HoursDay, Offer, SpecialRow, TimeOffRow } from "@/lib/admin/staff";
import { addDays } from "@/lib/tz";
import { A, eur, mins, ru } from "../../../copy";
import { addOff, addSpecial, removeOff, removeSpecial, saveDay, saveHours, saveOffers, saveProfile } from "../actions";

type Msg = { ok: boolean; text: string } | null;

function useSaver() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const run = async (fn: () => Promise<{ ok: boolean; field?: string } | boolean>, okText: string = A.saved) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      const ok = typeof r === "boolean" ? r : r.ok;
      const field = typeof r === "object" && !r.ok ? r.field : undefined;
      setMsg(ok ? { ok: true, text: okText } : { ok: false, text: field ? A.visit.invalid(field.split(":")[0]) : A.error });
      return ok;
    } catch {
      setMsg({ ok: false, text: A.error });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const view = msg && <p className={msg.ok ? "adm-ok" : "adm-err"}>{msg.text}</p>;
  return { busy, run, view };
}

const toMin = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : NaN);
const dt = (tz: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "numeric", month: "short", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dOnly = (date: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "long" }).format(Date.parse(`${date}T12:00:00Z`));

export function ProfileForm({ id, initial }: { id: string | null; initial: { name: string; role: { ru: string; et: string; en: string }; photoUrl: string; bookable: boolean; active: boolean } }) {
  const [p, setP] = useState(initial);
  const s = useSaver();
  const router = useRouter();
  return (
    <form
      className="adm-form"
      onSubmit={(e) => {
        e.preventDefault();
        void s.run(async () => {
          const r = await saveProfile(id, p);
          if (r.ok && !id) router.push(`/admin/staff/${r.id}`);
          return r;
        });
      }}
    >
      <label className="adm-field">
        <span>{A.staff.name}</span>
        <input required maxLength={60} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      </label>
      <div className="adm-field">
        <span>{A.staff.role}</span>
        <div className="adm-row">
          {(["ru", "et", "en"] as const).map((k) => (
            <input key={k} aria-label={`${A.staff.role} ${k}`} placeholder={k.toUpperCase()} maxLength={40} value={p.role[k]} onChange={(e) => setP({ ...p, role: { ...p.role, [k]: e.target.value } })} />
          ))}
        </div>
      </div>
      <label className="adm-field">
        <span>{A.staff.photo}</span>
        <input inputMode="url" placeholder="/barbers/name.webp" value={p.photoUrl} onChange={(e) => setP({ ...p, photoUrl: e.target.value })} />
      </label>
      <label className="adm-check">
        <input type="checkbox" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />
        <span>{A.staff.active}</span>
      </label>
      <label className="adm-check">
        <input type="checkbox" checked={p.bookable} onChange={(e) => setP({ ...p, bookable: e.target.checked })} />
        <span>{A.staff.bookable}</span>
      </label>
      {s.view}
      <button className="adm-btn adm-btn-lime" disabled={s.busy}>
        {id ? A.save : A.staff.add}
      </button>
    </form>
  );
}

export function OffersForm({ staffId, offers }: { staffId: string; offers: Offer[] }) {
  const [rows, setRows] = useState(() =>
    offers.map((o) => ({ ...o, price: o.priceCents == null ? "" : String(o.priceCents / 100), dur: o.durationMin == null ? "" : String(o.durationMin) })),
  );
  const s = useSaver();
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <form
      className="adm-form"
      onSubmit={(e) => {
        e.preventDefault();
        void s.run(() =>
          saveOffers(
            staffId,
            rows.map((r) => ({
              serviceId: r.serviceId,
              offered: r.offered,
              priceCents: r.price.trim() === "" ? null : Math.round(Number(r.price.replace(",", ".")) * 100),
              durationMin: r.dur.trim() === "" ? null : Number(r.dur),
            })),
          ),
        );
      }}
    >
      <p className="adm-meta">{A.staff.offersHint}</p>
      <table className="adm-offers">
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.serviceId} className={r.offered ? "" : "is-off"}>
              <td>
                <input type="checkbox" aria-label={A.staff.offered} checked={r.offered} onChange={(e) => set(i, { offered: e.target.checked })} />
              </td>
              <td className="n">
                {ru(r.name)}
                {!r.active && <span className="adm-tag">{A.services.inactive}</span>}
                <small>
                  {mins(r.defaultMin)} · {eur(r.defaultCents)}
                </small>
              </td>
              <td>
                <input type="number" inputMode="decimal" min={0} step="0.5" aria-label={A.staff.price} placeholder={String(r.defaultCents / 100)} value={r.price} onChange={(e) => set(i, { price: e.target.value })} />
              </td>
              <td>
                <input type="number" inputMode="numeric" min={5} max={720} step={5} aria-label={A.staff.duration} placeholder={String(r.defaultMin)} value={r.dur} onChange={(e) => set(i, { dur: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="adm-meta">
        {A.staff.price} / {A.staff.duration}
      </p>
      {s.view}
      <button className="adm-btn adm-btn-lime" disabled={s.busy}>
        {A.save}
      </button>
    </form>
  );
}

export function HoursForm({ staffId, hours }: { staffId: string; hours: HoursDay[] }) {
  const [days, setDays] = useState<Record<number, [string, string][]>>(() => Object.fromEntries(hours.map((h) => [h.weekday, h.spans])));
  const s = useSaver();
  const setDay = (wd: number, spans: [string, string][]) => setDays({ ...days, [wd]: spans });
  return (
    <form
      className="adm-form"
      onSubmit={(e) => {
        e.preventDefault();
        void s.run(() => saveHours(staffId, days));
      }}
    >
      <p className="adm-meta">{A.staff.hoursHint}</p>
      <div className="adm-week">
        {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
          const spans = days[wd] ?? [];
          return (
            <div className="wd" key={wd}>
              <b>{A.staff.weekdays[wd - 1]}</b>
              <div className="spans">
                {spans.length === 0 && <span className="off">{A.staff.dayOff}</span>}
                {spans.map(([a, b], i) => (
                  <div className="span" key={i}>
                    <input type="time" step={900} value={a} aria-label={A.block.from} onChange={(e) => setDay(wd, spans.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} />
                    –
                    <input type="time" step={900} value={b} aria-label={A.block.to} onChange={(e) => setDay(wd, spans.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} />
                    <button type="button" className="adm-icon" aria-label={A.remove} onClick={() => setDay(wd, spans.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="adm-link"
                  onClick={() => {
                    const last = spans[spans.length - 1];
                    const start = last ? Math.min(toMin(last[1]) + 60, 22 * 60) : 10 * 60;
                    setDay(wd, [...spans, [hhmm(start), hhmm(Math.min(start + (last ? 120 : 600), 23 * 60 + 45))]]);
                  }}
                >
                  {A.staff.addSpan}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setDays({ ...days, 2: days[1] ?? [], 3: days[1] ?? [], 4: days[1] ?? [], 5: days[1] ?? [] })}>
        {A.staff.copyMon}
      </button>
      {s.view}
      <button className="adm-btn adm-btn-lime" disabled={s.busy}>
        {A.save}
      </button>
    </form>
  );
}

export function DaysForm({ staffId, overrides, today }: { staffId: string; overrides: DayOverride[]; today: string }) {
  const [date, setDate] = useState(addDays(today, 1));
  const [off, setOff] = useState(true);
  const [from, setFrom] = useState("10:00");
  const [to, setTo] = useState("16:00");
  const [note, setNote] = useState("");
  const s = useSaver();
  return (
    <div className="adm-form">
      <p className="adm-meta">{A.staff.overridesHint}</p>
      {overrides.length > 0 && (
        <ul className="adm-mini">
          {overrides.map((o) => (
            <li key={o.date}>
              <span>
                {dOnly(o.date)} · {o.spans.length ? o.spans.map(([a, b]) => `${a}–${b}`).join(", ") : A.staff.dayOff}
                {o.note && <small> · {o.note}</small>}
              </span>
              <button type="button" className="adm-link" disabled={s.busy} onClick={() => void s.run(() => saveDay(staffId, o.date, null, ""))}>
                {A.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="adm-row">
        <label className="adm-field">
          <span>{A.staff.overrideDate}</span>
          <input type="date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      </div>
      <label className="adm-check">
        <input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} />
        <span>{A.staff.overrideOff}</span>
      </label>
      {!off && (
        <div className="adm-row">
          <label className="adm-field">
            <span>{A.block.from}</span>
            <input type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="adm-field">
            <span>{A.block.to}</span>
            <input type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      )}
      <label className="adm-field">
        <span>{A.block.note}</span>
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </label>
      {s.view}
      <button type="button" className="adm-btn adm-btn-line" disabled={s.busy} onClick={() => void s.run(() => saveDay(staffId, date, off ? [] : [[from, to]], note))}>
        {A.add}
      </button>
    </div>
  );
}

export function TimeOffForm({ staffId, rows, tz, today }: { staffId: string; rows: TimeOffRow[]; tz: string; today: string }) {
  const [kind, setKind] = useState("vacation");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const s = useSaver();
  const f = dt(tz);
  return (
    <div className="adm-form">
      {rows.length ? (
        <ul className="adm-mini">
          {rows.map((r) => (
            <li key={r.id}>
              <span>
                {A.block.kinds[r.kind] ?? r.kind}: {f.format(r.from)} – {f.format(r.to)}
                {r.note && <small> · {r.note}</small>}
              </span>
              <button type="button" className="adm-link" disabled={s.busy} onClick={() => void s.run(() => removeOff(r.id))}>
                {A.remove}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="adm-meta">{A.staff.noTimeOff}</p>
      )}
      <div className="adm-seg adm-seg-wide" role="group">
        {(["vacation", "sick"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {A.block.kinds[k]}
          </button>
        ))}
      </div>
      <div className="adm-row">
        <label className="adm-field">
          <span>{A.block.from}</span>
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label className="adm-field">
          <span>{A.block.to}</span>
          <input type="date" min={from} value={to < from ? from : to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
      </div>
      <label className="adm-field">
        <span>{A.block.note}</span>
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </label>
      {s.view}
      <button
        type="button"
        className="adm-btn adm-btn-line"
        disabled={s.busy}
        onClick={() =>
          void s.run(async () => {
            const r = await addOff({ staffId, from: momentAt(from, 0, tz), to: momentAt(addDays(to < from ? from : to, 1), 0, tz), kind, note });
            return r;
          })
        }
      >
        {A.add}
      </button>
    </div>
  );
}

export function SpecialForm({ staffId, rows, tz, today }: { staffId: string; rows: SpecialRow[]; tz: string; today: string }) {
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState("20:00");
  const [to, setTo] = useState("22:00");
  const [extra, setExtra] = useState("20");
  const [note, setNote] = useState("");
  const s = useSaver();
  const f = dt(tz);
  const t = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <div className="adm-form">
      <p className="adm-meta">{A.staff.specialHint}</p>
      {rows.length ? (
        <ul className="adm-mini">
          {rows.map((r) => (
            <li key={r.id}>
              <span>
                {f.format(r.from)}–{t.format(r.to)} · +{eur(r.extraCents)}
                {r.note && <small> · {r.note}</small>}
              </span>
              <button type="button" className="adm-link" disabled={s.busy} onClick={() => void s.run(() => removeSpecial(r.id))}>
                {A.remove}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="adm-meta">{A.staff.noSpecial}</p>
      )}
      <div className="adm-row">
        <label className="adm-field">
          <span>{A.visit.date}</span>
          <input type="date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <label className="adm-field">
          <span>{A.block.from}</span>
          <input type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="adm-field">
          <span>{A.block.to}</span>
          <input type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <div className="adm-row">
        <label className="adm-field">
          <span>{A.staff.extra}</span>
          <input type="number" inputMode="decimal" min={0} step="1" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </label>
        <label className="adm-field">
          <span>{A.block.note}</span>
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {s.view}
      <button
        type="button"
        className="adm-btn adm-btn-line"
        disabled={s.busy}
        onClick={() => {
          const a = toMin(from);
          const b = toMin(to);
          // «20:00–02:00» runs past midnight
          const end = b > a ? momentAt(date, b, tz) : momentAt(addDays(date, 1), b, tz);
          void s.run(() => addSpecial({ staffId, from: momentAt(date, a, tz), to: end, extraCents: Math.round(Number(extra.replace(",", ".")) * 100), note }));
        }}
      >
        {A.add}
      </button>
    </div>
  );
}
