"use client";

import { useActionState, useState } from "react";
import { A } from "../copy";
import { codeLogin, passwordLogin, requestCode, type LoginState } from "./actions";

const ERR: Record<string, string> = {
  bad: A.login.bad,
  badCode: A.login.badCode,
  expired: A.login.expired,
  wait: A.login.wait,
  waitCode: A.login.waitCode,
  noEmail: A.login.noEmail,
  noDb: A.noDb,
  role: A.login.role,
};

export function LoginForm({ next, initialError, google }: { next: string; initialError?: string; google: boolean }) {
  const [mode, setMode] = useState<"password" | "code">("password");
  const [pw, pwAction, pwBusy] = useActionState<LoginState, FormData>(passwordLogin, {});
  const [req, reqAction, reqBusy] = useActionState<LoginState, FormData>(requestCode, {});
  const [code, codeAction, codeBusy] = useActionState<LoginState, FormData>(codeLogin, {});
  const [email, setEmail] = useState("");

  const sent = (req.sent && !code.error) || code.sent;
  const error = mode === "password" ? (pw.error ?? initialError) : (code.error ?? req.error);

  return (
    <div className="adm-login-box">
      {error && ERR[error] && (
        <p className="adm-err" role="alert">
          {ERR[error]}
        </p>
      )}
      {mode === "password" ? (
        <form action={pwAction} className="adm-form">
          <input type="hidden" name="next" value={next} />
          <label className="adm-field">
            <span>{A.login.email}</span>
            <input name="email" type="email" autoComplete="username" inputMode="email" required defaultValue={pw.email ?? email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="adm-field">
            <span>{A.login.password}</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="adm-btn adm-btn-lime" disabled={pwBusy}>
            {A.login.enter}
          </button>
          <button type="button" className="adm-link" onClick={() => setMode("code")}>
            {A.login.byCode}
          </button>
        </form>
      ) : (
        <>
          <form action={reqAction} className="adm-form">
            <label className="adm-field">
              <span>{A.login.email}</span>
              <input name="email" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {!sent && (
              <button className="adm-btn adm-btn-lime" disabled={reqBusy}>
                {A.login.sendCode}
              </button>
            )}
          </form>
          {sent && (
            <form action={codeAction} className="adm-form">
              <p className="adm-note">{A.login.codeSent}</p>
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="email" value={email} />
              <label className="adm-field">
                <span>{A.login.code}</span>
                <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
              </label>
              <button className="adm-btn adm-btn-lime" disabled={codeBusy}>
                {A.login.enter}
              </button>
            </form>
          )}
          <button type="button" className="adm-link" onClick={() => setMode("password")}>
            {A.login.byPassword}
          </button>
        </>
      )}
      {google && (
        <a className="adm-btn adm-btn-ghost" href="/api/auth/google">
          {A.login.google}
        </a>
      )}
    </div>
  );
}
