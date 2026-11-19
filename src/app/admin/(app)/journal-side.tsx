"use client";

/**
 * The journal's panel on the right, from 900px (docs/reference-looks.md,
 * «The journal: built»): 321px on the page's ground with a 1px line on its
 * left, and one tab, «Клиенты»: a search by name or phone over the client
 * base. A found client shows how many visits he has and his last one, and
 * opens his card («Клиенты»).
 *
 * The search is the client base's own (clients/actions.ts →
 * src/lib/admin/clients.ts), asked for by an action: what is typed here
 * never gets into an address or the request log.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ClientRow } from "@/lib/admin/clients";
import { SearchIcon } from "../icons";
import { useA } from "../lang";
import { listClientsAction } from "./clients/actions";

/** After the last keystroke, before the list is asked for. */
const DELAY = 300;

export function JournalSide({ tz }: { tz: string }) {
  const A = useA();
  const C = A.cal;
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ rows: ClientRow[]; total: number } | null>(null);
  const [look, setLook] = useState<"idle" | "looking" | "failed">("idle");
  const seq = useRef(0);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) return;
    const n = ++seq.current;
    const t = window.setTimeout(async () => {
      setLook("looking");
      try {
        const r = await listClientsAction({ q: s, label: "", page: 1 });
        if (n !== seq.current) return;
        setFound({ rows: r.rows, total: r.total });
        setLook("idle");
      } catch {
        if (n === seq.current) setLook("failed");
      }
    }, DELAY);
    return () => window.clearTimeout(t);
  }, [q]);

  const day = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <aside className="jr-side only-wide" aria-label={C.panel}>
      <div className="jr-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true">
          {C.panelTab}
        </button>
      </div>
      <div className="jr-side-body" role="tabpanel" aria-label={C.panelTab}>
        <label className="jr-search">
          <SearchIcon size={14} />
          <input
            type="search"
            autoComplete="off"
            maxLength={60}
            placeholder={C.panelSearch}
            aria-label={C.panelSearch}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.trim().length < 2) {
                // the answer to what was typed before is no longer wanted
                seq.current++;
                setFound(null);
                setLook("idle");
              }
            }}
          />
        </label>
        {look === "failed" ? (
          <p className="jr-side-note is-bad" role="alert">
            {A.error}
          </p>
        ) : !found ? (
          <p className="jr-side-note" role="status">
            {look === "looking" ? A.loading : C.panelEmpty}
          </p>
        ) : found.rows.length === 0 ? (
          <p className="jr-side-note" role="status">
            {C.panelNothing}
          </p>
        ) : (
          <>
            <ul className={`jr-hits${look === "looking" ? " is-busy" : ""}`} aria-label={C.panelTab}>
              {found.rows.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/clients/${c.id}`} prefetch={false}>
                    <b>{c.name}</b>
                    {c.phone && <span>{c.phone}</span>}
                    <small>{c.visits ? [A.visit.visitsN(c.visits), c.lastVisit ? A.clients.lastOn(day.format(c.lastVisit)) : ""].filter(Boolean).join(" · ") : A.clients.noVisits}</small>
                  </Link>
                </li>
              ))}
            </ul>
            {found.total > found.rows.length && <p className="jr-side-note">{C.panelCapped(found.rows.length)}</p>}
          </>
        )}
      </div>
    </aside>
  );
}
