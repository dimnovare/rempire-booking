"use client";

/**
 * The client base's segments and conditions (the owner, 19.11.2026; the
 * design board «Клиенты, список»; docs/reference-looks.md, «Клиенты»).
 *
 *   «Сегменты:»  three links. One fills the conditions in for today
 *                (src/lib/admin/client-filter.ts, `segmentConds`) and the
 *                list is asked at once; picked again, it is taken off. A
 *                phone has only these.
 *   «Фильтры:»   from 900px: two dropdowns that add a condition, a bin that
 *                takes them all off, and the yellow «Найти». Each condition
 *                is a row with its own fields and a cross; with two or
 *                more, one switch says «И» or «Или» for the whole set.
 *
 * A condition here is what will be sent, every field as it is typed
 * (`CondInput`); the server reads it with the same unit that the list
 * checks it with before asking.
 */
import { CLIENT_CONDS, CONDS_MAX, SEGMENTS, VISIT_CONDS, type CondInput, type CondKind, type Join, type Segment } from "@/lib/admin/client-filter";
import { cap } from "../../copy.shared";
import { BinIcon, CaretIcon, TickIcon, XIcon } from "../../icons";
import { useA } from "../../lang";
import { Pop } from "../pop";

/** A condition being edited: every field is there, empty until it is filled; `key` is its own in the list of rows. */
export type Draft = { key: number; kind: CondKind; value: string; mode: string; from: string; to: string; min: string; max: string; ids: string[] };

/** What the fields of a kind start with: a choice that has no «nothing chosen». */
const START: Partial<Record<CondKind, Partial<CondInput>>> = {
  hasVisits: { value: "yes" },
  visitStatus: { value: "came" },
  gender: { value: "male" },
  importance: { value: "gold" },
  birthday: { mode: "month", value: String(new Date().getMonth() + 1) },
  massSent: { value: "yes" },
  noOnline: { value: "yes" },
};

let made = 0;
export const draftOf = (c: CondInput): Draft => ({ key: ++made, kind: c.kind as CondKind, value: c.value ?? "", mode: c.mode ?? "", from: c.from ?? "", to: c.to ?? "", min: c.min ?? "", max: c.max ?? "", ids: c.ids ?? [] });
export const newDraft = (kind: CondKind): Draft => draftOf({ kind, ...START[kind] });
/** The condition as it is sent. */
export const inputOf = (d: Draft): CondInput => ({ kind: d.kind, value: d.value, mode: d.mode, from: d.from, to: d.to, min: d.min, max: d.max, ids: d.ids });

/** What the conditions pick from: the barbers, the services, the categories in use. */
export type CondOptions = { staff: { id: string; name: string }[]; services: { id: string; name: string }[]; labels: string[] };

export function Segments({ value, onPick }: { value: Segment | null; onPick: (s: Segment | null) => void }) {
  const B = useA().clients.base;
  return (
    <div className="cb-segs" role="group" aria-label={B.segments}>
      <b>{B.segments}</b>
      {SEGMENTS.map((s) => (
        <button key={s} type="button" className="cb-seg" aria-pressed={value === s} title={B.segmentHint[s]} onClick={() => onPick(value === s ? null : s)}>
          {B.segment[s]}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({
  rows,
  join,
  bad,
  options,
  onRows,
  onJoin,
  onClear,
  onFind,
}: {
  rows: Draft[];
  join: Join;
  /** the rows that are not whole, by their keys: marked after «Найти» */
  bad: ReadonlySet<number>;
  options: CondOptions;
  onRows: (rows: Draft[]) => void;
  onJoin: (j: Join) => void;
  onClear: () => void;
  onFind: () => void;
}) {
  const B = useA().clients.base;
  const full = rows.length >= CONDS_MAX;
  const add = (kind: CondKind) => !full && onRows([...rows, newDraft(kind)]);
  const menu = (name: string, kinds: readonly CondKind[]) => (
    <Pop
      kind="menu"
      name={name}
      place="left"
      className="cb-drop"
      button={
        <>
          <span>{name}</span>
          <CaretIcon size={10} />
        </>
      }
    >
      {(close) =>
        kinds.map((k) => (
          <button
            key={k}
            type="button"
            role="menuitem"
            className="jr-item"
            disabled={full}
            onClick={() => {
              close();
              add(k);
            }}
          >
            <span>{B.kinds[k]}</span>
          </button>
        ))
      }
    </Pop>
  );

  return (
    <div className="cb-filterpart only-wide">
      <div className="cb-filters">
        <b>{B.filters}</b>
        {menu(B.byVisits, VISIT_CONDS)}
        {menu(B.byClients, CLIENT_CONDS)}
        <button type="button" className="jr-btn jr-ibtn" aria-label={B.clear} title={B.clear} onClick={onClear}>
          <BinIcon />
        </button>
        <span className="cb-space" />
        <button type="button" className="jr-btn jr-main cb-find" onClick={onFind}>
          {B.find}
        </button>
      </div>
      {rows.length > 0 && (
        <div className="cb-conds">
          {rows.length > 1 && (
            <div className="cb-join" role="group" aria-label={B.join}>
              {(["and", "or"] as const).map((j) => (
                <button key={j} type="button" className="jr-btn" aria-pressed={join === j} onClick={() => onJoin(j)}>
                  {B[j]}
                </button>
              ))}
            </div>
          )}
          <ul aria-label={B.conds}>
            {rows.map((r) => (
              <li key={r.key}>
                <div className={`cb-cond${bad.has(r.key) ? " is-bad" : ""}`} role="group" aria-label={B.kinds[r.kind]}>
                  <b>{B.kinds[r.kind]}</b>
                  <CondFields d={r} options={options} set={(patch) => onRows(rows.map((x) => (x.key === r.key ? { ...x, ...patch } : x)))} />
                  <button type="button" className="cb-x" aria-label={B.condRemove(B.kinds[r.kind])} title={B.condRemove(B.kinds[r.kind])} onClick={() => onRows(rows.filter((x) => x.key !== r.key))}>
                    <XIcon size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {bad.size > 0 && (
            <p className="adm-err" role="alert">
              {B.condBad}
            </p>
          )}
          {full && <p className="adm-meta">{B.condsFull(CONDS_MAX)}</p>}
        </div>
      )}
    </div>
  );
}

/** The fields of one condition, by its kind. */
function CondFields({ d, set, options }: { d: Draft; set: (patch: Partial<Draft>) => void; options: CondOptions }) {
  const A = useA();
  const B = A.clients.base;
  const K = A.clients.card;
  const name = B.kinds[d.kind];
  const pick = (label: string, value: string, choices: (readonly [string, string])[], onChange: (v: string) => void, empty = false) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {empty && <option value="">{B.pick}</option>}
      {choices.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
  const typed = (label: string, key: "min" | "max", money: boolean) => (
    <label className="cb-in">
      <span>{label}</span>
      <input type="text" inputMode={money ? "decimal" : "numeric"} autoComplete="off" maxLength={10} value={d[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  );
  const range = (money: boolean) => (
    <>
      {typed(B.from, "min", money)}
      {typed(B.to, "max", money)}
    </>
  );
  const dates = (
    <>
      <label className="cb-in">
        <span>{B.dateFrom}</span>
        <input type="date" value={d.from} onChange={(e) => set({ from: e.target.value })} />
      </label>
      <label className="cb-in">
        <span>{B.dateTo}</span>
        <input type="date" value={d.to} onChange={(e) => set({ to: e.target.value })} />
      </label>
    </>
  );
  const yesNo = pick(name, d.value, [["yes", B.yes] as const, ["no", B.no] as const], (value) => set({ value }));

  switch (d.kind) {
    case "hasVisits":
      return (
        <>
          {pick(name, d.value, [["yes", B.has.yes] as const, ["no", B.has.no] as const], (value) => set({ value }))}
          {dates}
        </>
      );
    case "visitStatus":
      return pick(name, d.value, [["came", B.status.came] as const, ["noShow", B.status.noShow] as const], (value) => set({ value }));
    case "visitCount":
    case "age":
      return range(false);
    case "serviceSum":
    case "sold":
      return range(true);
    case "period":
      return dates;
    case "barber":
      return pick(
        name,
        d.value,
        options.staff.map((s) => [s.id, s.name] as const),
        (value) => set({ value }),
        true,
      );
    case "services":
      return (
        <Pop
          kind="menu"
          name={name}
          place="left"
          className="cb-drop"
          button={
            <>
              <span>{d.ids.length ? B.servicesN(d.ids.length) : B.pickServices}</span>
              <CaretIcon size={10} />
            </>
          }
        >
          {() =>
            options.services.map((s) => {
              const on = d.ids.includes(s.id);
              return (
                <button key={s.id} type="button" role="menuitemcheckbox" aria-checked={on} className="jr-item" onClick={() => set({ ids: on ? d.ids.filter((x) => x !== s.id) : [...d.ids, s.id] })}>
                  <span className={`jr-box${on ? " is-on" : ""}`}>
                    <TickIcon size={10} />
                  </span>
                  <span>{s.name}</span>
                </button>
              );
            })
          }
        </Pop>
      );
    case "gender":
      return pick(name, d.value, [["male", K.genders.male] as const, ["female", K.genders.female] as const, ["none", K.genders.none] as const], (value) => set({ value }));
    case "category":
      return pick(
        name,
        d.value,
        // a category that is picked but no client carries any more still shows as picked
        (d.value && !options.labels.includes(d.value) ? [...options.labels, d.value] : options.labels).map((l) => [l, l] as const),
        (value) => set({ value }),
        true,
      );
    case "importance":
      return pick(name, d.value, [["gold", K.classes.gold] as const, ["silver", K.classes.silver] as const, ["bronze", K.classes.bronze] as const, ["none", K.classes.none] as const], (value) => set({ value }));
    case "birthday": {
      const month = new Intl.DateTimeFormat(A.intl, { month: "long", timeZone: "UTC" });
      return (
        <>
          {pick(name, d.mode, [["month", B.inMonth] as const, ["days", B.inDays] as const], (mode) => set({ mode, value: mode === "month" ? String(new Date().getMonth() + 1) : "7" }))}
          {d.mode === "month" ? (
            pick(
              B.month,
              d.value,
              Array.from({ length: 12 }, (_, i) => [String(i + 1), cap(month.format(Date.UTC(2024, i, 1)))] as const),
              (value) => set({ value }),
            )
          ) : (
            <input type="text" inputMode="numeric" autoComplete="off" maxLength={3} aria-label={B.days} value={d.value} onChange={(e) => set({ value: e.target.value })} />
          )}
        </>
      );
    }
    case "massSent":
    case "noOnline":
      return yesNo;
  }
}
