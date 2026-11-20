"use client";

/**
 * «Основные показатели» (analytics/), laid out as the tool's page measures
 * (docs/altegio-pages.md, «D. Dashboards»): the title with its star and the
 * breadcrumb «Отчёты»; «Период» with the date range, «Выбрано N дней» and
 * «Фильтры»; then one 800px column of three cards 24px apart:
 *
 *   «Продажи»        Итого · Услуги · Товары, the line chart, then the three
 *                    averages and the footnote;
 *   «Посещаемость»   Клиенты · Визиты · Записи, the bars of new and other
 *                    clients, then Новые · Не новых · Потерянные, each with
 *                    «Посмотреть клиентов»;
 *   «Заполненность»  Завершённые · Незавершённые · Отменённые (each also a
 *                    share of all records), the bars of busy time and
 *                    no-shows, and «Средняя заполненность».
 *
 * A card: its name and an (i) that says how we count it, the value, the
 * change against the period before (red down, grey none, green up; «—»
 * when the period before had nothing), a line under it.
 *
 * The period and the barber are the page's address: a new one is a new page
 * from the server. «Посмотреть клиентов» asks an action for the names and
 * shows them in a sheet; a name opens the client's card for a login that
 * has the client base.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { Figure, KpiClientKind, KpiClients, KpiReport } from "@/lib/admin/dashboards";
import { addMonths } from "@/lib/admin/record-filter";
import { addDays } from "@/lib/tz";
import { cap } from "../../copy.shared";
import { CaretIcon, FunnelIcon, InfoIcon } from "../../icons";
import { useA } from "../../lang";
import { useFrame } from "../frame";
import { Pop } from "../pop";
import { Sheet } from "../sheet";
import { Titled } from "../star";
import { kpiClientsAction } from "./actions";
import { LineChart, StackedBars } from "./charts";

type Option = { id: string; name: string; active: boolean };

export type KpiViewProps = {
  report: KpiReport;
  /** how many days the period has: «Выбрано N дней» */
  days: number;
  today: string;
  staff: Option[];
  /** a name in «Посмотреть клиентов» opens the client's card */
  cards: boolean;
};

/** The tool's chart colours (docs/altegio-pages.md, «Charts»). */
const C = {
  total: "#6644e0",
  services: "#df7800",
  goods: "#72bef4",
  fresh: "rgba(114, 189, 243, .85)",
  regular: "rgba(102, 68, 224, .85)",
  busy: "rgba(255, 203, 0, .85)",
  noShow: "#72bef4",
};

const noon = (date: string) => new Date(`${date}T12:00:00Z`);

export function KpiView({ report, days, today, staff, cards }: KpiViewProps) {
  const A = useA();
  const D = A.dash;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [list, setList] = useState<KpiClientKind | null>(null);

  const go = (from: string, to: string, staffId: string | null) => {
    const q = new URLSearchParams({ from, to });
    if (staffId) q.set("staff", staffId);
    start(() => router.push(`/admin/analytics?${q}`));
  };

  const f = useMemo(() => {
    const money = new Intl.NumberFormat(A.intl, { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const num = new Intl.NumberFormat(A.intl, { maximumFractionDigits: 1 });
    const short = new Intl.DateTimeFormat(A.intl, { timeZone: "UTC", day: "numeric", month: "short" });
    const long = new Intl.DateTimeFormat(A.intl, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
    const dmy = new Intl.DateTimeFormat(A.intl, { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
    return {
      eur: (cents: number) => money.format(cents / 100),
      num: (n: number) => num.format(n),
      pct: (n: number) => `${num.format(n)} %`,
      short: (d: string) => short.format(noon(d)).replace(".", ""),
      long: (d: string) => cap(long.format(noon(d))),
      dmy: (d: string) => dmy.format(noon(d)),
    };
  }, [A.intl]);

  const S = report.sales;
  const V = report.attendance;
  const F = report.fill;
  const dates = S.days.map((d) => d.date);
  const records = F.done.cur + F.open.cur + F.cancelled.cur;
  const share = (n: number) => D.share(f.num(records ? Math.round((n * 100) / records) : 0));

  return (
    <div className={`dsk${pending ? " is-busy" : ""}`}>
      <div className="adm-page-head dsk-head">
        <div className="cb-titles">
          <Titled page="analytics">
            <h1 className="adm-h1">{D.kpi}</h1>
          </Titled>
          <p className="cb-crumb only-wide">{D.crumb}</p>
        </div>
      </div>

      <div className="dsk-controls">
        <span className="dsk-label">{D.period}</span>
        <PeriodPicker report={report} today={today} format={f.dmy} onPick={(from, to) => go(from, to, report.staffId)} />
        <span className="dsk-label">{D.picked(days)}</span>
        <FiltersPicker staff={staff} picked={report.staffId} onPick={(id) => go(report.period.from, report.period.to, id)} />
      </div>

      <section className="dsk-card" aria-labelledby="dsk-sales">
        <h2 id="dsk-sales">{D.sales}</h2>
        <div className="dsk-kpis">
          <Kpi label={D.total} hint={D.hints.total} fig={S.total} value={f.eur} sub={D.ops(S.totalOps.cur)} />
          <Kpi label={D.services} hint={D.hints.services} fig={S.services} value={f.eur} sub={D.ops(S.servicesOps.cur)} />
          <Kpi label={D.goods} hint={D.hints.goods} fig={S.goods} value={f.eur} sub={D.ops(S.goodsOps.cur)} />
        </div>
        <LineChart
          dates={dates}
          dayLabel={f.short}
          dayTitle={f.long}
          format={f.eur}
          label={D.sales}
          minTop={10_000}
          series={[
            { key: "total", label: D.legend.total, color: C.total, values: S.days.map((d) => d.servicesCents + d.goodsCents) },
            { key: "services", label: D.legend.services, color: C.services, values: S.days.map((d) => d.servicesCents) },
            { key: "goods", label: D.legend.goods, color: C.goods, values: S.days.map((d) => d.goodsCents) },
          ]}
        />
        <div className="dsk-kpis">
          <Kpi label={D.avgVisit} hint={D.hints.avgVisit} fig={S.avgVisit} value={f.eur} />
          <Kpi label={D.avgService} hint={D.hints.avgService} fig={S.avgService} value={f.eur} />
          <Kpi label={D.avgGoods} hint={D.hints.avgGoods} fig={S.avgGoods} value={f.eur} />
        </div>
        <p className="dsk-foot">{D.salesNote}</p>
      </section>

      <section className="dsk-card" aria-labelledby="dsk-visits">
        <div className="dsk-card-head">
          <h2 id="dsk-visits">{D.attendance}</h2>
          <Hint text={D.hints.attendance} />
        </div>
        <div className="dsk-kpis">
          <Kpi label={D.clients} hint={D.hints.clients} fig={V.clients} value={f.num} see={() => setList("clients")} />
          <Kpi label={D.visits} hint={D.hints.visits} fig={V.visits} value={f.num} />
          <Kpi label={D.records} hint={D.hints.records} fig={V.records} value={f.num} />
        </div>
        <StackedBars
          dates={dates}
          dayLabel={f.short}
          dayTitle={f.long}
          format={f.num}
          total={f.num}
          label={D.attendance}
          minTop={4}
          series={[
            { key: "fresh", label: D.legend.fresh, color: C.fresh, values: V.days.map((d) => d.fresh) },
            { key: "regular", label: D.legend.regular, color: C.regular, values: V.days.map((d) => d.regular) },
          ]}
        />
        <div className="dsk-kpis">
          <Kpi label={D.fresh} hint={D.hints.fresh} fig={V.fresh} value={f.num} see={() => setList("fresh")} />
          <Kpi label={D.regular} hint={D.hints.regular} fig={V.regular} value={f.num} see={() => setList("regular")} />
          <Kpi label={D.lost} hint={D.hints.lost} fig={V.lost} value={f.num} see={() => setList("lost")} />
        </div>
      </section>

      <section className="dsk-card" aria-labelledby="dsk-fill">
        <h2 id="dsk-fill">{D.fill}</h2>
        <div className="dsk-kpis">
          <Kpi label={D.done} hint={D.hints.done} fig={F.done} value={f.num} sub={share(F.done.cur)} />
          <Kpi label={D.open} hint={D.hints.open} fig={F.open} value={f.num} sub={share(F.open.cur)} />
          <Kpi label={D.cancelled} hint={D.hints.cancelled} fig={F.cancelled} value={f.num} sub={share(F.cancelled.cur)} />
        </div>
        <StackedBars
          dates={dates}
          dayLabel={f.short}
          dayTitle={f.long}
          format={f.pct}
          total={(n) => f.pct(Math.round(n))}
          label={D.fill}
          minTop={10}
          series={[
            { key: "busy", label: D.legend.busy, color: C.busy, values: F.days.map((d) => d.busyPct ?? 0) },
            { key: "noShow", label: D.legend.noShow, color: C.noShow, values: F.days.map((d) => d.noShowPct ?? 0) },
          ]}
        />
        <div className="dsk-kpis">
          <Kpi label={D.avgFill} hint={D.hints.avgFill} fig={F.avg} value={f.pct} sub={D.perDay} />
        </div>
      </section>

      {list && <ClientsSheet kind={list} report={report} cards={cards} format={f.dmy} onClose={() => setList(null)} />}
    </div>
  );
}

/* ---------- a card ---------- */

function Hint({ text }: { text: string }) {
  return (
    <span className="dsk-i" title={text} aria-label={text} role="img">
      <InfoIcon size={16} />
    </span>
  );
}

/** The change against the period before: «↓ -10 %», «0 %», «↑ 11 %», or «—» with nothing to compare with. */
export function Change({ fig, value }: { fig: Figure; value: (n: number) => string }) {
  const D = useA().dash;
  const c = fig.change;
  const kind = c === null ? "none" : c > 0 ? "up" : c < 0 ? "down" : "same";
  const text = c === null ? "—" : c > 0 ? `↑ ${c} %` : c < 0 ? `↓ ${c} %` : "0 %";
  const title = c === null ? D.noBase : D.prevWas(value(fig.prev));
  return (
    <span className={`dsk-change is-${kind}`} title={title}>
      <span aria-hidden="true">{text}</span>
      <span className="sr">{`${c === null ? "" : `${c} %. `}${title}`}</span>
    </span>
  );
}

function Kpi({ label, hint, fig, value, sub, see }: { label: string; hint: string; fig: Figure; value: (n: number) => string; sub?: string; see?: () => void }) {
  const D = useA().dash;
  return (
    <div className="dsk-kpi">
      <div className="dsk-kpi-top">
        <span>{label}</span>
        <Hint text={hint} />
      </div>
      <div className="dsk-kpi-val">
        <b className="num">{value(fig.cur)}</b>
        <Change fig={fig} value={value} />
      </div>
      {sub && <small>{sub}</small>}
      {see && (
        <button type="button" className="dsk-see" onClick={see} disabled={fig.cur === 0}>
          {D.seeClients} <span aria-hidden="true">↗</span>
        </button>
      )}
    </div>
  );
}

/* ---------- «Период» and «Фильтры» ---------- */

function PeriodPicker({ report, today, format, onPick }: { report: KpiReport; today: string; format: (d: string) => string; onPick: (from: string, to: string) => void }) {
  const D = useA().dash;
  const [from, setFrom] = useState(report.period.from);
  const [to, setTo] = useState(report.period.to);
  const month = today.slice(0, 8) + "01";
  const lastMonth = addMonths(month, -1);
  const presets: [string, string, string][] = [
    [D.presets.today, today, today],
    [D.presets.yesterday, addDays(today, -1), addDays(today, -1)],
    [D.presets.week, addDays(today, -6), today],
    [D.presets.month, addDays(today, -29), today],
    [D.presets.thisMonth, month, addDays(addMonths(month, 1), -1)],
    [D.presets.lastMonth, lastMonth, addDays(month, -1)],
  ];
  return (
    <Pop
      kind="dialog"
      name={D.period}
      place="left"
      className="dsk-range"
      button={
        <>
          <span className="num">{`${format(report.period.from)} – ${format(report.period.to)}`}</span>
          <CalIcon />
        </>
      }
    >
      {(close) => (
        <form
          className="dsk-pop"
          onSubmit={(e) => {
            e.preventDefault();
            if (!from || !to) return;
            close();
            onPick(from, to);
          }}
        >
          <div className="dsk-presets">
            {presets.map(([word, a, b]) => (
              <button
                key={word}
                type="button"
                aria-pressed={a === report.period.from && b === report.period.to}
                onClick={() => {
                  close();
                  onPick(a, b);
                }}
              >
                {word}
              </button>
            ))}
          </div>
          <div className="dsk-dates">
            <label>
              <span>{D.from}</span>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} required />
            </label>
            <label>
              <span>{D.to}</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} required />
            </label>
          </div>
          <div className="dsk-pop-btns">
            <button type="button" className="dsk-btn" onClick={close}>
              {D.cancelBtn}
            </button>
            <button type="submit" className="dsk-btn is-main">
              {D.apply}
            </button>
          </div>
        </form>
      )}
    </Pop>
  );
}

function FiltersPicker({ staff, picked, onPick }: { staff: Option[]; picked: string | null; onPick: (staffId: string | null) => void }) {
  const D = useA().dash;
  const [who, setWho] = useState(picked ?? "");
  return (
    <Pop
      kind="dialog"
      name={D.filters}
      place="left"
      marked={!!picked}
      className="dsk-filters"
      button={
        <>
          <FunnelIcon size={14} />
          <span>{D.filters}</span>
        </>
      }
    >
      {(close) => (
        <form
          className="dsk-pop"
          onSubmit={(e) => {
            e.preventDefault();
            close();
            onPick(who || null);
          }}
        >
          <label className="dsk-field">
            <span>{D.staff}</span>
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">{D.allStaff}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.active ? s.name : `${s.name} (${D.left})`}
                </option>
              ))}
            </select>
          </label>
          <div className="dsk-pop-btns">
            <button type="button" className="dsk-link" onClick={() => setWho("")}>
              {D.reset}
            </button>
            <span />
            <button type="button" className="dsk-btn" onClick={close}>
              {D.cancelBtn}
            </button>
            <button type="submit" className="dsk-btn is-main">
              {D.apply}
            </button>
          </div>
        </form>
      )}
    </Pop>
  );
}

function CalIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

/* ---------- «Посмотреть клиентов» ---------- */

function ClientsSheet({ kind, report, cards, format, onClose }: { kind: KpiClientKind; report: KpiReport; cards: boolean; format: (d: string) => string; onClose: () => void }) {
  const A = useA();
  const D = A.dash;
  const frame = useFrame();
  const [data, setData] = useState<KpiClients | null | "failed">(null);
  const { from, to } = report.period;
  const staffId = report.staffId;
  const { say } = frame;
  const error = A.error;
  useEffect(() => {
    // an answer that comes after the sheet is closed is dropped
    let live = true;
    kpiClientsAction({ from, to, staffId, kind }).then(
      (r) => live && setData(r ?? "failed"),
      () => {
        if (!live) return;
        setData("failed");
        say(error, true);
      },
    );
    return () => {
      live = false;
    };
  }, [from, to, staffId, kind, say, error]);
  const dmy = new Intl.DateTimeFormat(A.intl, { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <Sheet title={D.listOf[kind]} onClose={onClose}>
      <p className="adm-meta">{`${format(report.period.from)} – ${format(report.period.to)}`}</p>
      {data === null ? (
        <p className="adm-wait">{A.loading}</p>
      ) : data === "failed" ? (
        <p className="adm-err">{D.failed}</p>
      ) : data.rows.length === 0 ? (
        <p className="adm-meta">{D.noClients}</p>
      ) : (
        <>
          <ul className="dsk-names">
            {data.rows.map((c) => {
              const line = `${D.visitsN(c.visits)} · ${D.lastVisit(dmy.format(c.last))}`;
              return (
                <li key={c.id}>
                  {cards ? (
                    <Link href={`/admin/clients/${c.id}`} prefetch={false}>
                      <b>{c.name}</b>
                      <small>{line}</small>
                      <CaretIcon size={12} />
                    </Link>
                  ) : (
                    <div>
                      <b>{c.name}</b>
                      <small>{line}</small>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {data.total > data.rows.length && <p className="adm-meta">{D.shown(data.rows.length, data.total)}</p>}
        </>
      )}
    </Sheet>
  );
}
