"use client";

/**
 * «Запросы»' list (design artifact 53PfD3DxCRkbDyjwLVvBHB, Dim 25.11.2026):
 * a card per request with the barber, the kind as a tag, what changes
 * («Было / Станет» with the change in bold, «45 € → 50 €»), his words and,
 * for a day off over visits, which visits stay in the journal. «Согласовать»
 * answers at once; «Отклонить» asks first in a small window under itself,
 * with the answer to the barber.
 * Above the list: the barber and the kind, to narrow it.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RequestRow } from "@/lib/barber/requests";
import {
  euro,
  requestParts,
  requestWords,
  weekGroups,
  type RequestWhat,
  type WeekHours,
} from "@/lib/barber/request-words";
import { localParts } from "@/lib/tz";
import { PlusIcon, TickIcon, WarnIcon } from "../../icons";
import { useA } from "../../lang";
import { useFrame } from "../frame";
import { answer } from "./actions";

/** What an open request shows besides its own row: the weekly hours it replaces, the visits a day off leaves. */
export type OpenExtra = { was?: WeekHours; visits?: number[] };

/** The kind chips: what a barber asks for, in the words a salon uses. */
const KINDS = ["off", "break", "special", "hours", "price"] as const;
type KindKey = (typeof KINDS)[number];
const kindOf = (w: RequestWhat): KindKey =>
  w.kind === "time_off"
    ? w.offKind === "block"
      ? "break"
      : "off"
    : w.kind === "special"
      ? "special"
      : w.kind === "hours"
        ? "hours"
        : "price";

function useWhen(tz: string) {
  const A = useA();
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(A.intl, {
      timeZone: tz,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    return (ms: number) => f.format(new Date(ms));
  }, [A.intl, tz]);
}

export function RequestsView({
  tab,
  rows,
  extra,
  tz,
}: {
  tab: "open" | "history";
  rows: RequestRow[];
  extra: Record<string, OpenExtra>;
  tz: string;
}) {
  const A = useA();
  const R = A.req;
  const [staff, setStaff] = useState("");
  const [kind, setKind] = useState<KindKey | "">("");
  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.staffId, r.staffName);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const shown = rows.filter(
    (r) =>
      (!staff || r.staffId === staff) && (!kind || kindOf(r.what) === kind),
  );

  return (
    <div className="rq">
      {rows.length > 1 && (
        <div className="rq-tools">
          <select
            aria-label={R.barber}
            value={staff}
            onChange={(e) => setStaff(e.target.value)}
          >
            <option value="">{R.allStaff}</option>
            {people.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <div className="rq-chips" role="group" aria-label={R.what}>
            <button
              type="button"
              className="rq-chip"
              aria-pressed={kind === ""}
              onClick={() => setKind("")}
            >
              {R.kinds.all}
            </button>
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className="rq-chip"
                aria-pressed={kind === k}
                onClick={() => setKind(kind === k ? "" : k)}
              >
                {R.kinds[k]}
              </button>
            ))}
          </div>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="rq-none">
          {rows.length ? R.noneHere : tab === "open" ? R.none : R.noneRecent}
        </p>
      ) : (
        <ul className="rq-list adm-req">
          {shown.map((r) => (
            <Card
              key={r.id}
              r={r}
              extra={extra[r.id]}
              tz={tz}
              open={tab === "open"}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Card({
  r,
  extra,
  tz,
  open,
}: {
  r: RequestRow;
  extra?: OpenExtra;
  tz: string;
  open: boolean;
}) {
  const A = useA();
  const R = A.req;
  const frame = useFrame();
  const when = useWhen(tz);
  const parts = requestParts(r.what, tz, A.lang);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const noBtn = useRef<HTMLButtonElement>(null);
  // «Согласовано: Slava, отпуск · 1.12–14.12»: the toast names what was answered
  const what = () => {
    const line = requestWords(r.what, tz, A.lang);
    return r.what.kind === "price"
      ? line
      : line.charAt(0).toLocaleLowerCase(A.lang) + line.slice(1);
  };
  const failed = (code: string) =>
    code === "done" || code === "gone"
      ? R.gone
      : code === "forbidden"
        ? A.rights.refused
        : A.error;
  const approve = async () => {
    setBusy(true);
    try {
      const res = await answer(r.id, "approved", note);
      if (res.ok) frame.say(R.approvedWhat(r.staffName, what()));
      else frame.say(failed(res.code), true);
    } catch {
      frame.say(A.error, true);
    } finally {
      setBusy(false);
    }
  };
  const decline = async (): Promise<string | null> => {
    try {
      const res = await answer(r.id, "declined", note);
      if (!res.ok) return failed(res.code);
      frame.say(R.declinedWhat(r.staffName, what()));
      return null;
    } catch {
      return A.error;
    }
  };
  const tag =
    r.status === "declined"
      ? " is-red"
      : r.status === "approved" || r.status === "applied"
        ? " is-ok"
        : "";

  return (
    <li className="rq-card">
      <div className="rq-who">
        <span className="ac-av" aria-hidden="true">
          {r.staffName.slice(0, 1).toUpperCase()}
        </span>
        <b>{r.staffName}</b>
      </div>
      <div className="rq-body">
        <div className="rq-meta">
          <span className="rq-kind">{parts.tag}</span>
          <small>{when(r.createdAt)}</small>
        </div>
        <Change
          what={r.what}
          line={parts.line}
          days={parts.days}
          was={extra?.was}
        />
        {r.note && <p className="rq-his">{R.his(r.note)}</p>}
        {open && r.visitsInside > 0 && (
          <Inside r={r} visits={extra?.visits ?? []} tz={tz} />
        )}
        {open && noteOpen && (
          <label className="adm-field rq-note">
            <span>{R.note}</span>
            <textarea
              value={note}
              maxLength={300}
              rows={2}
              placeholder={R.notePh}
              onChange={(e) => setNote(e.target.value)}
            />
            <small className="ac-hint">{R.noteHint(r.staffName)}</small>
          </label>
        )}
        {!open && r.answerNote && (
          <p className="rq-his">{R.answered(r.answerNote)}</p>
        )}
      </div>
      {open ? (
        <div className="rq-acts">
          <button
            type="button"
            className="adm-btn adm-btn-lime rq-yes"
            disabled={busy}
            onClick={() => void approve()}
          >
            <TickIcon size={16} />
            {R.approve}
          </button>
          <div className="rq-no">
            <button
              ref={noBtn}
              type="button"
              className="adm-btn adm-btn-line"
              disabled={busy}
              aria-expanded={asking}
              onClick={() => setAsking(!asking)}
            >
              {R.decline}
            </button>
            {asking && (
              <DeclinePop
                name={r.staffName}
                note={note}
                setNote={setNote}
                onYes={decline}
                onClose={() => {
                  setAsking(false);
                  noBtn.current?.focus();
                }}
              />
            )}
          </div>
          {!noteOpen && (
            <button
              type="button"
              className="rq-link"
              onClick={() => setNoteOpen(true)}
            >
              <PlusIcon size={14} />
              {R.note}
            </button>
          )}
        </div>
      ) : (
        <div className="rq-status">
          <span className={`rq-state${tag}`}>{R.status[r.status]}</span>
          <small>{when(r.decidedAt ?? r.createdAt)}</small>
        </div>
      )}
    </li>
  );
}

/** What changes: «1.12–14.12 · 14 дней», «Было / Станет» for the week, «Стрижка: 45 € → 50 €». */
function Change({
  what,
  line,
  days,
  was,
}: {
  what: RequestWhat;
  line: string;
  days?: number;
  was?: WeekHours;
}) {
  const A = useA();
  const R = A.req;
  if (what.kind === "hours") {
    const now = weekGroups(what.days, A.lang, was);
    // «История» keeps only the asked week: no «Было», so no «Станет» either
    if (!was)
      return (
        <p className="rq-line">
          {now.map((g) => `${g.days} ${g.hours}`).join(" · ")}
        </p>
      );
    return (
      <dl className="rq-diff">
        <dt>{R.was}</dt>
        <dd>
          {weekGroups(was, A.lang)
            .map((g) => `${g.days} ${g.hours}`)
            .join(" · ")}
        </dd>
        <dt>{R.will}</dt>
        <dd>
          {now.map((g, i) => (
            <span key={g.days}>
              {i > 0 && " · "}
              {g.changed ? (
                <b>{`${g.days} ${g.hours}`}</b>
              ) : (
                `${g.days} ${g.hours}`
              )}
            </span>
          ))}
        </dd>
      </dl>
    );
  }
  if (what.kind === "price") {
    const money = what.fromCents !== what.toCents;
    const time = what.fromMin !== what.toMin;
    return (
      <p className="rq-line">
        {line}:{" "}
        {money ? (
          <b className="rq-nb">{`${euro(what.fromCents)} → ${euro(what.toCents)}`}</b>
        ) : (
          <span className="rq-nb">{euro(what.toCents)}</span>
        )}
        {" · "}
        {time ? (
          <b className="rq-nb">{R.minutes(what.fromMin, what.toMin)}</b>
        ) : (
          R.sameTime(what.toMin)
        )}
      </p>
    );
  }
  return (
    <p className="rq-line">
      {line}
      {days ? ` · ${R.days(days)}` : ""}
    </p>
  );
}

/** A day off over visits: they stay in the journal, someone moves or cancels them. */
function Inside({
  r,
  visits,
  tz,
}: {
  r: RequestRow;
  visits: number[];
  tz: string;
}) {
  const A = useA();
  const R = A.req;
  const day = new Intl.DateTimeFormat(A.intl, {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  // «чт, 26 нояб. 10:00, 11:15; пт, 27 нояб. 12:00»: a day once, then its times
  const days: { day: string; times: string[] }[] = [];
  for (const v of visits) {
    const d = day.format(new Date(v));
    const t = localParts(v, tz).time;
    const last = days[days.length - 1];
    if (last?.day === d) last.times.push(t);
    else days.push({ day: d, times: [t] });
  }
  const first =
    visits[0] ?? (r.what.kind === "time_off" ? r.what.from : r.createdAt);
  return (
    <p className="rq-warn" role="note">
      <WarnIcon />
      <span>
        {R.insideList(
          r.visitsInside,
          days.map((d) => `${d.day} ${d.times.join(", ")}`).join("; "),
          r.visitsInside > visits.length,
        )}{" "}
        <Link
          href={`/admin?d=${localParts(first, tz).date}&s=${r.staffId}`}
          prefetch={false}
        >
          {R.inJournal}
        </Link>
      </span>
    </p>
  );
}

/**
 * «Отклонить запрос: Valentin?» under the button (design artifact, 25.11):
 * the answer to the barber, «Отмена» and a red «Отклонить». Esc or a tap
 * outside closes it; the field takes the focus.
 */
function DeclinePop({
  name,
  note,
  setNote,
  onYes,
  onClose,
}: {
  name: string;
  note: string;
  setNote: (s: string) => void;
  onYes: () => Promise<string | null>;
  onClose: () => void;
}) {
  const A = useA();
  const R = A.req;
  const box = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    box.current?.querySelector("textarea")?.focus();
    const away = (e: PointerEvent) => {
      const at = e.target as Node;
      if (
        box.current &&
        !box.current.contains(at) &&
        !box.current.parentElement?.contains(at)
      )
        onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [onClose]);
  const go = async () => {
    setBusy(true);
    setError(null);
    const bad = await onYes();
    setBusy(false);
    if (bad) setError(bad);
  };
  return (
    <div
      ref={box}
      className="rq-pop"
      role="alertdialog"
      aria-label={R.declineAsk(name)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <p className="rq-pop-title">{R.declineAsk(name)}</p>
      <label className="adm-field rq-note">
        <span>{R.note}</span>
        <textarea
          value={note}
          maxLength={300}
          rows={3}
          placeholder={R.notePh}
          onChange={(e) => setNote(e.target.value)}
        />
        <small className="ac-hint">{R.noteHint(name)}</small>
      </label>
      {error && (
        <p className="adm-err" role="alert">
          {error}
        </p>
      )}
      <div className="rq-pop-acts">
        <button
          type="button"
          className="adm-btn adm-btn-line adm-btn-sm"
          onClick={onClose}
        >
          {A.cancel}
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-warnfill adm-btn-sm"
          disabled={busy}
          onClick={() => void go()}
        >
          {R.decline}
        </button>
      </div>
    </div>
  );
}
