"use client";

/**
 * The install guide (the design board «Установить на телефон», 25.11): the
 * language on top, «iPhone | Android» preselected from the phone itself and
 * only that phone's steps, the buttons to look for drawn under their step,
 * Android's own «Install» when Chrome offers it. An installed app says so
 * and offers to go in.
 *
 * The language works without a login: the page switches at once, and the
 * choice is kept on this device as the login page keeps it
 * (setLoginLang, src/lib/lang-cookie.ts).
 */
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { setLoginLang } from "@/components/login/actions";
import { LOCALES, isLocale, type Locale } from "@/lib/i18n";
import { Ic } from "../(app)/sell/icons";
import { LANG_NAMES } from "../copy";
import { LangProvider, useB, useLang, useTitle } from "../lang";
import { useInstall } from "../use-install";

export function InstallGuide({ logo }: { logo: React.ReactNode }) {
  const [lang, setLang] = useState<Locale>(useLang());
  const [, start] = useTransition();
  return (
    <LangProvider lang={lang}>
      <Guide
        logo={logo}
        lang={lang}
        onLang={(l) => {
          setLang(l);
          start(() => setLoginLang(l));
        }}
      />
    </LangProvider>
  );
}

function Guide({ logo, lang, onLang }: { logo: React.ReactNode; lang: Locale; onLang: (l: Locale) => void }) {
  const B = useB();
  const I = B.install;
  useTitle(I.title);
  const { platform, standalone, prompt, install } = useInstall();
  const [phone, setPhone] = useState<"ios" | "android">("ios");
  useEffect(() => {
    if (platform === "android") setPhone("android");
  }, [platform]);

  const ios = phone === "ios";
  const steps = ios ? I.iphoneSteps : I.androidSteps;
  // what to look for on the phone, drawn under its step
  const tile = (i: number) =>
    ios ? (
      i === 1 ? (
        <span className="bx-tile">
          <span className="is-ios">
            <Ic name="share" size={20} />
          </span>
          {I.share}
        </span>
      ) : i === 2 ? (
        <span className="bx-tile">
          <Ic name="addSquare" size={18} />
          {I.toHome}
        </span>
      ) : null
    ) : i === 1 ? (
      <span className="bx-tile">
        <Ic name="dots" size={18} />
        {I.installApp}
      </span>
    ) : null;

  return (
    <>
      <div className="bx-inst-top">
        {logo}
        <select aria-label={B.more.language} value={lang} onChange={(e) => isLocale(e.target.value) && onLang(e.target.value)}>
          {LOCALES.map((l) => (
            <option key={l} value={l} lang={l}>
              {LANG_NAMES[l]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <h1 className="adm-h1">{I.title}</h1>
        <p className="bx-inst-lead">{I.lead}</p>
      </div>
      {standalone ? (
        <p className="adm-ok">{I.done}</p>
      ) : (
        <>
          <div className="bx-seg" role="group" aria-label={I.phone}>
            <button type="button" aria-pressed={ios} onClick={() => setPhone("ios")}>
              {I.iphone}
            </button>
            <button type="button" aria-pressed={!ios} onClick={() => setPhone("android")}>
              {I.android}
            </button>
          </div>
          <ol className="bx-steps" aria-label={ios ? I.iphone : I.android}>
            {steps.map((s, i) => (
              <li key={`${phone}-${i}`}>
                <span className="bx-step-n" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  {s}
                  {tile(i)}
                </div>
              </li>
            ))}
          </ol>
          {ios && (
            <p className="bx-inst-note">
              <Ic name="bell" size={18} />
              <span>{I.iphoneNote}</span>
            </p>
          )}
          {!ios && prompt && (
            <button type="button" className="adm-btn adm-btn-lime bx-big" onClick={install}>
              {I.installNow}
            </button>
          )}
        </>
      )}
      <Link href="/b" className={`adm-btn bx-big ${!ios && prompt && !standalone ? "adm-btn-line" : "adm-btn-lime"}`} prefetch={false}>
        {I.toApp}
      </Link>
    </>
  );
}
