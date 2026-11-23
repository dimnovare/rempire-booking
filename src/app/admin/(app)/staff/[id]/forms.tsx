"use client";

/**
 * The barber page's parts. Profile and the week save by themselves
 * (autosave.tsx). The lists (special days, time off, special time) add a
 * record with one «Добавить» and remove one with one tap. His services and
 * prices are only shown: they are set in each service's window.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { hhmm, momentAt } from "@/lib/admin/grid";
import { effective, ownPrice, ownTime, sumUp } from "@/lib/admin/service-board";
import type { DayOverride, HoursDay, Offer, SpecialRow, TimeOffRow } from "@/lib/admin/staff";
import { extraText, MAX_EXTRA_PCT } from "@/lib/slots";
import { addDays } from "@/lib/tz";
import { useA } from "../../../lang";
import { Ava, NextIcon, XIcon } from "../../../icons";
import { SaveState, useAutoSave } from "../../autosave";
import { shrinkPhoto } from "../../photo-shrink";
import { priceText } from "../../services/labels";
import { addOff, addSpecial, removeOff, removeSpecial, saveDay, saveHours, saveProfile, uploadPhoto } from "../actions";

type Msg = { ok: boolean; text: string } | null;

function useSaver() {
  const A = useA();
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
const dt = (intl: string, tz: string) => new Intl.DateTimeFormat(intl, { timeZone: tz, day: "numeric", month: "short", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dOnly = (intl: string, date: string) => new Intl.DateTimeFormat(intl, { timeZone: "UTC", weekday: "short", day: "numeric", month: "long" }).format(Date.parse(`${date}T12:00:00Z`));

/** The bottom of each part: its message and its one button; it stays in view while the part scrolls. */
function SaveBar({ children }: { children: React.ReactNode }) {
  return <div className="adm-savebar">{children}</div>;
}

function Remove({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const A = useA();
  return (
    <button type="button" className="adm-ibtn" aria-label={A.remove} disabled={disabled} onClick={onClick}>
      <XIcon size={18} />
    </button>
  );
}

type Profile = { name: string; role: { ru: string; et: string; en: string }; photoUrl: string; bookable: boolean; active: boolean };

/** A barber who exists saves by itself; a new one is made with the one button. */
export function ProfileForm({ id, initial, onDone }: { id: string | null; initial: Profile; onDone?: () => void }) {
  const A = useA();
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

/** A service as this barber does it: his price and time (the service's when he has none of his own). */
export function offerEff(o: Offer) {
  const base = { priceCents: o.defaultCents, priceMaxCents: o.defaultMaxCents, durationMin: o.defaultMin };
  const e = effective(base, o);
  return { e, price: sumUp(base, [e]).price, own: ownPrice(base, e) || ownTime(base, e) };
}

/**
 * «Услуги и цены», read only: the services he does, at his price and time.
 * They are set in the service's window, so each one links there when the
 * login may open «Услуги» (`link`).
 */
export function OffersList({ offers, link }: { offers: Offer[]; link: boolean }) {
  const A = useA();
  const mine = offers.filter((o) => o.offered);
  return (
    <div className="adm-form">
      <p className="adm-meta">{A.services.onStaff.hint}</p>
      {mine.length ? (
        <ul className="adm-list">
          {mine.map((o) => {
            const { e, price, own } = offerEff(o);
            const body = (
              <>
                <span className="txt">
                  <span className="plain">{A.pick(o.name)}</span>
                  <small>
                    {A.mins(e.durationMin)}
                    {own && (
                      <>
                        {" · "}
                        <span className="adm-tag lime">{A.services.onStaff.own}</span>
                      </>
                    )}
                    {!o.active && (
                      <>
                        {" · "}
                        <span className="adm-tag">{A.services.inactive}</span>
                      </>
                    )}
                  </small>
                </span>
                <span className="end price">{priceText(A, price)}</span>
              </>
            );
            return (
              <li key={o.serviceId}>
                {link ? (
                  <Link className={`adm-item${o.active ? "" : " is-off"}`} href={`/admin/services?open=${o.serviceId}`}>
                    {body}
                    <span className="adm-chev">
                      <NextIcon />
                    </span>
                  </Link>
                ) : (
                  <div className={`adm-item${o.active ? "" : " is-off"}`}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="adm-meta">{A.staff.none}</p>
      )}
      {link && (
        <Link className="adm-link" href="/admin/services">
          {A.services.onStaff.all}
        </Link>
      )}
    </div>
  );
}

type Week = Record<number, [string, string][]>;

export function HoursForm({ staffId, hours, onDone }: { staffId: string; hours: HoursDay[]; onDone?: () => void }) {
  const A = useA();
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
      {/* only while Monday has hours: copying a day off would close Tue–Fri at once, and the week saves itself */}
      {(days[1] ?? []).length > 0 && (
        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setDays({ ...days, 2: days[1], 3: days[1], 4: days[1], 5: days[1] })}>
          {A.staff.copyMon}
        </button>
      )}
      <SaveBar>
        <SaveState auto={auto} onDone={onDone} />
      </SaveBar>
    </form>
  );
}

export function DaysForm({ staffId, overrides, today }: { staffId: string; overrides: DayOverride[]; today: string }) {
  const A = useA();
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
                {dOnly(A.intl, o.date)} · {o.spans.length ? o.spans.map(([a, b]) => `${a}–${b}`).join(", ") : A.staff.dayOff}
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
  const A = useA();
  const [kind, setKind] = useState("vacation");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const s = useSaver();
  const f = dt(A.intl, tz);
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

/**
 * Special time: the hours and their extra, which is an amount in euros or a
 * percent of the visit's price («€ | %» next to the one number). Each way
 * keeps its own number, so «20 €» never turns into «20 %» by a tap.
 */
export function SpecialForm({ staffId, rows, tz, today }: { staffId: string; rows: SpecialRow[]; tz: string; today: string }) {
  const A = useA();
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState("20:00");
  const [to, setTo] = useState("22:00");
  const [unit, setUnit] = useState<"eur" | "pct">("eur");
  const [extra, setExtra] = useState({ eur: "20", pct: "50" });
  const [note, setNote] = useState("");
  const s = useSaver();
  const f = dt(A.intl, tz);
  const t = new Intl.DateTimeFormat(A.intl, { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <div className="adm-form">
      <p className="adm-meta">{A.staff.specialHint}</p>
      {rows.length ? (
        <ul className="adm-mini">
          {rows.map((r) => (
            <li key={r.id}>
              <span>
                {f.format(r.from)}–{t.format(r.to)} · {extraText(r)}
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
      <div className="adm-field">
        <span>{A.staff.extra}</span>
        <div className="adm-row">
          <input
            type="number"
            inputMode={unit === "pct" ? "numeric" : "decimal"}
            min={unit === "pct" ? 1 : 0}
            max={unit === "pct" ? MAX_EXTRA_PCT : undefined}
            step="1"
            aria-label={A.staff.extra}
            value={extra[unit]}
            onChange={(e) => setExtra({ ...extra, [unit]: e.target.value })}
          />
          <div className="adm-seg adm-seg-wide" role="group" aria-label={A.staff.extraUnit} style={{ flex: "0 0 112px" }}>
            <button type="button" aria-pressed={unit === "eur"} onClick={() => setUnit("eur")}>
              €
            </button>
            <button type="button" aria-pressed={unit === "pct"} onClick={() => setUnit("pct")}>
              %
            </button>
          </div>
        </div>
        {unit === "pct" && <small className="adm-meta">{A.staff.extraPctHint}</small>}
      </div>
      <label className="adm-field">
        <span>{A.block.note}</span>
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </label>
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
            // euros become cents; a percent goes as typed (the server wants a whole one, 1–300)
            const n = Number(extra[unit].replace(",", ".").trim());
            void s.run(() => addSpecial({ staffId, from: momentAt(date, a, tz), to: end, ...(unit === "pct" ? { extraPct: n } : { extraCents: Math.round(n * 100) }), note }));
          }}
        >
          {A.add}
        </button>
      </SaveBar>
    </div>
  );
}
