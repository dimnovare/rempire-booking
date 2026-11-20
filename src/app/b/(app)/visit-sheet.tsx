"use client";

/**
 * A visit's sheet in the barber's day (B2, B3, B6) and in «Мой день» of an
 * owner who cuts: the one visit sheet of the app (the admin's
 * visit-sheet.tsx; Dim, decision round 11), with the barber app's words
 * and his own actions (visit-actions.ts), which touch his column only.
 *
 *   chips      Ожидание · Пришёл · Не пришёл · Подтвердил, written at once;
 *   services   «+ Добавить услугу» from his own services, «Убрать услугу»;
 *   notes      the client's shared note and this visit's own, changed in place;
 *   card       «Карточка клиента» opens his card (client-sheet.tsx);
 *   foot       «Перенести» and «Отменить запись» (with a reason) for a visit
 *              still to come, «Записать снова».
 *
 * What the login may do comes from the day (may.tsx, barberMay); the server
 * asks the same rights again.
 */
import { useEffect, useState } from "react";
import type { Offer } from "@/lib/barber/book";
import { INTL } from "@/lib/i18n";
import type { BVisit } from "@/lib/barber/day";
import { CAME, CHIP, chipOf } from "../../admin/(app)/visit-kit";
import { VisitSheetView, type SheetAnswer } from "../../admin/(app)/visit-sheet";
import { pick3 } from "../copy.shared";
import { useB } from "../lang";
import { useMay } from "./may";
import { loadClientCard, saveClientNote, saveVisitNote, setVisitServices, setVisitStatus } from "./visit-actions";

export type VisitSheetProps = {
  v: BVisit;
  tz: string;
  /** his services, with his prices and times: what «+ Добавить услугу» offers */
  offers: Offer[];
  canBook: boolean;
  onClose: () => void;
  onMove: () => void;
  onCancel: () => void;
  onAgain: () => void;
  onClient: () => void;
  /** a toast of the day's */
  onSaved: (text: string, bad?: boolean) => void;
};

export function VisitSheet({ v, tz, offers, canBook, onClose, onMove, onCancel, onAgain, onClient, onSaved }: VisitSheetProps) {
  const B = useB();
  const may = useMay();

  // the visit as written here; taken anew when the day's data comes again
  const fresh = () => ({ status: v.status, confirmed: v.confirmed, ids: v.services.map((s) => s.serviceId), totalCents: v.totalCents, extraCents: v.extraCents, end: v.end });
  const [st, setSt] = useState(fresh);
  const key = `${v.status}|${v.confirmed}|${v.services.map((s) => s.serviceId).join()}|${v.totalCents}|${v.end}`;
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setSt(fresh());
  }

  // «12 визитов» beside «Карточка клиента»: his visits with this client
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!may.card) return;
    let live = true;
    loadClientCard(v.clientId).then(
      (c) => live && setCount(c?.count ?? null),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [v.clientId, may.card]);

  // a visit still to come can be moved or cancelled (one that took place is history)
  const ahead = st.status === "booked" || st.status === "pending";
  // a visit the client has come to has a right of its own
  const canEdit = may.edit && (!CAME.has(st.status) || may.editCame);
  const name = (n: BVisit["services"][number]["name"]) => pick3(n, B.lang);
  const lineOf = (id: string) => {
    const booked = v.services.find((s) => s.serviceId === id);
    if (booked) return { id, name: name(booked.name), cents: booked.priceCents, minutes: booked.durationMin };
    const o = offers.find((x) => x.id === id);
    return { id, name: o ? name(o.name) : "", cents: o?.priceCents ?? 0, minutes: o?.durationMin ?? 0 };
  };

  const services = async (ids: string[], force: boolean): Promise<SheetAnswer> => {
    const r = await setVisitServices(v.id, ids, force);
    if (r.ok) {
      setSt((x) => ({ ...x, ids, totalCents: r.totalCents, extraCents: r.extraCents, end: r.end }));
      return { ok: true };
    }
    if (r.code === "outside_hours" || r.code === "time_off") return { ok: false, warn: r.code === "time_off" ? B.book.overBlock : B.book.outsideHours };
    return {
      ok: false,
      problem: r.code === "overlap" ? B.book.overlap : r.code === "not_offered" ? B.book.notOffered : r.code === "not_found" || r.code === "cancelled" ? B.book.gone : r.code === "forbidden" ? B.rights.none : B.error,
    };
  };

  return (
    <VisitSheetView
      w={B.vs}
      intl={INTL[B.lang]}
      tz={tz}
      clientName={v.clientName}
      start={v.start}
      end={st.end}
      phone={v.clientPhone}
      callable={!!v.clientPhone && may.call}
      showNoPhone={may.card}
      card={may.card ? { open: onClient, visits: count } : null}
      clientNote={v.clientNote}
      saveClientNote={may.card && may.clientNote ? (text) => saveClientNote(v.clientId, text) : undefined}
      comment={v.comment}
      staffNote={v.staffNote}
      saveStaffNote={canEdit && may.note ? (text) => saveVisitNote(v.id, text) : undefined}
      gone={false}
      chip={chipOf(st.status, st.confirmed)}
      onChip={
        canEdit
          ? async (c) => {
              const [status, confirmed] = CHIP[c];
              if (!(await setVisitStatus(v.id, status, confirmed))) return false;
              setSt((x) => ({ ...x, status, confirmed }));
              return true;
            }
          : undefined
      }
      lines={st.ids.map(lineOf)}
      extraCents={st.extraCents}
      totalCents={st.totalCents}
      offers={canEdit && may.services && offers.length ? offers.map((o) => ({ id: o.id, name: name(o.name), cents: o.priceCents, minutes: o.durationMin })) : null}
      onServices={services}
      onMove={ahead && may.move ? onMove : undefined}
      onCancelOpen={ahead && may.cancel ? onCancel : undefined}
      onAgain={canBook ? onAgain : undefined}
      meta={`${B.visit.source[v.source] ?? v.source}${v.reminder ? "" : ` · ${B.visit.reminderOff}`}`}
      onClose={onClose}
      say={onSaved}
    />
  );
}
