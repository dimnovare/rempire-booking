"use client";

/**
 * «Получатели»: the list and one receiver's editor, as «Услуги» does it: a
 * sheet on a phone, a pane beside the list from 900px. A receiver that
 * exists saves by itself; a new one is made with the one button. The chair
 * rent is the barber's, with its own button: a new amount starts on a day
 * and never rewrites a month that is already invoiced.
 */
import { useState } from "react";
import type { Receiver, Rent } from "@/lib/billing/parties";
import { amountText, euroText, parseCents } from "@/lib/money";
import { PlusIcon } from "../../../icons";
import { useA } from "../../../lang";
import { SaveState, useAutoSave } from "../../autosave";
import { Pane } from "../../sheet";
import { saveReceiverAction, setRentAction } from "../actions";
import { dmy } from "../common";

type Staff = { id: string; name: string; active: boolean };
type Opt = { id: string; name: string };
type Draft = {
  staffId: string;
  issuerId: string;
  kind: string;
  legalName: string;
  regCode: string;
  vatNumber: string;
  address: string;
  email: string;
  vatMode: string;
  termsDays: string;
  locale: string;
  active: boolean;
};

const NEW = "new";

const draftOf = (r?: Receiver, staffId = ""): Draft => ({
  staffId: r ? (r.staffId ?? "") : staffId,
  issuerId: r?.issuerId ?? "",
  kind: r?.kind ?? "fie",
  legalName: r?.legalName ?? "",
  regCode: r?.regCode ?? "",
  vatNumber: r?.vatNumber ?? "",
  address: r?.address ?? "",
  email: r?.email ?? "",
  vatMode: r?.vatMode ?? "vat",
  termsDays: String(r?.termsDays ?? 7),
  locale: r?.locale ?? "et",
  active: r?.active ?? true,
});

const inputOf = (d: Draft) => ({
  staffId: d.staffId || null,
  issuerId: d.issuerId || null,
  kind: d.kind,
  legalName: d.legalName,
  regCode: d.regCode,
  vatNumber: d.vatNumber,
  address: d.address,
  email: d.email,
  vatMode: d.vatMode,
  termsDays: Number(d.termsDays),
  locale: d.locale,
  active: d.active,
});

function wrong(A: ReturnType<typeof useA>, d: Draft): string | null {
  if (!d.legalName.trim()) return A.inv.bad("legalName");
  if (d.kind !== "person" && !/^\d{6,12}$/.test(d.regCode.trim())) return A.inv.bad("regCode");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return A.inv.bad("email");
  const t = Number(d.termsDays);
  if (!Number.isInteger(t) || t < 0 || t > 120) return A.inv.bad("termsDays");
  return null;
}

export function ReceiversView({ head, receivers, rents, staff, issuers, today }: { head: React.ReactNode; receivers: Receiver[]; rents: Rent[]; staff: Staff[]; issuers: Opt[]; today: string }) {
  const A = useA();
  const [sel, setSel] = useState<string>(receivers[0]?.id ?? NEW);
  const [shown, setShown] = useState(false);
  const current = receivers.find((r) => r.id === sel);
  const rentOf = (staffId: string | null) => (staffId ? rents.filter((r) => r.staffId === staffId) : []);
  const nowRent = (staffId: string | null) => rentOf(staffId).find((r) => r.validFrom <= today) ?? null;
  // barbers with no receiver yet: the first one is offered for a new one
  const free = staff.filter((s) => s.active && !receivers.some((r) => r.active && r.staffId === s.id));

  const pick = (id: string) => {
    setSel(id);
    setShown(true);
  };

  return (
    <>
      <div className="adm-two-main">
        {head}
        <div className="adm-page-head">
          <h2 className="adm-card-h">{A.inv.receivers}</h2>
          <button type="button" className="adm-btn adm-btn-line adm-btn-sm" onClick={() => pick(NEW)}>
            <PlusIcon size={14} />
            {A.add}
          </button>
        </div>
        <p className="adm-meta">{A.inv.receiversHint}</p>
        <ul className="adm-list">
          {receivers.map((r) => {
            const rent = nowRent(r.staffId);
            return (
              <li key={r.id}>
                <button type="button" className={`adm-item${r.active ? "" : " is-off"}`} aria-current={sel === r.id ? "true" : undefined} onClick={() => pick(r.id)}>
                  <span className="txt">
                    <span className="plain">{r.legalName}</span>
                    <small>
                      {A.inv.kinds[r.kind]}
                      {r.regCode ? ` · ${r.regCode}` : ""} · {r.staffName ?? A.inv.noStaff}
                      {!r.active ? ` · ${A.inv.off}` : ""}
                    </small>
                    <span className="tags">
                      <span className="adm-tag">{r.vatMode === "vat" ? A.inv.vatOn : A.inv.vatOff}</span>
                    </span>
                  </span>
                  <span className="end">{rent ? euroText(rent.amountCents) : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {free.length > 0 && (
          <p className="adm-meta">
            {A.inv.noReceiver}: {free.map((s) => s.name).join(", ")}
          </p>
        )}
      </div>

      <ReceiverPane
        key={current?.id ?? NEW}
        receiver={current}
        defaultStaff={free[0]?.id ?? ""}
        staff={staff}
        issuers={issuers}
        rents={rentOf(current?.staffId ?? null)}
        today={today}
        open={shown}
        onClose={() => setShown(false)}
        onCreated={(id) => {
          setSel(id);
          setShown(false);
        }}
      />
    </>
  );
}

function ReceiverPane({
  receiver,
  defaultStaff,
  staff,
  issuers,
  rents,
  today,
  open,
  onClose,
  onCreated,
}: {
  receiver?: Receiver;
  defaultStaff: string;
  staff: Staff[];
  issuers: Opt[];
  rents: Rent[];
  today: string;
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const A = useA();
  const [d, setD] = useState<Draft>(() => draftOf(receiver, defaultStaff));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = receiver?.id ?? null;
  const send = (v: Draft) => saveReceiverAction(id, inputOf(v));
  const auto = useAutoSave<Draft>(d, setD, send, { off: !id, check: (v) => wrong(A, v), label: receiver?.legalName || A.inv.receivers });

  const create = async () => {
    const w = wrong(A, d);
    if (w) return setErr(w);
    setBusy(true);
    setErr(null);
    try {
      const r = await send(d);
      if (r.ok) return onCreated(r.id);
      setErr(A.inv.bad(r.field));
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });

  return (
    <Pane
      title={id ? d.legalName || A.inv.receivers : A.inv.newReceiver}
      open={open}
      onClose={() => {
        auto.flush();
        onClose();
      }}
      bar={
        id ? (
          <SaveState auto={auto} onDone={onClose} />
        ) : (
          <>
            {err && (
              <p className="adm-err" role="alert">
                {err}
              </p>
            )}
            <button type="submit" form="rcv-form" className="adm-btn adm-btn-lime" disabled={busy}>
              {A.inv.addReceiver}
            </button>
          </>
        )
      }
    >
      <form
        id="rcv-form"
        className="adm-form"
        onBlur={auto.flush}
        onSubmit={(e) => {
          e.preventDefault();
          if (id) auto.flush();
          else void create();
        }}
      >
        <div className="adm-seg adm-seg-wide" role="group" aria-label={A.inv.kinds.fie}>
          {(["fie", "ou", "person"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={d.kind === k} onClick={() => set("kind", k)}>
              {A.inv.kinds[k]}
            </button>
          ))}
        </div>
        <label className="adm-field">
          <span>{A.inv.legalName}</span>
          <input required maxLength={160} value={d.legalName} onChange={(e) => set("legalName", e.target.value)} />
        </label>
        <div className="adm-row">
          <label className="adm-field">
            <span>{A.inv.regCode}</span>
            <input inputMode="numeric" maxLength={12} required={d.kind !== "person"} value={d.regCode} onChange={(e) => set("regCode", e.target.value)} />
          </label>
          <label className="adm-field">
            <span>{A.inv.vatNumber}</span>
            <input maxLength={20} placeholder="EE…" value={d.vatNumber} onChange={(e) => set("vatNumber", e.target.value.toUpperCase())} />
          </label>
        </div>
        <label className="adm-field">
          <span>{A.inv.address}</span>
          <input maxLength={300} value={d.address} onChange={(e) => set("address", e.target.value)} />
        </label>
        <label className="adm-field">
          <span>{A.inv.email}</span>
          <input type="email" required maxLength={254} value={d.email} onChange={(e) => set("email", e.target.value)} />
        </label>
        <div className="adm-field">
          <span>{A.inv.vatMode}</span>
          <div className="adm-seg adm-seg-wide" role="group" aria-label={A.inv.vatMode}>
            <button type="button" aria-pressed={d.vatMode === "vat"} onClick={() => set("vatMode", "vat")}>
              {A.inv.vatOn}
            </button>
            <button type="button" aria-pressed={d.vatMode === "none"} onClick={() => set("vatMode", "none")}>
              {A.inv.vatOff}
            </button>
          </div>
        </div>
        <div className="adm-row">
          <label className="adm-field">
            <span>{A.inv.terms}</span>
            <input type="number" inputMode="numeric" min={0} max={120} value={d.termsDays} onChange={(e) => set("termsDays", e.target.value)} />
          </label>
          <label className="adm-field">
            <span>{A.inv.locale}</span>
            <select value={d.locale} onChange={(e) => set("locale", e.target.value)}>
              <option value="et">Eesti</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <label className="adm-field">
          <span>{A.inv.staff}</span>
          <select value={d.staffId} onChange={(e) => set("staffId", e.target.value)}>
            <option value="">{A.inv.noStaff}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {issuers.length > 1 && (
          <label className="adm-field">
            <span>{A.inv.company}</span>
            <select value={d.issuerId} onChange={(e) => set("issuerId", e.target.value)}>
              <option value="">—</option>
              {issuers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="adm-toggle">
          <span>{A.inv.active}</span>
          <input type="checkbox" role="switch" className="adm-sw" checked={d.active} onChange={(e) => set("active", e.target.checked)} />
        </label>
      </form>
      {id && <RentBlock staffId={receiver?.staffId ?? null} rents={rents} today={today} />}
    </Pane>
  );
}

function RentBlock({ staffId, rents, today }: { staffId: string | null; rents: Rent[]; today: string }) {
  const A = useA();
  // rents come newest first: the first one already started is the one in force
  const now = rents.find((r) => r.validFrom <= today) ?? null;
  const [amount, setAmount] = useState(now ? amountText(now.amountCents) : "");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!staffId)
    return (
      <section className="adm-inv-rent">
        <h3 className="adm-h2">{A.inv.rent}</h3>
        <p className="adm-meta">{A.inv.needStaff}</p>
      </section>
    );
  const save = async () => {
    const cents = parseCents(amount);
    if (cents == null || cents < 0) return setMsg({ ok: false, text: A.inv.bad("amountCents") });
    setBusy(true);
    setMsg(null);
    try {
      const r = await setRentAction(staffId, cents, from);
      setMsg(r.ok ? { ok: true, text: A.inv.rentSaved } : { ok: false, text: A.inv.bad(r.field) });
    } catch {
      setMsg({ ok: false, text: A.error });
    }
    setBusy(false);
  };
  return (
    <section className="adm-inv-rent">
      <h3 className="adm-h2">{A.inv.rent}</h3>
      <p>{now ? A.inv.rentNow(euroText(now.amountCents), dmy(now.validFrom)) : A.inv.noRent}</p>
      {rents
        .filter((r) => r.validFrom > today)
        .reverse()
        .map((r) => (
          <p key={r.id} className="adm-ok">
            {A.inv.rentNext(euroText(r.amountCents), dmy(r.validFrom))}
          </p>
        ))}
      <div className="adm-row">
        <label className="adm-field">
          <span>{A.inv.rentAmount}</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="adm-field">
          <span>{A.inv.rentFrom}</span>
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
      </div>
      {msg && (
        <p className={msg.ok ? "adm-ok" : "adm-err"} role="status">
          {msg.text}
        </p>
      )}
      <button type="button" className="adm-btn adm-btn-line adm-btn-sm" disabled={busy} onClick={() => void save()}>
        {A.inv.setRent}
      </button>
      {rents.length > 1 && (
        <details>
          <summary className="adm-meta">{A.inv.rentHistory}</summary>
          <ul className="adm-lines">
            {rents.map((r) => (
              <li key={r.id}>
                <span>{dmy(r.validFrom)}</span>
                <span>{euroText(r.amountCents)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
