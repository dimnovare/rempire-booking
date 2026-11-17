"use client";

/**
 * Password first, then the e-mail code, Google last: in an iPhone home-screen
 * app Google's page may not land back in the app (docs/data-model.md), so
 * there the two that stay inside the app come first.
 */
import { useActionState, useEffect, useState } from "react";
import { EyeIcon } from "../../admin/icons";
import { useB } from "../lang";
import { codeLogin, passwordLogin, requestCode, type LoginState } from "./actions";

export function LoginForm({ next, initialError, google }: { next: string; initialError?: string; google: boolean }) {
  const B = useB();
  const L = B.login;
  const [mode, setMode] = useState<"password" | "code">("password");
  const [pw, pwAction, pwBusy] = useActionState<LoginState, FormData>(passwordLogin, {});
  const [req, reqAction, reqBusy] = useActionState<LoginState, FormData>(requestCode, {});
  const [code, codeAction, codeBusy] = useActionState<LoginState, FormData>(codeLogin, {});
  const [email, setEmail] = useState("");
  const [show, setShow] = useState(false);
  const [standaloneIos, setStandaloneIos] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    setStandaloneIos(standalone && /iPhone|iPad|iPod/.test(navigator.userAgent));
  }, []);

  const ERR: Record<string, string> = {
    bad: L.bad,
    badCode: L.badCode,
    expired: L.expired,
    wait: L.wait,
    waitCode: L.waitCode,
    noEmail: L.noEmail,
    mailFailed: L.mailFailed,
    noDb: B.noDb,
    role: L.role,
    nostaff: L.nostaff,
    google: L.google_,
    googleUnknown: L.googleUnknown,
    googleOther: L.googleOther,
  };
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
            <span>{L.email}</span>
            <input name="email" type="email" autoComplete="username" inputMode="email" required defaultValue={pw.email ?? email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <div className="adm-field">
            <label htmlFor="bx-password">{L.password}</label>
            <div className="adm-pw">
              <input id="bx-password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required />
              <button type="button" aria-label={L.show} aria-pressed={show} onClick={() => setShow(!show)}>
                <EyeIcon />
              </button>
            </div>
          </div>
          <button className="adm-btn adm-btn-lime" disabled={pwBusy}>
            {L.enter}
          </button>
          <p className="adm-or">{L.or}</p>
          <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setMode("code")}>
            {L.byCode}
          </button>
        </form>
      ) : (
        <>
          <form action={reqAction} className="adm-form">
            <label className="adm-field">
              <span>{L.email}</span>
              <input name="email" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {!sent && (
              <button className="adm-btn adm-btn-lime" disabled={reqBusy}>
                {L.sendCode}
              </button>
            )}
          </form>
          {sent && (
            <form action={codeAction} className="adm-form">
              <p className="adm-note">{L.codeSent}</p>
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="email" value={email} />
              <label className="adm-field">
                <span>{L.code}</span>
                <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
              </label>
              <button className="adm-btn adm-btn-lime" disabled={codeBusy}>
                {L.enter}
              </button>
            </form>
          )}
          <button type="button" className="adm-txt lime" style={{ alignSelf: "flex-start" }} onClick={() => setMode("password")}>
            {L.byPassword}
          </button>
        </>
      )}
      {google && (
        <>
          <a className="adm-btn adm-btn-ghost" href={`/api/auth/google?next=${encodeURIComponent(next)}`}>
            {L.google}
          </a>
          {standaloneIos && <p className="adm-meta">{L.googleHint}</p>}
        </>
      )}
    </div>
  );
}
