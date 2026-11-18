"use client";

import { useState } from "react";
import { LOCALES, type Locale } from "@/lib/i18n";
import { LANG_NAMES } from "../../copy";
import { LangSwitch, useA } from "../../lang";
import { addUser, changeMyPassword, linkUserStaff, setMyLang, toggleUser } from "./actions";

/** My login's language: Русский · Eesti · English. It follows the login to every device. */
export function MyLang() {
  return <LangSwitch pick={setMyLang} />;
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const A = useA();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="adm-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const f = new FormData();
          f.set("current", current);
          f.set("next", next);
          const r = await changeMyPassword(f);
          setMsg(r === "ok" ? { ok: true, text: A.account.changed } : { ok: false, text: r === "wrong" ? A.account.wrong : A.account.short });
          if (r === "ok") {
            setCurrent("");
            setNext("");
          }
        } catch {
          setMsg({ ok: false, text: A.error });
        } finally {
          setBusy(false);
        }
      }}
    >
      {hasPassword && (
        <label className="adm-field">
          <span>{A.account.current}</span>
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
      )}
      <label className="adm-field">
        <span>{A.account.newPassword}</span>
        <input type="password" autoComplete="new-password" required minLength={8} maxLength={200} value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      {msg && <p className={msg.ok ? "adm-ok" : "adm-err"}>{msg.text}</p>}
      <button className="adm-btn adm-btn-line" disabled={busy}>
        {hasPassword ? A.account.changePassword : A.account.setPassword}
      </button>
    </form>
  );
}

export function AddUserForm({ staff }: { staff: { id: string; name: string }[] }) {
  const A = useA();
  // a new login starts in the language of whoever adds it, unless another is picked for it
  const [u, setU] = useState<{ email: string; name: string; role: string; staffId: string; also: string; password: string; locale: Locale }>({ email: "", name: "", role: "staff", staffId: staff[0]?.id ?? "", also: "", password: "", locale: A.lang });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="adm-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const f = new FormData();
          for (const [k, v] of Object.entries(u)) if (k !== "also") f.set(k, v);
          // a barber's login is its barber; an owner or admin may be one too
          f.set("staffId", u.role === "staff" ? u.staffId : u.also);
          const r = await addUser(f);
          if (r.ok) {
            setMsg({ ok: true, text: A.saved });
            setU({ ...u, email: "", name: "", password: "" });
          } else setMsg({ ok: false, text: r.field === "email_taken" ? A.account.taken : A.visit.invalid(r.field) });
        } catch {
          setMsg({ ok: false, text: A.error });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="adm-field">
        <span>{A.login.email}</span>
        <input type="email" required value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} />
      </label>
      <div className="adm-seg adm-seg-wide" role="group">
        {(["staff", "admin", "owner"] as const).map((r) => (
          <button key={r} type="button" aria-pressed={u.role === r} onClick={() => setU({ ...u, role: r })}>
            {A.account.roles[r]}
          </button>
        ))}
      </div>
      {u.role === "staff" && (
        <label className="adm-field">
          <span>{A.account.linkStaff}</span>
          <select value={u.staffId} onChange={(e) => setU({ ...u, staffId: e.target.value })}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {u.role !== "staff" && (
        <label className="adm-field">
          <span>{A.account.alsoBarber}</span>
          <select value={u.also} onChange={(e) => setU({ ...u, also: e.target.value })}>
            <option value="">{A.account.notBarber}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {u.also && <small className="adm-meta">{A.account.alsoHint}</small>}
        </label>
      )}
      <div className="adm-field">
        <span>{A.langLabel}</span>
        <div className="adm-seg adm-seg-wide" role="group" aria-label={A.langLabel}>
          {LOCALES.map((l) => (
            <button key={l} type="button" lang={l} aria-pressed={u.locale === l} onClick={() => setU({ ...u, locale: l })}>
              {LANG_NAMES[l]}
            </button>
          ))}
        </div>
      </div>
      <label className="adm-field">
        <span>{A.account.firstPassword}</span>
        <input type="password" autoComplete="new-password" minLength={8} maxLength={200} value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} />
      </label>
      {msg && <p className={msg.ok ? "adm-ok" : "adm-err"}>{msg.text}</p>}
      <button className="adm-btn adm-btn-lime" disabled={busy}>
        {A.account.addUser}
      </button>
    </form>
  );
}

/** An owner's or admin's login: the barber he is too, or «Нет». It saves by itself. */
export function LinkStaff({ id, email, staffId, staff }: { id: string; email: string; staffId: string | null; staff: { id: string; name: string }[] }) {
  const A = useA();
  const [value, setValue] = useState(staffId ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <label className="adm-linkstaff">
      <span>{A.account.alsoBarber}</span>
      <select
        value={value}
        disabled={busy}
        aria-label={`${A.account.alsoBarber}: ${email}`}
        onChange={async (e) => {
          const next = e.target.value;
          const was = value;
          setValue(next);
          setBusy(true);
          try {
            if (!(await linkUserStaff(id, next))) setValue(was);
          } catch {
            setValue(was);
          } finally {
            setBusy(false);
          }
        }}
      >
        <option value="">{A.account.notBarber}</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToggleUser({ id, active }: { id: string; active: boolean }) {
  const A = useA();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`adm-txt ${active ? "warn" : "lime"}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await toggleUser(id, !active);
        } finally {
          setBusy(false);
        }
      }}
    >
      {active ? A.account.disable : A.account.enable}
    </button>
  );
}
