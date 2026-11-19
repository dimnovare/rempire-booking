"use client";

/**
 * «График работы»: the month grid of shifts (the owner, 19.11.2026). From
 * 900px its sizes, colours and fonts are the design board's of the same
 * name (measured in the product we follow, docs/altegio-pages.md): a 264px
 * column of barbers and a 91px «Итого» that stay in place, 38px days with
 * the number, the weekday and how many work; weekends red, today a yellow
 * chip over a tinted column; a shift a green block with its start and end
 * on two lines, the day's visits at its foot on the left and a dot on the
 * right when the day has a break. A day off is an empty cell; a vacation
 * and a sick day have their own pale colours and a short word. The icons
 * and the words are ours.
 *
 * **Editing** (with «Редактирование графика работы»): a click marks a cell,
 * further clicks mark more, of other barbers too; the panel on the right
 * (schedule-panel.tsx) gives them a kind and hours, or fills a period by a
 * template. «Отмена» drops the marks. A barber's «…» copies his days onto
 * others. On a phone the grid scrolls sideways inside its own box with the
 * barbers' column in place; a tap marks a cell, and the panel is a sheet
 * behind «Изменить».
 *
 * The toolbar's choices (who is shown, the two switches of the cog) are
 * the browser tab's own (tab-state.ts). The month and the view are in the
 * address: a reload shows the same grid. «Печать» is the browser's own
 * print, with a stylesheet that fits the grid on a landscape page.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ScheduleCell, ScheduleData, ScheduleStaff } from "@/lib/admin/schedule";
import { monthStart, totalsOf } from "@/lib/admin/schedule-plan";
import { addDays, isoWeekday } from "@/lib/tz";
import { Ava, CaretIcon, CogIcon, DotsIcon, NextIcon, PrevIcon, PrintIcon, TickIcon } from "../../icons";
import { useA } from "../../lang";
import { useFrame } from "../frame";
import { Pop } from "../pop";
import { Titled } from "../star";
import { useTabState } from "../tab-state";
import { CopyDialog, EditPanel, type Picked } from "./schedule-panel";

const noon = (date: string) => new Date(`${date}T12:00:00Z`);
const keyOf = (c: Picked) => `${c.staffId}:${c.date}`;

export type ScheduleViewProps = {
  data: ScheduleData;
  view: "month" | "week";
  /** the day the address names: its month or its week is shown */
  date: string;
  /** today in the salon's zone */
  today: string;
  /** what the login may do here: change the schedule */
  may: { edit: boolean };
};

export function ScheduleView({ data, view, date, today, may }: ScheduleViewProps) {
  const A = useA();
  const S = A.schedule;
  const frame = useFrame();
  const router = useRouter();
  const [pending, start] = useTransition();
  const dates = data.dates;

  // the tab's own choices: who is hidden, and the cog's two switches
  const [hiddenRaw, setHiddenRaw] = useTabState("adm-sc-hide", "");
  const hidden = hiddenRaw.split(",").filter(Boolean);
  const [totalsRaw, setTotalsRaw] = useTabState("adm-sc-totals", "1");
  const [countsRaw, setCountsRaw] = useTabState("adm-sc-counts", "1");
  const showTotals = totalsRaw !== "0";
  const showCounts = countsRaw !== "0";
  const rows = data.staff.filter((s) => !hidden.includes(s.id));

  // the marked cells, in the order they were marked; `round` counts the times the panel was opened anew
  const [picked, setPicked] = useState<Picked[]>([]);
  const [round, setRound] = useState(0);
  // a phone: the panel is a sheet behind «Изменить»
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menu, setMenu] = useState<{ staffId: string; x: number; y: number } | null>(null);
  const [copyFor, setCopyFor] = useState<string | null>(null);

  const marked = new Set(picked.map(keyOf));
  const toggle = (c: Picked) => {
    if (!may.edit) return;
    if (!picked.length) setRound((n) => n + 1);
    setPicked((cur) => (cur.some((x) => keyOf(x) === keyOf(c)) ? cur.filter((x) => keyOf(x) !== keyOf(c)) : [...cur, c]));
  };
  const drop = () => {
    setPicked([]);
    setSheetOpen(false);
  };
  // a barber who is no longer shown keeps no marked cell
  const shown = picked.filter((c) => rows.some((s) => s.id === c.staffId));

  const go = (d: string, v: "month" | "week" = view) => {
    const p = new URLSearchParams({ d });
    if (v === "week") p.set("v", "week");
    start(() => router.push(`/admin/schedule?${p}`));
  };

  // the «…» of a barber: a small menu beside its button, over everything
  const menuBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const shut = () => setMenu(null);
    const down = (e: PointerEvent) => {
      if (!menuBox.current?.contains(e.target as Node) && !(e.target as Element).closest?.(".sc-more")) shut();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && shut();
    document.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", shut);
    window.addEventListener("scroll", shut, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", shut);
      window.removeEventListener("scroll", shut, true);
    };
  }, [menu]);

  const wdFmt = new Intl.DateTimeFormat(A.intl, { weekday: "short", timeZone: "UTC" });
  const monthFmt = new Intl.DateTimeFormat(A.intl, { month: "long", timeZone: "UTC" });
  const dayFmt = new Intl.DateTimeFormat(A.intl, { day: "numeric", month: "short", timeZone: "UTC" });
  const hoursFmt = new Intl.NumberFormat(A.intl, { maximumFractionDigits: 2 });
  const title = view === "week" ? `${dayFmt.format(noon(dates[0]))} – ${dayFmt.format(noon(dates[6]))} ${dates[6].slice(0, 4)}` : A.frame.month(noon(date));
  const cellText = (c: ScheduleCell) => {
    const more = c.visits ? `, ${S.visitsN(c.visits)}` : "";
    if (c.kind !== "work") return `${S.kinds[c.kind]}${more}`;
    return `${c.spans[0][0]}–${c.spans[c.spans.length - 1][1]}${c.spans.length > 1 ? `, ${S.withBreak}` : ""}${more}`;
  };
  const menuOf = menu ? data.staff.find((s) => s.id === menu.staffId) : undefined;
  const copyFrom = copyFor ? data.staff.find((s) => s.id === copyFor) : undefined;
  const panel = shown.length > 0;

  return (
    <div className={`sc${panel ? " has-panel" : ""}${pending ? " is-pending" : ""}`}>
      <div className="adm-page-head sc-top">
        <Titled page="schedule">
          <h1 className="adm-h1">{S.title}</h1>
        </Titled>
        <button type="button" className="sc-print" onClick={() => window.print()}>
          <PrintIcon size={14} />
          <span>{S.print}</span>
        </button>
      </div>

      <div className="sc-bar" role="toolbar" aria-label={S.title}>
        <Pop
          kind="menu"
          name={S.filterTitle}
          place="left"
          className="sc-filter"
          marked={hidden.length > 0}
          button={
            <>
              <span>{S.filters}</span>
              <CaretIcon size={10} />
            </>
          }
        >
          {() => (
            <>
              <p className="sc-pop-title">{S.filterTitle}</p>
              {data.staff.map((s) => {
                const on = !hidden.includes(s.id);
                return (
                  <button key={s.id} type="button" role="menuitemcheckbox" aria-checked={on} className="jr-item" onClick={() => setHiddenRaw((on ? [...hidden, s.id] : hidden.filter((x) => x !== s.id)).join(","))}>
                    <span className={`jr-box${on ? " is-on" : ""}`}>
                      <TickIcon size={10} />
                    </span>
                    <span>{s.name}</span>
                  </button>
                );
              })}
              {hidden.length > 0 && (
                <button type="button" role="menuitem" className="jr-item sc-all" onClick={() => setHiddenRaw("")}>
                  <span>{S.everyone}</span>
                </button>
              )}
            </>
          )}
        </Pop>
        <button type="button" className="jr-btn jr-ibtn" aria-label={view === "week" ? S.prevWeek : S.prevMonth} onClick={() => go(view === "week" ? addDays(dates[0], -7) : monthStart(date, -1))}>
          <PrevIcon size={14} />
        </button>
        <button type="button" className="jr-btn jr-ibtn" aria-label={view === "week" ? S.nextWeek : S.nextMonth} onClick={() => go(view === "week" ? addDays(dates[0], 7) : monthStart(date, 1))}>
          <NextIcon size={14} />
        </button>
        <h2 className="sc-month" aria-live="polite">
          {title}
        </h2>
        <button type="button" className="jr-btn" onClick={() => go(today)}>
          {S.today}
        </button>
        <span className="sc-space" />
        <div className="sc-seg" role="group" aria-label={S.view}>
          <button type="button" className="jr-btn" aria-pressed={view === "week"} onClick={() => view !== "week" && go(dates.includes(today) ? today : dates[0], "week")}>
            {S.week}
          </button>
          <button type="button" className="jr-btn" aria-pressed={view === "month"} onClick={() => view !== "month" && go(date, "month")}>
            {S.month}
          </button>
        </div>
        <Pop kind="dialog" name={S.settings} label={S.settings} title={S.settings} icon button={<CogIcon />}>
          {() => (
            <div className="sc-set">
              <p className="sc-pop-title">{S.settings}</p>
              <label className="sc-switch">
                <span>{S.showTotals}</span>
                <input type="checkbox" role="switch" className="adm-sw" checked={showTotals} onChange={(e) => setTotalsRaw(e.target.checked ? "1" : "0")} />
              </label>
              <label className="sc-switch">
                <span>{S.showCounts}</span>
                <input type="checkbox" role="switch" className="adm-sw" checked={showCounts} onChange={(e) => setCountsRaw(e.target.checked ? "1" : "0")} />
              </label>
            </div>
          )}
        </Pop>
      </div>
      {may.edit && <p className="adm-meta sc-hint only-narrow">{S.hint}</p>}

      {data.staff.length === 0 ? (
        <p className="adm-note">{S.noStaff}</p>
      ) : (
        <div className={`sc-box${view === "week" ? " is-week" : ""}`} role="group" aria-label={S.grid}>
          <div className="sc-grid" style={{ "--days": dates.length } as React.CSSProperties}>
            <div className="sc-row sc-head">
              <div className="sc-staff">
                <span>{S.staff}</span>
                <span className="sc-badge">{rows.length}</span>
              </div>
              {showTotals && (
                <div className="sc-total">
                  <b>{S.total}</b>
                  <small>{view === "week" ? S.weekTotal : monthFmt.format(noon(date))}</small>
                </div>
              )}
              {dates.map((d) => {
                const works = rows.filter((s) => s.cells[d]?.kind === "work").length;
                const wd = isoWeekday(d);
                return (
                  <div key={d} className={`sc-day${d === today ? " is-today" : ""}${wd > 5 ? " is-weekend" : ""}`} data-date={d}>
                    <span className="sc-chip">
                      <b>{Number(d.slice(8))}</b>
                      <i>{wdFmt.format(noon(d))}</i>
                    </span>
                    {showCounts && (
                      <span className="sc-count" title={S.worksN(works)}>
                        {works || "–"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {rows.map((s) => {
              const sum = totalsOf(s.cells, dates);
              return (
                <div key={s.id} className="sc-row" data-staff={s.id}>
                  <div className="sc-staff">
                    <Ava src={s.photoUrl} name={s.name} className="sc-ava" />
                    <span className="sc-name">{s.name}</span>
                    <button
                      type="button"
                      className="sc-more"
                      aria-label={S.menu(s.name)}
                      aria-haspopup="menu"
                      aria-expanded={menu?.staffId === s.id}
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setMenu(menu?.staffId === s.id ? null : { staffId: s.id, x: Math.max(8, Math.min(r.left, window.innerWidth - 232)), y: Math.min(r.bottom + 4, window.innerHeight - 96) });
                      }}
                    >
                      <DotsIcon />
                    </button>
                  </div>
                  {showTotals && (
                    <div className="sc-total" data-shifts={sum.shifts} data-minutes={sum.minutes}>
                      <span>{S.shifts(sum.shifts)}</span>
                      <span>{S.hours(hoursFmt.format(sum.minutes / 60))}</span>
                    </div>
                  )}
                  {dates.map((d) => {
                    const c = s.cells[d];
                    if (!c) return <div key={d} className="sc-cell" />;
                    const on = marked.has(`${s.id}:${d}`);
                    const cls = `sc-cell k-${c.kind}${d === today ? " is-today" : ""}${on ? " is-on" : ""}`;
                    const inner =
                      c.kind === "work" ? (
                        <span className="sc-shift">
                          <span>{c.spans[0][0]}</span>
                          <span>{c.spans[c.spans.length - 1][1]}</span>
                          <span className="sc-foot">
                            <i className="sc-n">{c.visits || ""}</i>
                            {c.spans.length > 1 && <i className="sc-dot" />}
                          </span>
                        </span>
                      ) : c.kind === "off" ? null : (
                        <span className="sc-shift">
                          <span>{S.short[c.kind]}</span>
                        </span>
                      );
                    const label = S.cell(s.name, A.frame.day(noon(d)), cellText(c));
                    return may.edit ? (
                      <button key={d} type="button" className={cls} data-date={d} data-kind={c.kind} data-visits={c.visits} data-break={c.spans.length > 1 ? "" : undefined} aria-pressed={on} aria-label={label} title={label} onClick={() => toggle({ staffId: s.id, date: d })}>
                        {inner}
                      </button>
                    ) : (
                      <div key={d} className={cls} data-date={d} data-kind={c.kind} role="img" aria-label={label} title={label}>
                        {inner}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* a phone: what is marked, and the way into the sheet */}
      {panel && !sheetOpen && (
        <div className="sc-selbar only-narrow" role="status">
          <span>{S.picked(shown.length, new Set(shown.map((c) => c.staffId)).size)}</span>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={drop}>
            {A.cancel}
          </button>
          <button type="button" className="adm-btn adm-btn-lime adm-btn-sm" onClick={() => setSheetOpen(true)}>
            {S.change}
          </button>
        </div>
      )}
      {panel && (
        <div className={`sc-panel${sheetOpen ? " is-open" : ""}`}>
          <EditPanel
            key={round}
            data={data}
            picked={shown}
            onClose={drop}
            onSaved={(text) => {
              drop();
              frame.say(text);
            }}
          />
        </div>
      )}

      {menu && menuOf && (
        <div ref={menuBox} className="sc-menu" role="menu" aria-label={S.menu(menuOf.name)} style={{ left: menu.x, top: menu.y }}>
          {may.edit && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setCopyFor(menu.staffId);
                setMenu(null);
              }}
            >
              {S.copy}
            </button>
          )}
          <Link role="menuitem" href={`/admin/staff/${menu.staffId}`} prefetch={false}>
            {S.editStaff}
          </Link>
        </div>
      )}
      {copyFrom && <CopyDialog from={copyFrom} others={data.staff.filter((s: ScheduleStaff) => s.id !== copyFrom.id)} today={today} onClose={() => setCopyFor(null)} />}
    </div>
  );
}
