"use client";

/**
 * The barber page's parts. Profile, prices and the week save by themselves
 * (autosave.tsx). The lists (special days, time off, special time) add a
 * record with one «Добавить» and remove one with one tap.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { hhmm, momentAt } from "@/lib/admin/grid";
import type { DayOverride, HoursDay, Offer, SpecialRow, TimeOffRow } from "@/lib/admin/staff";
import { addDays } from "@/lib/tz";
import { A, eur, mins, ru } from "../../../copy";
import { Ava, XIcon } from "../../../icons";
import { SaveState, useAutoSave } from "../../autosave";
import { addOff, addSpecial, removeOff, removeSpecial, saveDay, saveHours, saveOffers, saveProfile, uploadPhoto } from "../actions";

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
      // «Сохранено» has done its job after a few seconds; an error stays until the next try
      if (ok) setTimeout(() => setMsg((m) => (m?.ok ? null : m)), 4000);
      return ok;
    } catch {
      setMsg({ ok: false, text: A.error });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const view = msg && (
    <p className={msg.ok ? "adm-ok" : "adm-err"} role={msg.ok ? "status" : "alert"}>
      {msg.text}
    </p>
  );
  return { busy, run, view };
}

const toMin = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : NaN);
const dt = (tz: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "numeric", month: "short", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dOnly = (date: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "long" }).format(Date.parse(`${date}T12:00:00Z`));

/** The bottom of each part: its message and its one button; it stays in view while the part scrolls. */
function SaveBar({ children }: { children: React.ReactNode }) {
  return <div className="adm-savebar">{children}</div>;
}

function Remove({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" className="adm-ibtn" aria-label={A.remove} disabled={disabled} onClick={onClick}>
      <XIcon size={18} />
    </button>
  );
}

type Profile = { name: string; role: { ru: string; et: string; en: string }; photoUrl: string; bookable: boolean; active: boolean };

/**
 * A photo straight from a phone is several MB. The browser makes it a JPEG
 * that fits 800×1000 (about 100 KB) before it is sent, turned the right way
 * up. Throws when the file is not a picture the browser can read.
 */
async function shrinkPhoto(file: File): Promise<Blob> {
  const img = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, 800 / img.width, 1000 / img.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * k));
  canvas.height = Math.max(1, Math.round(img.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  // a see-through PNG gets the page's black behind it, not JPEG's default
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/jpeg", 0.86));
}

/** A barber who exists saves by itself; a new one is made with the one button. */
export function ProfileForm({ id, initial, onDone }: { id: string | null; initial: Profile; onDone?: () => void }) {
  const [p, setP] = useState(initial);
  const s = useSaver();
  const router = useRouter();
  const auto = useAutoSave<Profile>(p, setP, (v) => saveProfile(id, v), { off: !id, label: A.staff.profile, check: (v) => (v.name.trim() ? null : A.auto.needName) });
  const [up, setUp] = useState<{ busy: boolean; err: string | null }>({ busy: false, err: null });

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same file can be picked again
    if (!file || !id) return;
    setUp({ busy: true, err: null });
    try {
      const form = new FormData();
      form.set("photo", await shrinkPhoto(file), "photo.jpg");
      const r = await uploadPhoto(id, form);
      if (!r.ok) return setUp({ busy: false, err: A.staff.photoBad });
      // the new link goes into the profile, which then says «Сохранено» (and can put the old photo back)
      setP((cur) => ({ ...cur, photoUrl: r.url }));
      setUp({ busy: false, err: null });
    } catch {
      setUp({ busy: false, err: A.staff.photoBad });
    }
  };
  return (
    <form
      className="adm-form"
      onBlur={auto.flush}
      onSubmit={(e) => {
        e.preventDefault();
        if (id) return auto.flush();
        void s.run(async () => {
          const r = await saveProfile(null, p);
          if (r.ok) router.push(`/admin/staff/${r.id}`);
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
      {/* the photo is picked from the phone or the computer; it is sent at once, on its own */}
      <div className="adm-field">
        <span>{A.staff.photoLabel}</span>
        {id ? (
          <div className="adm-photo">
            <Ava src={p.photoUrl || null} name={p.name} />
            <div className="txt">
              <label className="adm-btn adm-btn-ghost adm-btn-sm">
                <input type="file" accept="image/*" className="sr" disabled={up.busy} onChange={pickPhoto} />
                {up.busy ? A.staff.photoBusy : p.photoUrl ? A.staff.photoChange : A.staff.photoAdd}
              </label>
              {p.photoUrl && !up.busy && (
                <button type="button" className="adm-txt" onClick={() => setP({ ...p, photoUrl: "" })}>
                  {A.staff.photoRemove}
                </button>
              )}
              {up.err ? (
                <p className="adm-err" role="alert">
                  {up.err}
                </p>
              ) : (
                <small className="adm-meta">{A.staff.photoHint}</small>
              )}
            </div>
          </div>
        ) : (
          <small className="adm-meta">{A.staff.photoLater}</small>
        )}
      </div>
      <div>
        <label className="adm-toggle">
          <span>{A.staff.active}</span>
          <input type="checkbox" role="switch" className="adm-sw" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />
        </label>
        <label className="adm-toggle">
          <span>{A.staff.bookable}</span>
          <input type="checkbox" role="switch" className="adm-sw" checked={p.bookable} onChange={(e) => setP({ ...p, bookable: e.target.checked })} />
        </label>
      </div>
      <SaveBar>
        {id ? (
          <SaveState auto={auto} onDone={onDone} />
        ) : (
          <>
            {s.view}
            <button className="adm-btn adm-btn-lime" disabled={s.busy}>
              {A.staff.add}
            </button>
          </>
        )}
      </SaveBar>
    </form>
  );
}

type OfferRow = Offer & { price: string; dur: string };
const num = (s: string) => Number(s.replace(",", "."));

export function OffersForm({ staffId, offers, onDone }: { staffId: string; offers: Offer[]; onDone?: () => void }) {
  const [rows, setRows] = useState<OfferRow[]>(() => offers.map((o) => ({ ...o, price: o.priceCents == null ? "" : String(o.priceCents / 100), dur: o.durationMin == null ? "" : String(o.durationMin) })));
  const set = (i: number, patch: Partial<OfferRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const auto = useAutoSave<OfferRow[]>(
    rows,
    setRows,
    (v) =>
      saveOffers(
        staffId,
        v.map((r) => ({
          serviceId: r.serviceId,
          offered: r.offered,
          priceCents: r.price.trim() === "" ? null : Math.round(num(r.price) * 100),
          durationMin: r.dur.trim() === "" ? null : Number(r.dur),
        })),
      ),
    {
      label: A.staff.offersRow,
      // a half-typed price or time is not sent («4» on the way to «45» minutes)
      check: (v) => {
        for (const r of v) {
          if (r.price.trim() !== "" && !(num(r.price) >= 0)) return A.visit.invalid("priceCents");
          if (r.dur.trim() !== "" && !(Number.isInteger(Number(r.dur)) && Number(r.dur) >= 5 && Number(r.dur) <= 720)) return A.visit.invalid("durationMin");
        }
        return null;
      },
    },
  );
  return (
    <form
      className="adm-form"
      onBlur={auto.flush}
      onSubmit={(e) => {
        e.preventDefault();
        auto.flush();
      }}
    >
      <p className="adm-meta">{A.staff.offersHint}</p>
      <table className="adm-ptable">
        <thead>
          <tr>
            <th>
              <span className="sr">{A.staff.offered}</span>
            </th>
            <th>{A.staff.service}</th>
            <th className="r">{A.staff.price}</th>
            <th className="r">{A.staff.min}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.serviceId} className={r.offered ? "" : "is-off"}>
              <td>
                <input type="checkbox" aria-label={`${A.staff.offered}: ${ru(r.name)}`} checked={r.offered} onChange={(e) => set(i, { offered: e.target.checked })} />
              </td>
              <td className="n">
                {ru(r.name)}
                {!r.active && <span className="adm-tag">{A.services.inactive}</span>}
                <small>
                  {mins(r.defaultMin)} · {eur(r.defaultCents)}
                </small>
              </td>
              <td>
                <input type="number" inputMode="decimal" min={0} step="0.5" aria-label={`${A.staff.price}: ${ru(r.name)}`} placeholder={String(r.defaultCents / 100)} value={r.price} onChange={(e) => set(i, { price: e.target.value })} />
              </td>
              <td>
                <input type="number" inputMode="numeric" min={5} max={720} step={5} aria-label={`${A.staff.duration}: ${ru(r.name)}`} placeholder={String(r.defaultMin)} value={r.dur} onChange={(e) => set(i, { dur: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SaveBar>
        <SaveState auto={auto} onDone={onDone} />
      </SaveBar>
    </form>
  );
}

type Week = Record<number, [string, string][]>;

export function HoursForm({ staffId, hours, onDone }: { staffId: string; hours: HoursDay[]; onDone?: () => void }) {
  const [days, setDays] = useState<Week>(() => Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((wd) => [wd, hours.find((h) => h.weekday === wd)?.spans ?? []])));
  const setDay = (wd: number, spans: [string, string][]) => setDays({ ...days, [wd]: spans });
  const auto = useAutoSave<Week>(days, setDays, (v) => saveHours(staffId, v), {
    label: A.staff.hours,
    // a span must end after it starts and after the one before it; a time still being typed is not sent
    check: (v) => {
      for (const spans of Object.values(v)) {
        let last = -1;
        for (const [a, b] of spans) {
          if (!(toMin(a) >= last && toMin(b) > toMin(a))) return A.visit.invalid("to");
          last = toMin(b);
        }
      }
      return null;
    },
  });
  return (
    <form
      className="adm-form"
      onBlur={auto.flush}
      onSubmit={(e) => {
        e.preventDefault();
        auto.flush();
      }}
    >
      <p className="adm-meta">{A.staff.hoursHint}</p>
      <div className="adm-week">
        {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
          const spans = days[wd] ?? [];
          const name = A.staff.weekdays[wd - 1];
          return (
            <div className="wd" key={wd}>
              <input
                type="checkbox"
                role="switch"
                className="adm-sw"
                aria-label={A.staff.workday(name)}
                checked={spans.length > 0}
                onChange={(e) => setDay(wd, e.target.checked ? [["10:00", "20:00"]] : [])}
              />
              <b>{name}</b>
              <div className="spans">
                {spans.length === 0 && <span className="off">{A.staff.dayOff}</span>}
                {spans.map(([a, b], i) => (
                  <div className="span" key={i}>
                    <input type="time" step={900} value={a} aria-label={`${name}, ${A.block.from}`} onChange={(e) => setDay(wd, spans.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} />
                    –
                    <input type="time" step={900} value={b} aria-label={`${name}, ${A.block.to}`} onChange={(e) => setDay(wd, spans.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} />
                    {/* the first line of a day carries «+ отрезок»; an added one can be removed. The switch turns the whole day off. */}
                    {i === 0 ? (
                      <button
                        type="button"
                        className="adm-txt lime"
                        onClick={() => {
                          const last = spans[spans.length - 1];
                          const start = Math.min(toMin(last[1]) + 60, 22 * 60);
                          setDay(wd, [...spans, [hhmm(start), hhmm(Math.min(start + 120, 23 * 60 + 45))]]);
                        }}
                      >
                        {A.staff.addSpan}
                      </button>
                    ) : (
                      <Remove disabled={false} onClick={() => setDay(wd, spans.filter((_, j) => j !== i))} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setDays({ ...days, 2: days[1] ?? [], 3: days[1] ?? [], 4: days[1] ?? [], 5: days[1] ?? [] })}>
        {A.staff.copyMon}
      </button>
      <SaveBar>
        <SaveState auto={auto} onDone={onDone} />
      </SaveBar>
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
              <Remove disabled={s.busy} onClick={() => void s.run(() => saveDay(staffId, o.date, null, ""))} />
            </li>
          ))}
        </ul>
      )}
      <label className="adm-field">
        <span>{A.staff.overrideDate}</span>
        <input type="date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>
      <label className="adm-toggle">
        <span>{A.staff.overrideOff}</span>
        <input type="checkbox" role="switch" className="adm-sw" checked={off} onChange={(e) => setOff(e.target.checked)} />
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
      <SaveBar>
        {s.view}
        <button type="button" className="adm-btn adm-btn-lime adm-btn-add" disabled={s.busy} onClick={() => void s.run(() => saveDay(staffId, date, off ? [] : [[from, to]], note))}>
          {A.add}
        </button>
      </SaveBar>
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
              <Remove disabled={s.busy} onClick={() => void s.run(() => removeOff(r.id))} />
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
      <SaveBar>
        {s.view}
        <button
          type="button"
          className="adm-btn adm-btn-lime adm-btn-add"
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
      </SaveBar>
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
              <Remove disabled={s.busy} onClick={() => void s.run(() => removeSpecial(r.id))} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="adm-meta">{A.staff.noSpecial}</p>
      )}
      <label className="adm-field">
        <span>{A.visit.date}</span>
        <input type="date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>
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
      <SaveBar>
        {s.view}
        <button
          type="button"
          className="adm-btn adm-btn-lime adm-btn-add"
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
      </SaveBar>
    </div>
  );
}
