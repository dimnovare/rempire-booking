"use client";

/**
 * The journal's controls bar from 900px, as the bar of the product we follow
 * (docs/reference-looks.md, «The journal: built»; laid out on the design
 * board): white, 48px, every control 32px high with 8px corners and a 1px
 * line. Left to right: «Сегодня», ‹ ›, the day as the title; then «Продать»,
 * the day's numbers, «День | Неделя», the status filter, the scale and the
 * panel on the right. A new visit is a click on the grid (the bar «Новый
 * сеанс» under the mouse): the bar has no «Запись» of its own (Dim,
 * 20.11.2026); a phone keeps its button.
 *
 * A login linked to a barber also has «Мой день | Весь салон» before
 * «Продать» (docs/apps.md, «One app for Renat»): a pair, yellow on the
 * chosen half.
 *
 * A phone keeps its own bar (calendar.tsx). The filter, the scale, the
 * panel and «Мой день | Весь салон» are the tab's choices (tab-state.ts);
 * the calendar keeps them and hands them down.
 */
import type { CalStaff } from "@/lib/admin/calendar";
import { VISIT_STATES, type DayNumbers, type VisitState } from "@/lib/admin/journal";
import { amountText } from "@/lib/money";
import { addDays } from "@/lib/tz";
import { Ava, CaretIcon, FunnelIcon, NextIcon, PanelIcon, PrevIcon, TickIcon, ZoomIcon } from "../icons";
import { useA } from "../lang";
import { useFrame } from "./frame";
import { Pop } from "./pop";

/** Pixels a minute: 15, 10 and 5 minutes to a 15px line, as the scale we follow. */
export const ZOOMS = ["1", "1.5", "3"] as const;
export type Zoom = (typeof ZOOMS)[number];
export const isZoom = (v: unknown): v is Zoom => (ZOOMS as readonly unknown[]).includes(v);
/** The minutes a 15px line is at each scale: a click, a drag and the bar «Новый сеанс» snap to it. */
export const ZOOM_STEP: Record<Zoom, number> = { "1": 15, "1.5": 10, "3": 5 };

/** «€ 414», «€ 49,80»: the sign first, as on the bar we follow. */
export const euro = (cents: number) => `€ ${cents % 100 === 0 ? cents / 100 : amountText(cents)}`;

export type JournalBarProps = {
  view: "day" | "week";
  date: string;
  today: string;
  title: string;
  /** «19 ноября», the head of the day's numbers */
  dayText: string;
  staff: CalStaff[];
  staffId: string | null;
  /** the day's numbers; none in a week */
  numbers: (DayNumbers & { goodsCents: number }) | null;
  hidden: readonly VisitState[];
  onHidden: (next: VisitState[]) => void;
  zoom: Zoom;
  onZoom: (z: Zoom) => void;
  side: boolean;
  onSide: () => void;
  /** «Продать» is offered: the login may sell products */
  sell: boolean;
  /**
   * «Мой день | Весь салон», for a login linked to a barber whose column it
   * sees (docs/apps.md, «One app for Renat»); null for everyone else, who
   * never see the control. While «Мой день» is on, the bar is his own: the
   * week is his week, and the salon's numbers and the panel's button give
   * way to the panel «Моё».
   */
  mine: { on: boolean; staffId: string; pick: (on: boolean) => void } | null;
  go: (date: string, view?: "day" | "week", staffId?: string | null) => void;
};

export function JournalBar({ view, date, today, title, dayText, staff, staffId, numbers, hidden, onHidden, zoom, onZoom, side, onSide, sell, mine, go }: JournalBarProps) {
  const A = useA();
  const C = A.cal;
  const frame = useFrame();
  const step = view === "week" ? 7 : 1;
  const who = view === "week" ? staff.find((s) => s.id === staffId) : undefined;

  return (
    <div className="jr-bar only-wide">
      <button type="button" className="jr-btn" onClick={() => go(today)}>
        {C.today}
      </button>
      <button type="button" className="jr-btn jr-ibtn" aria-label={C.prev} onClick={() => go(addDays(date, -step))}>
        <PrevIcon size={14} />
      </button>
      <button type="button" className="jr-btn jr-ibtn" aria-label={C.next} onClick={() => go(addDays(date, step))}>
        <NextIcon size={14} />
      </button>
      <h1 className="jr-title">
        <label>
          <span>{title}</span>
          <input
            type="date"
            value={date}
            aria-label={C.pickDate}
            onChange={(e) => e.target.value && go(e.target.value)}
            onClick={(e) => {
              // a desktop browser opens its calendar only from the field's own icon, which is not drawn here
              try {
                e.currentTarget.showPicker?.();
              } catch {
                /* the field still takes a typed date */
              }
            }}
          />
        </label>
      </h1>
      <div className="jr-space" />

      {mine && (
        <div className="jr-seg jr-mine" role="group" aria-label={A.app.scope}>
          <button type="button" className="jr-btn" aria-pressed={mine.on} onClick={() => !mine.on && mine.pick(true)}>
            {A.app.mine}
          </button>
          <button type="button" className="jr-btn" aria-pressed={!mine.on} onClick={() => mine.on && mine.pick(false)}>
            {A.app.salon}
          </button>
        </div>
      )}

      {sell && (
        <button type="button" className="jr-btn" onClick={() => frame.open("sale")}>
          {C.sell}
        </button>
      )}

      {numbers && !mine?.on && (
        <Pop
          kind="dialog"
          name={C.numbers}
          label={`${C.numbers}: ${euro(numbers.doneCents)}`}
          button={
            <>
              <span className="num">{euro(numbers.doneCents)}</span>
              <CaretIcon size={10} />
            </>
          }
        >
          {() => (
            <div className="jr-nums">
              <p>
                <b>{dayText}</b>
                <span>{C.clientsN(numbers.clients)}</span>
              </p>
              <dl>
                <div>
                  <dt>{C.bookedSum}</dt>
                  <dd className="num">{euro(numbers.bookedCents)}</dd>
                </div>
                <div>
                  <dt>{C.doneSum}</dt>
                  <dd className="num">{euro(numbers.doneCents)}</dd>
                </div>
                <div>
                  <dt>{C.goodsSum}</dt>
                  <dd className="num">{euro(numbers.goodsCents)}</dd>
                </div>
              </dl>
            </div>
          )}
        </Pop>
      )}

      <div className="jr-seg" role="group" aria-label={C.view}>
        <button type="button" className="jr-btn" aria-pressed={view === "day"} onClick={() => view !== "day" && go(date, "day")}>
          {C.day}
        </button>
        {mine?.on ? (
          // «Мой день»: the week is his own, nobody to pick
          <button type="button" className="jr-btn" aria-pressed={view === "week"} onClick={() => view !== "week" && go(date, "week", mine.staffId)}>
            {C.week}
          </button>
        ) : (
          <Pop
            kind="menu"
            name={C.weekOf}
            pressed={view === "week"}
            button={
              <>
                <span>{who ? `${C.week} · ${who.name}` : C.week}</span>
                <CaretIcon size={10} />
              </>
            }
          >
            {(close) =>
              staff.map((s) => {
                const on = view === "week" && s.id === staffId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    className="jr-item"
                    onClick={() => {
                      close();
                      if (!on) go(date, "week", s.id);
                    }}
                  >
                    <Ava src={s.photoUrl} name={s.name} className="jr-ava" />
                    <span>{s.name}</span>
                    {on && <TickIcon size={12} />}
                  </button>
                );
              })
            }
          </Pop>
        )}
      </div>

      <Pop kind="menu" name={C.filter} label={C.filter} icon marked={hidden.length > 0} button={<FunnelIcon />}>
        {() =>
          VISIT_STATES.map((k) => {
            const on = !hidden.includes(k);
            return (
              <button key={k} type="button" role="menuitemcheckbox" aria-checked={on} className="jr-item" onClick={() => onHidden(on ? [...hidden, k] : hidden.filter((x) => x !== k))}>
                <span className={`jr-box${on ? " is-on" : ""}`}>
                  <TickIcon size={10} />
                </span>
                <i className={`jr-dot k-${k}`} />
                <span>{C.states[k]}</span>
              </button>
            );
          })
        }
      </Pop>

      <Pop kind="menu" name={C.scale} label={C.scale} icon button={<ZoomIcon />}>
        {() => (
          <div className="jr-zoom" role="group" aria-label={C.scale}>
            {[...ZOOMS].reverse().map((z) => (
              <button key={z} type="button" role="menuitemradio" aria-checked={zoom === z} onClick={() => onZoom(z)}>
                {C.scales[z]}
              </button>
            ))}
          </div>
        )}
      </Pop>

      {/* «Мой день» has its own panel, «Моё» */}
      {!mine?.on && (
        <button type="button" className="jr-btn jr-ibtn" aria-label={C.panel} aria-pressed={side} onClick={onSide}>
          <PanelIcon />
        </button>
      )}
    </div>
  );
}
