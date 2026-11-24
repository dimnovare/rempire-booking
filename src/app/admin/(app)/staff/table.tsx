"use client";

/**
 * «Барберы» from 900px as the staff list of the admin we follow (Dim,
 * round 15): one table, a row per barber in the list's own order (the
 * active ones first, then by their place), with four columns:
 *
 *   Сотрудник      his photo, his name (it opens him) and his role, with
 *                  today at a glance after it;
 *   Расписание     «до 31.12», his «График до» (migration 042): the last day
 *                  clients book him online. Nothing when he has none; red
 *                  once that day is behind;
 *   Онлайн-запись  the switch staff.bookable. It writes at once, as the
 *                  services table's switch does (useOptimistic: it moves
 *                  before the answer; the page that comes back says what was
 *                  saved). «Редактирование сотрудников», or it is greyed;
 *   Услуги         how many services he does.
 *
 * A phone keeps the list of rows (rail.tsx), which e2e opens at phone width.
 */
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { useA } from "../../lang";
import { Ava } from "../../icons";
import { setBookableAction } from "./actions";
import type { RailItem } from "./rail";
import "./staff.css";

/** «31.12» this year, «31.12.2027» another; null for none. */
export function untilShort(until: string | null, today: string): string | null {
  if (!until) return null;
  const [y, m, d] = until.split("-");
  return y === today.slice(0, 4) ? `${d}.${m}` : `${d}.${m}.${y}`;
}

export function StaffTable({ items, today, mayEdit }: { items: RailItem[]; today: string; mayEdit: boolean }) {
  const A = useA();
  const T = A.staffTable;
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [onNow, setOnNow] = useOptimistic<Record<string, boolean>, [string, boolean]>({}, (cur, [id, v]) => ({ ...cur, [id]: v }));
  const flip = (s: RailItem, v: boolean) => {
    setErr(null);
    startTransition(async () => {
      setOnNow([s.id, v]);
      const r = await setBookableAction(s.id, v).catch(() => ({ ok: false as const, field: "" }));
      if (!r.ok) setErr(r.field ? A.visit.invalid(r.field) : A.error);
    });
  };

  return (
    <div className="st-wrap only-wide">
      {/* «Найдено: 0» says it when there is nobody yet; the head of the table stays */}
      <p className="st-found">{T.found(items.length)}</p>
      {err && (
        <p className="adm-err" role="alert">
          {err}
        </p>
      )}
      <div className="st-card">
        <div role="table" aria-label={A.staff.title} className="st-table">
          <div role="row" className="st-cols">
            <span role="columnheader">{T.cols.name}</span>
            <span role="columnheader">{T.cols.schedule}</span>
            <span role="columnheader">{T.cols.online}</span>
            <span role="columnheader">{T.cols.services}</span>
          </div>
          {items.map((s) => {
            const until = untilShort(s.scheduleUntil, today);
            const ended = !!s.scheduleUntil && s.scheduleUntil < today;
            const on = onNow[s.id] ?? s.bookable;
            return (
              <div role="row" key={s.id} className={`st-row${s.active ? "" : " is-off"}`}>
                <span role="cell" className="st-c-name">
                  <Link className="st-who" href={`/admin/staff/${s.id}`}>
                    <Ava src={s.photoUrl} name={s.name} className="st-pic" />
                    <span className="txt">
                      <b>{s.name}</b>
                      <small>{[s.role, s.line].filter(Boolean).join(" · ")}</small>
                    </span>
                  </Link>
                </span>
                <span role="cell" className="st-c-until">
                  {until ? (
                    <span className={`st-until${ended ? " is-ended" : ""}`} title={ended ? T.untilEnded : undefined}>
                      {T.until(until)}
                    </span>
                  ) : (
                    <span className="st-until is-none" title={T.untilNoneHint}>
                      {T.untilNone}
                    </span>
                  )}
                </span>
                <span role="cell" className="st-c-online">
                  <label className="st-onl">
                    <input type="checkbox" role="switch" className="st-sw" checked={on} disabled={!mayEdit} aria-label={T.onlineOf(s.name)} onChange={(e) => flip(s, e.target.checked)} />
                    <span aria-hidden="true">{on ? T.on : T.off}</span>
                  </label>
                </span>
                <span role="cell" className="st-c-count">
                  {s.services}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
