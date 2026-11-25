"use client";

/**
 * One login page for both apps (Dim, 25.11.2026, design artifact
 * 53PfD3DxCRkbDyjwLVvBHB, «Вход»): the code by e-mail first, so nobody needs
 * a password and «forgot my password» needs no page of its own; the password
 * as the second tab; Google under «или»; the language on the page itself.
 *
 * Kept on this device: the way in last used (localStorage), and a code
 * already sent (sessionStorage, its 10 minutes): an iPhone home-screen app
 * may reload when the mail app is opened, and must come back to the code.
 * The same answer for a known and an unknown address: «if such a login
 * exists».
 */
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { EyeIcon } from "@/app/admin/icons";
import { LOCALES, type Locale } from "@/lib/i18n";
import { codeLogin, passwordLogin, requestCode, setLoginLang, type LoginState } from "./actions";
import { LOGIN, type LoginError } from "./words";

type Mode = "code" | "password";
type Sent = { email: string; at: number };

const METHOD_KEY = "rb_login_method";
const SENT_KEY = "rb_login_sent";
const CODE_LIFE = 10 * 60_000;
const RESEND_AFTER = 60_000;
/** Each language under its own name, so whoever cannot read this one still finds theirs. */
const LANG_NAMES: Record<Locale, string> = { ru: "Русский", et: "Eesti", en: "English" };

function readSent(): Sent | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SENT_KEY) ?? "null") as Sent | null;
    return s && typeof s.email === "string" && typeof s.at === "number" && Date.now() - s.at < CODE_LIFE ? s : null;
  } catch {
    return null;
  }
}
function keepSent(s: Sent | null) {
  try {
    if (s) sessionStorage.setItem(SENT_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SENT_KEY);
  } catch {}
}
function keepMethod(m: Mode) {
  try {
    localStorage.setItem(METHOD_KEY, m);
  } catch {}
}
const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function LoginPanel({ app, lang, next, initialError, google }: { app: "admin" | "b"; lang: Locale; next: string; initialError?: string; google: boolean }) {
  const W = LOGIN[lang];
  const [mode, setMode] = useState<Mode>("code");
  const [sent, setSent] = useState<Sent | null>(null);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | undefined>(initialError);
  const [show, setShow] = useState(false);
  const [now, setNow] = useState(0);
  const [standaloneIos, setStandaloneIos] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const s = readSent();
    if (s) {
      setSent(s);
      setEmail(s.email);
      setNow(Date.now());
    } else {
      try {
        if (localStorage.getItem(METHOD_KEY) === "password") setMode("password");
      } catch {}
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    setStandaloneIos(standalone && /iPhone|iPad|iPod/.test(navigator.userAgent));
  }, []);

  const wait = sent ? Math.max(0, sent.at + RESEND_AFTER - now) : 0;
  const counting = wait > 0;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [counting]);

  const [, pwAction, pwBusy] = useActionState<LoginState, FormData>(async (prev, form) => {
    keepMethod("password");
    const r = await passwordLogin(prev, form);
    setErr(r.error);
    return r;
  }, {});
  const [, reqAction, reqBusy] = useActionState<LoginState, FormData>(async (prev, form) => {
    const r = await requestCode(prev, form);
    setErr(r.error);
    if (r.sent) {
      const s = { email: r.email ?? "", at: Date.now() };
      setSent(s);
      setNow(s.at);
      keepSent(s);
      keepMethod("code");
    }
    return r;
  }, {});
  const [, codeAction, codeBusy] = useActionState<LoginState, FormData>(async (prev, form) => {
    // a login that works leaves this page: the code is then used up
    const kept = readSent();
    keepSent(null);
    const r = await codeLogin(prev, form);
    setErr(r.error);
    if (r.sent && kept) keepSent(kept);
    if (!r.sent) setSent(null);
    return r;
  }, {});

  const pick = (m: Mode) => {
    setMode(m);
    setErr(undefined);
  };
  const otherEmail = () => {
    setSent(null);
    keepSent(null);
    setErr(undefined);
    requestAnimationFrame(() => emailRef.current?.focus());
  };

  const code: LoginError | undefined = err ? ((app === "b" && err === "role" ? "roleB" : err) as LoginError) : undefined;
  const message = code ? W.err[code] : undefined;

  const emailField = (
    <label className="adm-field">
      <span>{W.email}</span>
      <input ref={emailRef} name="email" type="email" autoComplete="username" inputMode="email" placeholder="name@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
    </label>
  );

  return (
    <div className="lp-box">
      <title>{`${W.title} · REMPIRE`}</title>
      {app === "b" && <p className="lp-lead">{W.lead}</p>}
      <h1 className="lp-h1">{W.title}</h1>
      <div className="lp-seg" role="group" aria-label={W.method}>
        <button type="button" aria-pressed={mode === "code"} onClick={() => pick("code")}>
          {W.tabCode}
        </button>
        <button type="button" aria-pressed={mode === "password"} onClick={() => pick("password")}>
          {W.tabPassword}
        </button>
      </div>
      {message && (
        <p className="adm-err" role="alert">
          {message}
          {code === "role" && app === "admin" && (
            <>
              {" "}
              <Link href="/b/login" prefetch={false}>
                {W.toBarber}
              </Link>
            </>
          )}
        </p>
      )}
      {mode === "password" ? (
        <form action={pwAction} className="adm-form">
          <input type="hidden" name="next" value={next} />
          {emailField}
          <div className="adm-field">
            <label htmlFor="lp-password">{W.password}</label>
            <div className="adm-pw">
              <input id="lp-password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required />
              <button type="button" aria-label={W.show} aria-pressed={show} onClick={() => setShow(!show)}>
                <EyeIcon />
              </button>
            </div>
          </div>
          <button className="adm-btn adm-btn-lime lp-main" disabled={pwBusy}>
            {pwBusy ? W.entering : W.enter}
          </button>
          <button type="button" className="lp-lnk" onClick={() => pick("code")}>
            {W.forgot}
          </button>
        </form>
      ) : sent ? (
        <>
          <div className="lp-sent" aria-live="polite">
            <p>
              {W.sentTo} <b>{sent.email}</b>. {W.sentValid}
            </p>
            <button type="button" className="lp-lnk" onClick={otherEmail}>
              {W.otherEmail}
            </button>
          </div>
          <form action={codeAction} className="adm-form">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="email" value={sent.email} />
            <label className="adm-field">
              <span>{W.code}</span>
              <input className="lp-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
            </label>
            <button className="adm-btn adm-btn-lime lp-main" disabled={codeBusy}>
              {codeBusy ? W.entering : W.enter}
            </button>
          </form>
          {counting ? (
            <p className="lp-hint" aria-live="off">
              {W.resendIn(clock(wait))}
            </p>
          ) : (
            <form action={reqAction} className="lp-resend">
              <input type="hidden" name="email" value={sent.email} />
              <button className="lp-lnk" disabled={reqBusy}>
                {reqBusy ? W.sending : W.resend}
              </button>
            </form>
          )}
        </>
      ) : (
        <form action={reqAction} className="adm-form">
          {emailField}
          <button className="adm-btn adm-btn-lime lp-main" disabled={reqBusy}>
            {reqBusy ? W.sending : W.sendCode}
          </button>
          <p className="lp-hint">{W.codeHint}</p>
        </form>
      )}
      {google && (
        <>
          <p className="adm-or">{W.or}</p>
          <a className="lp-google" href={`/api/auth/google?next=${encodeURIComponent(next)}`}>
            <GoogleG />
            {W.google}
          </a>
          {standaloneIos && app === "b" && <p className="lp-hint">{W.googleHint}</p>}
        </>
      )}
      <LangLinks lang={lang} label={W.lang} />
      {app === "b" && (
        <Link href="/b/install" className="lp-lnk lp-install" prefetch={false}>
          <PhoneIcon />
          {W.install}
        </Link>
      )}
    </div>
  );
}

/** Русский · Eesti · English: kept on this device until someone logs in (src/lib/lang-cookie.ts). */
function LangLinks({ lang, label }: { lang: Locale; label: string }) {
  const [busy, start] = useTransition();
  return (
    <nav className="lp-lang" aria-label={label}>
      {LOCALES.map((l) => (
        <button key={l} type="button" lang={l} aria-current={l === lang ? "true" : undefined} disabled={busy} onClick={() => l !== lang && start(() => setLoginLang(l))}>
          {LANG_NAMES[l]}
        </button>
      ))}
    </nav>
  );
}

/** Google's own «G», as its sign-in buttons show it. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}
