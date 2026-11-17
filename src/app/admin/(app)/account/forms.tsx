"use client";

import { useState } from "react";
import { A } from "../../copy";
import { addUser, changeMyPassword, toggleUser } from "./actions";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
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
  const [u, setU] = useState({ email: "", name: "", role: "staff", staffId: staff[0]?.id ?? "", password: "" });
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
          for (const [k, v] of Object.entries(u)) f.set(k, v);
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

export function ToggleUser({ id, active }: { id: string; active: boolean }) {
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
