"use client";

/**
 * «Настройки», as the invoicing tool's cards: «Моя компания», the bank
 * account printed on an invoice, the number series, an invoice line's VAT
 * and the text at the foot, and the money switches.
 *
 * The company's details (the first four cards are one record, the issuer)
 * save by themselves once it exists; the first save is a button. The last
 * number has its own button, because it moves the series and only ever goes
 * up. The money switches save by themselves. A login that is not the owner
 * sees everything greyed out.
 */
import Link from "next/link";
import { useState } from "react";
import type { Issuer } from "@/lib/billing/parties";
import { BASES } from "@/lib/money";
import { useA } from "../../../lang";
import { SaveState, useAutoSave } from "../../autosave";
import { saveIssuerAction, saveMoneyAction, setLastNumberAction } from "../actions";
import { INV_ROOT, PartyIcon, ToolIcon } from "../common";
import { Field, IvTop } from "../ui";

type Money = { commission_bp: number; commission_basis: string; billing_day: number };
type Draft = { legalName: string; regCode: string; vatNumber: string; vatRate: string; address: string; email: string; phone: string; iban: string; bankName: string; prefix: string; digits: string; yearly: boolean; note: string };

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

function CardHead({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="iv-card-head">
      <span className="iv-tile-ico" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function SettingsView({ issuer, year, owner, money }: { issuer: Issuer | null; year: number; owner: boolean; money: Money }) {
  const A = useA();
  const S = A.inv.set;
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
    <>
      <IvTop title={A.inv.menu.settings} />
      <div className="iv-body">
        {!owner && <p className="iv-note">{A.inv.ownerOnly}</p>}
        <form
          className="iv-set"
          onBlur={auto.flush}
          onSubmit={(e) => {
            e.preventDefault();
            if (id) auto.flush();
            else void create();
          }}
        >
          <section className="iv-card">
            <CardHead icon={<PartyIcon />} title={A.inv.company}>
              {owner && id && <SaveState auto={auto} />}
            </CardHead>
            <p className="iv-mute">{A.inv.companyHint}</p>
            <fieldset className="iv-fs" disabled={!owner}>
              <h3 className="iv-h6">{S.basic}</h3>
              <div className="iv-fields">
                <Field label={A.inv.issuerName}>
                  <input required maxLength={160} value={d.legalName} onChange={(e) => set("legalName", e.target.value)} />
                </Field>
                <Field label={A.inv.regCode}>
                  <input inputMode="numeric" maxLength={20} value={d.regCode} onChange={(e) => set("regCode", e.target.value)} />
                </Field>
                <Field label={A.inv.issuerVat}>
                  <input maxLength={20} placeholder="EE…" value={d.vatNumber} onChange={(e) => set("vatNumber", e.target.value.toUpperCase())} />
                </Field>
              </div>
              <h3 className="iv-h6">{S.contacts}</h3>
              <div className="iv-fields">
                <Field label={A.inv.email}>
                  <input type="email" maxLength={254} value={d.email} onChange={(e) => set("email", e.target.value)} />
                </Field>
                <Field label={A.inv.phone}>
                  <input type="tel" maxLength={40} value={d.phone} onChange={(e) => set("phone", e.target.value)} />
                </Field>
                <Field label={A.inv.address} className="is-all">
                  <input maxLength={300} value={d.address} onChange={(e) => set("address", e.target.value)} />
                </Field>
              </div>
            </fieldset>
            <p className="iv-mute">{S.noLogo}</p>
          </section>

          <section className="iv-card">
            <CardHead icon={<ToolIcon name="pay" size={24} />} title={S.bankCard} />
            <fieldset className="iv-fs" disabled={!owner}>
              <div className="iv-fields">
                <Field label={A.inv.iban}>
                  <input maxLength={42} value={d.iban} onChange={(e) => set("iban", e.target.value.toUpperCase())} />
                </Field>
                <Field label={A.inv.bank}>
                  <input maxLength={80} value={d.bankName} onChange={(e) => set("bankName", e.target.value)} />
                </Field>
              </div>
            </fieldset>
          </section>

          <section className="iv-card">
            <CardHead icon={<ToolIcon name="file" size={24} />} title={S.numbering} />
            <fieldset className="iv-fs" disabled={!owner}>
              <div className="iv-fields">
                <Field label={A.inv.prefix}>
                  <input maxLength={12} value={d.prefix} onChange={(e) => set("prefix", e.target.value)} />
                </Field>
                <Field label={A.inv.digits}>
                  <input type="number" inputMode="numeric" min={0} max={8} value={d.digits} onChange={(e) => set("digits", e.target.value)} />
                </Field>
              </div>
              <label className="iv-switch">
                <span>{A.inv.yearly}</span>
                <input type="checkbox" role="switch" className="adm-sw" checked={d.yearly} onChange={(e) => set("yearly", e.target.checked)} />
              </label>
              <p className="iv-mute">{A.inv.nextNo(numberText(d, year, (issuer?.lastNumber ?? 0) + 1))}</p>
            </fieldset>
          </section>

          <section className="iv-card">
            <CardHead icon={<ToolIcon name="note" size={24} />} title={S.lineCard} />
            <fieldset className="iv-fs" disabled={!owner}>
              <div className="iv-fields">
                <Field label={A.inv.vatRate}>
                  <input inputMode="decimal" value={d.vatRate} onChange={(e) => set("vatRate", e.target.value)} />
                </Field>
                <Field label={A.inv.footer} className="is-all">
                  <textarea rows={2} maxLength={300} value={d.note} onChange={(e) => set("note", e.target.value)} />
                </Field>
              </div>
            </fieldset>
            <p className="iv-mute">
              {S.termsNote}{" "}
              <Link className="iv-link" href={`${INV_ROOT}/receivers`} prefetch={false}>
                {A.inv.receivers}
              </Link>
            </p>
          </section>

          {owner && !id && (
            <div className="iv-acts">
              {err && (
                <p className="iv-err" role="alert">
                  {err}
                </p>
              )}
              <button type="submit" className="iv-btn is-main" disabled={busy}>
                {A.inv.createIssuer}
              </button>
            </div>
          )}
        </form>

        {issuer && <LastNumberCard issuer={issuer} year={year} owner={owner} />}
        <MoneyCard money={money} owner={owner} />
      </div>
    </>
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
    <section className="iv-card">
      <CardHead icon={<ToolIcon name="sheet" size={24} />} title={A.inv.last} />
      <p className="iv-mute">{A.inv.lastHint}</p>
      <fieldset className="iv-fs" disabled={!owner}>
        <div className="iv-fields">
          <Field label={numberText(issuer, year, Number(v) || 0)}>
            <input type="number" inputMode="numeric" min={issuer.lastNumber} value={v} onChange={(e) => setV(e.target.value)} />
          </Field>
        </div>
      </fieldset>
      {msg && (
        <p className={msg.ok ? "iv-ok" : "iv-err"} role="status">
          {msg.text}
        </p>
      )}
      {owner && (
        <p>
          <button type="button" className="iv-btn" disabled={busy || Number(v) === issuer.lastNumber} onClick={() => void save()}>
            {A.inv.setLast}
          </button>
        </p>
      )}
    </section>
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
    <section className="iv-card">
      <CardHead icon={<ToolIcon name="credit" size={24} />} title={A.inv.money}>
        {owner && <SaveState auto={auto} />}
      </CardHead>
      <fieldset className="iv-fs" disabled={!owner} onBlur={auto.flush}>
        <div className="iv-fields">
          <Field label={A.inv.share}>
            <input inputMode="decimal" value={d.share} onChange={(e) => setD({ ...d, share: e.target.value })} />
          </Field>
          <Field label={A.inv.billingDay}>
            <input type="number" inputMode="numeric" min={1} max={28} value={d.day} onChange={(e) => setD({ ...d, day: e.target.value })} />
          </Field>
        </div>
        <div>
          <p className="iv-mute" style={{ marginBottom: 8 }}>
            {A.inv.basis}
          </p>
          <div className="iv-seg" role="group" aria-label={A.inv.basis}>
            {BASES.map((b) => (
              <button key={b} type="button" aria-pressed={d.basis === b} onClick={() => setD({ ...d, basis: b })}>
                {A.inv.bases[b]}
              </button>
            ))}
          </div>
        </div>
        <p className="iv-mute">{A.inv.basisHint}</p>
      </fieldset>
    </section>
  );
}
