"use client";

/**
 * «Компания»: three cards. The company's details save by themselves once it
 * exists (the first save is a button); the last number from Isolta has its
 * own button, because it moves the series and only ever goes up; the money
 * switches save by themselves. A login that is not the owner sees them
 * greyed out.
 */
import { useState } from "react";
import type { Issuer } from "@/lib/billing/parties";
import { BASES } from "@/lib/money";
import { useA } from "../../../lang";
import { SaveState, useAutoSave } from "../../autosave";
import { saveIssuerAction, saveMoneyAction, setLastNumberAction } from "../actions";

type Money = { commission_bp: number; commission_basis: string; billing_day: number };
type Draft = {
  legalName: string;
  regCode: string;
  vatNumber: string;
  vatRate: string;
  address: string;
  email: string;
  phone: string;
  iban: string;
  bankName: string;
  prefix: string;
  digits: string;
  yearly: boolean;
  note: string;
};

const draftOf = (i: Issuer | null): Draft => ({
  legalName: i?.legalName ?? "",
  regCode: i?.regCode ?? "",
  vatNumber: i?.vatNumber ?? "",
  vatRate: String((i?.vatBp ?? 2400) / 100).replace(".", ","),
  address: i?.address ?? "",
  email: i?.email ?? "",
  phone: i?.phone ?? "",
  iban: i?.iban ?? "",
  bankName: i?.bankName ?? "",
  prefix: i?.prefix ?? "",
  digits: String(i?.digits ?? 4),
  yearly: i?.yearly ?? true,
  note: i?.note ?? "",
});

const pct = (s: string) => Math.round(Number(s.replace(",", ".")) * 100);
const numberText = (d: { prefix: string; digits: string | number; yearly: boolean }, year: number, n: number) => `${d.prefix}${d.yearly ? `${year}-` : ""}${String(n).padStart(Number(d.digits) || 0, "0")}`;

export function CompanyView({ issuer, year, owner, money }: { issuer: Issuer | null; year: number; owner: boolean; money: Money }) {
  const A = useA();
  return (
    <section className="adm-cards">
      {!owner && <p className="adm-note">{A.inv.ownerOnly}</p>}
      <IssuerCard issuer={issuer} year={year} owner={owner} />
      {issuer && <LastNumberCard issuer={issuer} year={year} owner={owner} />}
      <MoneyCard money={money} owner={owner} />
    </section>
  );
}

function IssuerCard({ issuer, year, owner }: { issuer: Issuer | null; year: number; owner: boolean }) {
  const A = useA();
  const [d, setD] = useState<Draft>(() => draftOf(issuer));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = issuer?.id ?? null;
  const send = (v: Draft) =>
    saveIssuerAction(id, {
      legalName: v.legalName,
      regCode: v.regCode,
      vatNumber: v.vatNumber,
      vatBp: pct(v.vatRate),
      address: v.address,
      email: v.email,
      phone: v.phone,
      iban: v.iban,
      bankName: v.bankName,
      prefix: v.prefix,
      digits: Number(v.digits),
      yearly: v.yearly,
      note: v.note,
      isDefault: true,
      active: true,
    });
  const check = (v: Draft) => {
    if (!v.legalName.trim()) return A.inv.bad("legalName");
    const bp = pct(v.vatRate);
    if (!Number.isInteger(bp) || bp < 0 || bp > 10000) return A.inv.bad("vatBp");
    if (!/^[A-Za-z0-9/-]{0,12}$/.test(v.prefix)) return A.inv.bad("prefix");
    const dg = Number(v.digits);
    if (!Number.isInteger(dg) || dg < 0 || dg > 8) return A.inv.bad("digits");
    return null;
  };
  const auto = useAutoSave<Draft>(d, setD, send, { off: !id || !owner, check, label: A.inv.company });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });

  const create = async () => {
    const w = check(d);
    if (w) return setErr(w);
    setBusy(true);
    setErr(null);
    try {
      const r = await send(d);
      if (!r.ok) setErr(A.inv.bad(r.field));
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  return (
    <div className="adm-card">
      <h2 className="adm-card-h">{A.inv.company}</h2>
      <p className="adm-meta">{A.inv.companyHint}</p>
      <form
        className="adm-form"
        onBlur={auto.flush}
        onSubmit={(e) => {
          e.preventDefault();
          if (id) auto.flush();
          else void create();
        }}
      >
        <fieldset className="adm-inv-fs" disabled={!owner}>
          <label className="adm-field">
            <span>{A.inv.issuerName}</span>
            <input required maxLength={160} value={d.legalName} onChange={(e) => set("legalName", e.target.value)} />
          </label>
          <div className="adm-row">
            <label className="adm-field">
              <span>{A.inv.regCode}</span>
              <input inputMode="numeric" maxLength={20} value={d.regCode} onChange={(e) => set("regCode", e.target.value)} />
            </label>
            <label className="adm-field">
              <span>{A.inv.vatRate}</span>
              <input inputMode="decimal" value={d.vatRate} onChange={(e) => set("vatRate", e.target.value)} />
            </label>
          </div>
          <label className="adm-field">
            <span>{A.inv.issuerVat}</span>
            <input maxLength={20} placeholder="EE…" value={d.vatNumber} onChange={(e) => set("vatNumber", e.target.value.toUpperCase())} />
          </label>
          <label className="adm-field">
            <span>{A.inv.address}</span>
            <input maxLength={300} value={d.address} onChange={(e) => set("address", e.target.value)} />
          </label>
          <div className="adm-row">
            <label className="adm-field">
              <span>{A.inv.email}</span>
              <input type="email" maxLength={254} value={d.email} onChange={(e) => set("email", e.target.value)} />
            </label>
            <label className="adm-field">
              <span>{A.inv.phone}</span>
              <input type="tel" maxLength={40} value={d.phone} onChange={(e) => set("phone", e.target.value)} />
            </label>
          </div>
          <div className="adm-row">
            <label className="adm-field">
              <span>{A.inv.iban}</span>
              <input maxLength={42} value={d.iban} onChange={(e) => set("iban", e.target.value.toUpperCase())} />
            </label>
            <label className="adm-field">
              <span>{A.inv.bank}</span>
              <input maxLength={80} value={d.bankName} onChange={(e) => set("bankName", e.target.value)} />
            </label>
          </div>
          <div className="adm-row">
            <label className="adm-field">
              <span>{A.inv.prefix}</span>
              <input maxLength={12} value={d.prefix} onChange={(e) => set("prefix", e.target.value)} />
            </label>
            <label className="adm-field">
              <span>{A.inv.digits}</span>
              <input type="number" inputMode="numeric" min={0} max={8} value={d.digits} onChange={(e) => set("digits", e.target.value)} />
            </label>
          </div>
          <label className="adm-toggle">
            <span>{A.inv.yearly}</span>
            <input type="checkbox" role="switch" className="adm-sw" checked={d.yearly} onChange={(e) => set("yearly", e.target.checked)} />
          </label>
          <p className="adm-meta">{A.inv.nextNo(numberText(d, year, (issuer?.lastNumber ?? 0) + 1))}</p>
          <label className="adm-field">
            <span>{A.inv.footer}</span>
            <textarea rows={2} maxLength={300} value={d.note} onChange={(e) => set("note", e.target.value)} />
          </label>
        </fieldset>
        {owner &&
          (id ? (
            <SaveState auto={auto} />
          ) : (
            <>
              {err && (
                <p className="adm-err" role="alert">
                  {err}
                </p>
              )}
              <button type="submit" className="adm-btn adm-btn-lime" disabled={busy}>
                {A.inv.createIssuer}
              </button>
            </>
          ))}
      </form>
    </div>
  );
}

function LastNumberCard({ issuer, year, owner }: { issuer: Issuer; year: number; owner: boolean }) {
  const A = useA();
  const [v, setV] = useState(String(issuer.lastNumber));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < issuer.lastNumber) return setMsg({ ok: false, text: A.inv.lastHint });
    setBusy(true);
    setMsg(null);
    try {
      const r = await setLastNumberAction(issuer.id, n);
      setMsg(r.ok ? { ok: true, text: A.inv.lastSaved } : { ok: false, text: A.inv.lastHint });
    } catch {
      setMsg({ ok: false, text: A.error });
    }
    setBusy(false);
  };
  return (
    <div className="adm-card">
      <h2 className="adm-card-h">{A.inv.last}</h2>
      <p className="adm-meta">{A.inv.lastHint}</p>
      <fieldset className="adm-inv-fs" disabled={!owner}>
        <label className="adm-field">
          <span>{numberText(issuer, year, Number(v) || 0)}</span>
          <input type="number" inputMode="numeric" min={issuer.lastNumber} value={v} onChange={(e) => setV(e.target.value)} />
        </label>
      </fieldset>
      {msg && (
        <p className={msg.ok ? "adm-ok" : "adm-err"} role="status">
          {msg.text}
        </p>
      )}
      {owner && (
        <button type="button" className="adm-btn adm-btn-line adm-btn-sm" disabled={busy || Number(v) === issuer.lastNumber} onClick={() => void save()}>
          {A.inv.setLast}
        </button>
      )}
    </div>
  );
}

type MoneyDraft = { share: string; basis: string; day: string };

function MoneyCard({ money, owner }: { money: Money; owner: boolean }) {
  const A = useA();
  const [d, setD] = useState<MoneyDraft>({ share: String(money.commission_bp / 100).replace(".", ","), basis: money.commission_basis, day: String(money.billing_day) });
  const check = (v: MoneyDraft) => {
    const bp = pct(v.share);
    if (!Number.isInteger(bp) || bp < 0 || bp > 5000) return A.inv.bad("commission_bp");
    const day = Number(v.day);
    if (!Number.isInteger(day) || day < 1 || day > 28) return A.inv.bad("billing_day");
    return null;
  };
  const auto = useAutoSave<MoneyDraft>(d, setD, (v) => saveMoneyAction({ commission_bp: pct(v.share), commission_basis: v.basis, billing_day: Number(v.day) }), { off: !owner, check, label: A.inv.money });
  return (
    <div className="adm-card">
      <h2 className="adm-card-h">{A.inv.money}</h2>
      <fieldset className="adm-inv-fs" disabled={!owner} onBlur={auto.flush}>
        <div className="adm-row">
          <label className="adm-field">
            <span>{A.inv.share}</span>
            <input inputMode="decimal" value={d.share} onChange={(e) => setD({ ...d, share: e.target.value })} />
          </label>
          <label className="adm-field">
            <span>{A.inv.billingDay}</span>
            <input type="number" inputMode="numeric" min={1} max={28} value={d.day} onChange={(e) => setD({ ...d, day: e.target.value })} />
          </label>
        </div>
        <div className="adm-field">
          <span>{A.inv.basis}</span>
          <div className="adm-seg adm-seg-wide" role="group" aria-label={A.inv.basis}>
            {BASES.map((b) => (
              <button key={b} type="button" aria-pressed={d.basis === b} onClick={() => setD({ ...d, basis: b })}>
                {A.inv.bases[b]}
              </button>
            ))}
          </div>
        </div>
        <p className="adm-meta">{A.inv.basisHint}</p>
      </fieldset>
      {owner && <SaveState auto={auto} />}
    </div>
  );
}
