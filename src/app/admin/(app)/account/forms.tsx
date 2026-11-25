"use client";

import { useState } from "react";
import { LangSwitch, useA } from "../../lang";
import { changeMyPassword, linkUserStaff, setMyLang } from "./actions";

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
      className="adm-form ac-pw"
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
      <button className="adm-btn adm-btn-lime adm-btn-sm" disabled={busy}>
        {hasPassword ? A.account.changePassword : A.account.setPassword}
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
