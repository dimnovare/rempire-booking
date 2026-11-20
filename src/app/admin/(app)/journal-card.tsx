"use client";

/**
 * A visit's card on hover, from 900px (board Journal-Hover): the client and
 * his phone with a copy button, the time and the barber, his numbers
 * (Визитов, Не пришёл, Потратил), the four status chips, the services with
 * their prices and lengths, «Итого», and «Открыть запись», the visit's
 * window. The grid opens and places it (journal-grid.tsx).
 *
 * Rights: the phone is as the journal already shows it to this login (cut on
 * the server, calendarFor), and copied only when it is whole and the login
 * may call; the numbers are the visit window's own (visitWindowAction: the
 * client's data, the client shown to the login, his history), and none
 * without those rights; a chip writes at once with «Редактирование записи»
 * (and «…пришедшего клиента» once he came), as the window's do. «Готово» is
 * no chip: it is going away everywhere.
 */
import { useEffect, useState } from "react";
import type { CalVisit } from "@/lib/admin/calendar";
import { eur } from "../copy";
import { useA } from "../lang";
import { visitWindowAction, setVisitStatus } from "./actions";
import { CAME, timeOf, useMay } from "./visit-parts";

/** The four chips and what each writes: a status and the «Подтвердил» flag (021_visit_confirmed.sql). */
const CHIPS = ["booked", "arrived", "no_show", "confirmed"] as const;
type Chip = (typeof CHIPS)[number];
const WRITES: Record<Chip, [string, boolean]> = { booked: ["booked", false], arrived: ["arrived", false], no_show: ["no_show", false], confirmed: ["booked", true] };
const chipOf = (status: string, confirmed: boolean): Chip => (CAME.has(status) ? "arrived" : status === "no_show" ? "no_show" : confirmed ? "confirmed" : "booked");

export type CardNumbers = { visits: number; noShows: number; soldCents: number };
/** What was read for a visit: its numbers, or null when the login has no right to them. */
export type CardCache = Map<string, CardNumbers | null>;

const icon = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true } as const;

function ChipIcon({ chip }: { chip: Chip }) {
  if (chip === "booked")
    return (
      <svg {...icon} width={14} height={14} className="jr-chip-i is-wait">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v4.8l3 1.8" />
      </svg>
    );
  if (chip === "arrived")
    return (
      <svg {...icon} width={14} height={14} className="jr-chip-i is-came">
        <path d="M12 6v12M6 12h12" />
      </svg>
    );
  if (chip === "no_show")
    return (
      <svg {...icon} width={14} height={14} className="jr-chip-i is-no">
        <path d="M6 12h12" />
      </svg>
    );
  return (
    <svg {...icon} width={14} height={14} className="jr-chip-i is-ok">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function VisitCard({
  v,
  tz,
  staffName,
  cache,
  onOpen,
  onSay,
}: {
  v: CalVisit;
  tz: string;
  staffName: string;
  cache: CardCache;
  /** «Открыть запись»: the visit's window */
  onOpen: () => void;
  /** a line for the journal's toast */
  onSay: (text: string, bad?: boolean) => void;
}) {
  const A = useA();
  const C = A.cal;
  const may = useMay();
  const [numbers, setNumbers] = useState<CardNumbers | null | undefined>(cache.has(v.id) ? cache.get(v.id) : undefined);
  const [st, setSt] = useState({ status: v.status, confirmed: v.confirmed });
  const [busy, setBusy] = useState(false);

  // the server's answer wins once it comes (the journal refreshes after a write)
  useEffect(() => setSt({ status: v.status, confirmed: v.confirmed }), [v.status, v.confirmed]);

  useEffect(() => {
    if (cache.has(v.id)) return;
    let live = true;
    visitWindowAction(v.id).then(
      (x) => {
        const s = x?.client?.stats;
        const n = s ? { visits: s.visits, noShows: s.noShows, soldCents: s.soldCents } : null;
        cache.set(v.id, n);
        if (live) setNumbers(n);
      },
      () => live && setNumbers(null),
    );
    return () => {
      live = false;
    };
  }, [v.id, cache]);

  const came = CAME.has(st.status);
  const canEdit = may.edit && (!came || may.editCame);
  const current = chipOf(st.status, st.confirmed);
  const pick = async (c: Chip) => {
    if (c === current || busy) return;
    const [status, confirmed] = WRITES[c];
    setBusy(true);
    try {
      if (await setVisitStatus(v.id, status, confirmed)) {
        setSt({ status, confirmed });
        // a new state changes his numbers (a no-show counts)
        cache.delete(v.id);
        onSay(C.cardChips[c]);
      } else onSay(A.error, true);
    } catch {
      onSay(A.error, true);
    } finally {
      setBusy(false);
    }
  };

  const phone = v.clientPhone;
  // a phone cut by the login's rights («•••») is shown as it is and not copied
  const whole = !!phone && may.call && !phone.includes("•");
  const copy = async () => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      onSay(C.copied);
    } catch {
      onSay(A.error, true);
    }
  };

  return (
    <section className="jr-card" aria-label={v.clientName}>
      <header className="jr-card-head">
        <div className="jr-card-who">
          <h3>{v.clientName}</h3>
          {phone && (
            <p className="jr-card-phone">
              <span>{phone}</span>
              {whole && (
                <button type="button" className="jr-card-copy" aria-label={C.copyPhone} title={C.copyPhone} onClick={() => void copy()}>
                  <svg {...icon} width={14} height={14} strokeWidth={1.8}>
                    <rect x="8" y="8" width="11" height="11" rx="2" />
                    <path d="M5 15V6a1 1 0 011-1h9" />
                  </svg>
                </button>
              )}
            </p>
          )}
        </div>
        <div className="jr-card-when">
          <b>
            {timeOf(tz, v.start)}–{timeOf(tz, v.end)}
          </b>
          <small>
            {staffName} · {C.cardBy[v.source === "online" ? "online" : "staff"]}
          </small>
        </div>
      </header>

      {numbers !== null && (
        <dl className={`jr-card-nums${numbers === undefined ? " is-wait" : ""}`}>
          <div>
            <dt>{C.cardVisits}</dt>
            <dd>{numbers ? numbers.visits : "…"}</dd>
          </div>
          <div>
            <dt>{C.cardNoShows}</dt>
            <dd className={numbers?.noShows ? "is-bad" : undefined}>{numbers ? numbers.noShows : "…"}</dd>
          </div>
          <div>
            <dt>{C.cardSpent}</dt>
            <dd>{numbers ? eur(numbers.soldCents) : "…"}</dd>
          </div>
        </dl>
      )}

      <div className="jr-card-chips" role="group" aria-label={C.cardStatus}>
        {CHIPS.map((c) => (
          <button key={c} type="button" className="jr-chip" aria-pressed={current === c} disabled={!canEdit || busy} onClick={() => void pick(c)}>
            <ChipIcon chip={c} />
            <span>{C.cardChips[c]}</span>
          </button>
        ))}
      </div>

      <div className="jr-card-svc">
        <h4>{C.cardServices}</h4>
        <ul>
          {v.services.map((s, i) => (
            <li key={`${s.serviceId}:${i}`}>
              <span>
                <b>{A.pick(s.name)}</b>
                <small>{A.mins(s.durationMin)}</small>
              </span>
              <span className="num">{eur(s.priceCents)}</span>
            </li>
          ))}
          {v.extraCents > 0 && (
            <li>
              <span>
                <b>{A.visit.special}</b>
              </span>
              <span className="num">{eur(v.extraCents)}</span>
            </li>
          )}
        </ul>
        <p className="jr-card-total">
          <span>{A.visit.total}</span>
          <b className="num">{eur(v.totalCents)}</b>
        </p>
      </div>

      <button type="button" className="jr-card-open" onClick={onOpen}>
        {C.cardOpen}
      </button>
    </section>
  );
}
