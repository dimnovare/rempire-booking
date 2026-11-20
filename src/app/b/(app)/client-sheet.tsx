"use client";

/**
 * The client's card (B6), opened from one of his visits: a tap to call, the
 * one shared note (every barber and Renat see it), his visits with this
 * client ahead and before, and «Записать снова». Only a client who has a
 * visit in his column: the server says so (src/lib/barber/clients.ts).
 */
import { useEffect, useState } from "react";
import type { CardVisit, ClientCard } from "@/lib/barber/clients";
import { localParts } from "@/lib/tz";
import { cap, dateWords, eur, hm, pick3 } from "../copy.shared";
import { useB } from "../lang";
import { useMay } from "./may";
import { BSheet } from "./sheet";
import { loadClientCard, saveClientNote } from "./visit-actions";

const NOTE_MAX = 1000;

/**
 * A note shown as text with «Изменить», or a box to write it. `onSave`
 * answers whether the server took it; the parent shows the saved text.
 */
export function NoteEditor({ label, hint, value, onSave, canEdit = true }: { label: string; hint?: string; value: string; onSave: (text: string) => Promise<boolean>; canEdit?: boolean }) {
  const B = useB();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (await onSave(draft)) setEditing(false);
      else setProblem(B.client.gone);
    } catch {
      setProblem(B.error);
    } finally {
      setBusy(false);
    }
  };
  // with no right to change it: the note alone, and nothing at all when there is none
  if (!canEdit)
    return value ? (
      <div className="bx-noteblk">
        <small>{label}</small>
        <p className="adm-note">{value}</p>
      </div>
    ) : null;
  if (!editing)
    return (
      <div className="bx-noteblk">
        <small>{label}</small>
        {value && <p className="adm-note">{value}</p>}
        <button
          type="button"
          className="adm-txt lime bx-note-edit"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          {value ? B.client.edit : B.client.addNote}
        </button>
      </div>
    );
  return (
    <div className="bx-noteblk">
      <small>{label}</small>
      <textarea rows={3} maxLength={NOTE_MAX} value={draft} autoFocus aria-label={label} onChange={(e) => setDraft(e.target.value)} />
      {hint && <small className="adm-meta">{hint}</small>}
      {problem && (
        <p className="adm-err" role="alert">
          {problem}
        </p>
      )}
      <div className="adm-btns">
        <button type="button" className="adm-btn adm-btn-sm adm-btn-lime adm-btn-auto" disabled={busy} onClick={() => void save()}>
          {B.save}
        </button>
        <button type="button" className="adm-btn adm-btn-sm adm-btn-ghost adm-btn-auto" disabled={busy} onClick={() => setEditing(false)}>
          {B.cancel}
        </button>
      </div>
    </div>
  );
}

function VisitLine({ v, tz, showTime }: { v: CardVisit; tz: string; showTime: boolean }) {
  const B = useB();
  const p = localParts(v.start, tz);
  const names = v.services.map((s) => pick3(s.name, B.lang)).join(" + ");
  const bad = v.status === "no_show";
  return (
    <li className="bx-cv">
      <span className="txt">
        <b>
          {cap(dateWords(p.date, B.lang, { weekday: "short", day: "numeric", month: "short", year: p.date.slice(0, 4) === localParts(Date.now(), tz).date.slice(0, 4) ? undefined : "numeric" }))}
          {showTime && `, ${hm(v.start, tz)}`}
        </b>
        <small>{names}</small>
      </span>
      <span className="end">
        <span>{eur(v.totalCents)}</span>
        {/* «done», from before «Готово» left the app, reads «Пришёл» as «arrived» does (B.visit.status) */}
        {v.status !== "booked" && <span className={`adm-tag${bad ? " warn" : ""}`}>{B.visit.status[v.status] ?? v.status}</span>}
      </span>
    </li>
  );
}

export function ClientSheet({
  clientId,
  name,
  tz,
  canBook,
  onClose,
  onBack,
  onAgain,
  onSaved,
}: {
  clientId: string;
  name: string;
  tz: string;
  canBook: boolean;
  onClose: () => void;
  onBack: () => void;
  onAgain: () => void;
  onSaved: (text: string) => void;
}) {
  const B = useB();
  const C = B.client;
  const may = useMay();
  const [card, setCard] = useState<ClientCard | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadClientCard(clientId).then(
      (c) => live && setCard(c),
      () => live && setCard(null),
    );
    return () => {
      live = false;
    };
  }, [clientId]);

  return (
    <BSheet
      title={name}
      onClose={onClose}
      bar={
        <div className="adm-bar-row">
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-auto" onClick={onBack}>
            {C.back}
          </button>
          {canBook && card && (
            <button type="button" className="adm-btn adm-btn-lime adm-btn-auto" onClick={onAgain}>
              {B.book.again}
            </button>
          )}
        </div>
      }
    >
      {card === undefined ? (
        <p className="adm-meta">{B.loading}</p>
      ) : card === null ? (
        <p className="adm-meta">{C.gone}</p>
      ) : (
        <>
          {card.phone ? (
            card.callable ? (
              <a className="adm-phone" href={`tel:${card.phone}`}>
                {card.phone} · {B.visit.call}
              </a>
            ) : (
              <span className="adm-phone">{card.phone}</span>
            )
          ) : (
            <p className="adm-meta">{B.visit.noPhone}</p>
          )}
          <p className="adm-meta">
            {C.withYou(card.count)}
            {card.noShows > 0 && ` · ${C.noShows(card.noShows)}`}
          </p>
          <NoteEditor
            label={B.visit.clientNote}
            hint={B.visit.clientNoteHint}
            value={card.note}
            canEdit={may.clientNote}
            onSave={async (text) => {
              const ok = await saveClientNote(card.id, text);
              if (ok) {
                setCard({ ...card, note: text.trim() });
                onSaved(C.noteSaved);
              }
              return ok;
            }}
          />
          {card.ahead.length > 0 && (
            <div className="bx-noteblk">
              <small>{C.ahead}</small>
              <ul className="adm-list bx-cvs">
                {card.ahead.map((v) => (
                  <VisitLine key={v.id} v={v} tz={tz} showTime />
                ))}
              </ul>
            </div>
          )}
          <div className="bx-noteblk">
            <small>{C.past}</small>
            {card.past.length === 0 ? (
              <p className="adm-meta">{C.none}</p>
            ) : (
              <ul className="adm-list bx-cvs">
                {card.past.map((v) => (
                  <VisitLine key={v.id} v={v} tz={tz} showTime={false} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </BSheet>
  );
}
