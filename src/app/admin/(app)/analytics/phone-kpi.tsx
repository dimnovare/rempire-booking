"use client";

/**
 * «Отчёты» on a phone (Dim, decision round 11; the design board «Отчёты как
 * вкладка телефона»): «Основные показатели» as one screen under a dark
 * head, as the phone app we follow has it. From 900px the page is the full
 * report (kpi-view.tsx); the figures are the same (src/lib/admin/phone-kpi.ts).
 *
 *   head      the title and the period: a day, a month, or «С – По»;
 *   segments  День · Неделя · Месяц · Период;
 *   staff     «Все сотрудники» or one barber, in a sheet;
 *   revenue   the sum, its change against the period before, seven bars;
 *   rows      Клиенты / Средний чек, Записи / Онлайн, Не пришли /
 *             Отменили, Товары / Продано барберами, Загрузка.
 *
 * A change asks the server again (phoneKpiAction) and the screen keeps its
 * place: the address stays the wide page's.
 */
import { useState } from "react";
import type { PhoneKpi, PhonePer } from "@/lib/admin/phone-kpi";
import { cap } from "../../copy.shared";
import { CaretIcon, NextIcon } from "../../icons";
import { useA } from "../../lang";
import { useFrame } from "../frame";
import { Sheet } from "../sheet";
import { phoneKpiAction } from "./actions";
import "./phone-kpi.css";

const PERS: readonly PhonePer[] = ["day", "week", "month", "range"];
type Query = { per: PhonePer; at: string; to: string; staffId: string | null };

const noon = (date: string) => new Date(`${date}T12:00:00Z`);
const fmt = (intl: string, date: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intl, { timeZone: "UTC", ...o }).format(noon(date));
/** «6 412 €», «45,15 €» */
const money = (cents: number) => `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100)} €`;
/** «2026-11-16» → its weekday names from a Monday */
const MONDAY = "2026-11-16";

export function PhoneKpiView({ initial, staff, today }: { initial: PhoneKpi; staff: { id: string; name: string }[]; today: string }) {
  const A = useA();
  const K = A.kpiPhone;
  const frame = useFrame();
  const [data, setData] = useState(initial);
  const [q, setQ] = useState<Query>({ per: initial.per, at: initial.period.from, to: initial.period.to, staffId: initial.staffId });
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"staff" | "range" | null>(null);
  const [range, setRange] = useState({ from: initial.period.from, to: initial.period.to });

  const load = async (next: Query) => {
    setQ(next);
    setBusy(true);
    try {
      const r = await phoneKpiAction({ per: next.per, at: next.at, to: next.to, staffId: next.staffId });
      if (r) setData(r);
      else frame.say(K.failed, true);
    } catch {
      frame.say(K.failed, true);
    } finally {
      setBusy(false);
    }
  };

  const P = data.period;
  // a new kind of period starts from today when it is in the one shown, else from its first day
  const anchor = P.from <= today && today <= P.to ? today : P.from;
  const pick = (per: PhonePer) => {
    if (per === "range") {
      setRange({ from: P.from, to: P.to });
      return setSheet("range");
    }
    if (per !== q.per) void load({ ...q, per, at: anchor });
  };

  /* ---- the words of the period ---- */
  const short = (d: string) => fmt(A.intl, d, { day: "numeric", month: "short" });
  const sameMonth = P.from.slice(0, 7) === P.to.slice(0, 7);
  const thisYear = P.from.slice(0, 4) === today.slice(0, 4);
  const monthName = fmt(A.intl, P.from, { month: "long" });
  const pill =
    data.per === "day"
      ? cap(fmt(A.intl, P.from, { weekday: "short", day: "numeric", month: "short" }))
      : data.per === "month"
        ? `${cap(monthName)}${thisYear ? "" : ` ${P.from.slice(0, 4)}`}`
        : sameMonth
          ? `${Number(P.from.slice(8))}–${short(P.to)}`
          : `${short(P.from)} – ${short(P.to)}`;
  const revenueFor =
    data.per === "day" ? K.revenueDay(fmt(A.intl, P.from, { day: "numeric", month: "long" })) : data.per === "week" ? K.revenueWeek : data.per === "month" ? K.revenueMonth(monthName) : K.revenueRange;
  const vs =
    data.per === "day" ? K.vsDay(fmt(A.intl, data.prev.from, { day: "numeric", month: "long" })) : data.per === "week" ? K.vsWeek : data.per === "month" ? K.vsMonth(Number(data.prev.from.slice(5, 7)) - 1) : K.vsRange;
  const change = data.revenue.change;
  const days = Array.from({ length: 7 }, (_, i) => fmt(A.intl, addDay(MONDAY, i), { weekday: "short" }).replace(".", ""));
  const top = Math.max(1, ...data.bars.map((b) => b.cents));
  const who = q.staffId ? (staff.find((s) => s.id === q.staffId)?.name ?? K.allStaff) : K.allStaff;

  return (
    <div className="pk" aria-busy={busy}>
      <div className="pk-head">
        <h1>{K.title}</h1>
        {data.per === "range" ? (
          <button type="button" className="pk-pick" aria-label={`${K.perLabel}: ${pill}`} onClick={() => pick("range")}>
            <span>{pill}</span>
            <CaretIcon />
          </button>
        ) : (
          <label className="pk-pick">
            <span>{pill}</span>
            <CaretIcon />
            <input
              type={data.per === "month" ? "month" : "date"}
              aria-label={data.per === "month" ? K.pickMonth : K.pickDay}
              value={data.per === "month" ? P.from.slice(0, 7) : data.per === "week" ? anchor : P.from}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  // an older browser opens its own picker on the tap
                }
              }}
              onChange={(e) => e.target.value && void load({ ...q, per: data.per, at: e.target.value })}
            />
          </label>
        )}
      </div>

      <div className="pk-seg" role="group" aria-label={K.perLabel}>
        {PERS.map((per) => (
          <button key={per} type="button" aria-pressed={data.per === per} disabled={busy} onClick={() => pick(per)}>
            {K.pers[per]}
          </button>
        ))}
      </div>

      <button type="button" className="pk-staff" onClick={() => setSheet("staff")}>
        <span className="txt">
          <small>{K.staff}</small>
          <b>{who}</b>
        </span>
        <NextIcon size={18} />
      </button>

      <section className="pk-rev" aria-label={revenueFor}>
        <div className="pk-rev-top">
          <span>{revenueFor}</span>
          {change !== null && (
            <b className={change > 0 ? "up" : change < 0 ? "down" : undefined}>
              {change > 0 ? "+" : change < 0 ? "−" : ""}
              {Math.abs(change)} % {vs}
            </b>
          )}
        </div>
        <p className="pk-sum">{money(data.revenue.cur)}</p>
        <div className="pk-bars" role="img" aria-label={`${K.bars}: ${data.bars.map((b) => `${days[b.weekday]} ${money(b.cents)}`).join(", ")}`}>
          {data.bars.map((b, i) => (
            <span key={b.weekday} className={i === data.lit ? "is-lit" : undefined} style={{ height: `${Math.max(6, Math.round((b.cents * 100) / top))}%` }} />
          ))}
        </div>
        <div className="pk-days" aria-hidden="true">
          {data.bars.map((b, i) => (
            <span key={b.weekday} className={i === data.lit ? "is-lit" : undefined}>
              {days[b.weekday]}
            </span>
          ))}
        </div>
      </section>

      <dl className="pk-rows">
        <Row name={K.clients} sub={K.avg} value={String(data.clients)} subValue={money(data.avgCents)} />
        <Row name={K.records} sub={K.online} value={String(data.records)} subValue={`${data.onlinePct} %`} />
        <Row name={K.noShows} sub={K.cancelled} value={String(data.noShows)} subValue={String(data.cancelled)} />
        <Row name={K.goods} sub={K.goodsSold} value={String(data.goods)} subValue={money(data.goodsCents)} />
        <Row name={K.load} sub={K.loadHint} value={data.loadPct === null ? K.none : `${data.loadPct} %`} />
      </dl>

      {sheet === "staff" && (
        <Sheet title={K.staff} onClose={() => setSheet(null)}>
          <div className="pk-list" role="group" aria-label={K.staff}>
            {[{ id: null, name: K.allStaff }, ...staff].map((s) => (
              <button
                key={s.id ?? "all"}
                type="button"
                aria-pressed={q.staffId === s.id}
                onClick={() => {
                  setSheet(null);
                  if (q.staffId !== s.id) void load({ ...q, per: data.per, at: P.from, to: P.to, staffId: s.id });
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === "range" && (
        <Sheet
          title={K.pers.range}
          onClose={() => setSheet(null)}
          bar={
            <button
              type="button"
              className="adm-btn adm-btn-lime"
              disabled={!range.from || !range.to}
              onClick={() => {
                setSheet(null);
                const [from, to] = range.from <= range.to ? [range.from, range.to] : [range.to, range.from];
                void load({ ...q, per: "range", at: from, to });
              }}
            >
              {K.show}
            </button>
          }
        >
          <div className="adm-row">
            <label className="adm-field">
              <span>{K.from}</span>
              <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </label>
            <label className="adm-field">
              <span>{K.to}</span>
              <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </label>
          </div>
        </Sheet>
      )}
    </div>
  );
}

const addDay = (date: string, n: number) => new Date(noon(date).getTime() + n * 86_400_000).toISOString().slice(0, 10);

function Row({ name, sub, value, subValue }: { name: string; sub: string; value: string; subValue?: string }) {
  return (
    <div className="pk-row">
      <dt>
        <b>{name}</b>
        <small>{sub}</small>
      </dt>
      <dd>
        <b>{value}</b>
        {subValue !== undefined && <small>{subValue}</small>}
      </dd>
    </div>
  );
}
