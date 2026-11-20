"use client";

/**
 * «Бренд»: the salon's name in online booking, its words (RU · ET · EN) and
 * its logo. The name and the words save by themselves (autosave.tsx), as
 * every other form of the admin that edits something that is there; the
 * logo is sent the moment it is picked, as a barber's portrait.
 *
 * The logo is shown here as the booking site shows it: in a dark disc,
 * filling it (src/components/brand.tsx, LogoMark).
 */
import { useRef, useState } from "react";
import { cleanBrand, LOC_MAX, type Text3 } from "@/lib/admin/location-form";
import { useA } from "../../../lang";
import { BinIcon, PencilIcon } from "../../../icons";
import { useAutoSave } from "../../autosave";
import { shrinkPhoto } from "../../photo-shrink";
import { removeLogoAction, saveBrandAction, uploadLogoAction } from "../actions";
import { LangTabs, LocField, LocHead, LocSaveBar, type Lang3 } from "../parts";

type Draft = { name: string; about: Text3 };

export function BrandView({ initial, logo, view }: { initial: Draft; logo: string; view: string }) {
  const A = useA();
  const B = A.loc.brand;
  const [d, setD] = useState<Draft>(initial);
  const [lang, setLang] = useState<Lang3>(A.lang);
  const check = (v: Draft) => {
    const r = cleanBrand(v);
    if (r.ok) return null;
    return r.field === "name" ? B.needName : A.visit.invalid(r.field);
  };
  const auto = useAutoSave<Draft>(d, setD, (v) => saveBrandAction(v), { check, label: A.nav.brand });

  return (
    <div className="loc">
      <LocHead page="brand" view={view} />
      <form
        className="loc-form"
        onBlur={auto.flush}
        onSubmit={(e) => {
          e.preventDefault();
          auto.flush();
        }}
      >
        <section className="adm-card loc-card">
          <LocField id="loc-name" label={B.name} hint={B.nameHint}>
            <input id="loc-name" aria-describedby="loc-name-hint" required maxLength={LOC_MAX.name} autoComplete="organization" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </LocField>
          <div className="adm-field">
            <span id="loc-about-h">{B.about}</span>
            <LangTabs value={lang} onChange={setLang} filled={d.about} label={A.loc.langs} controls="loc-about" />
            <div role="tabpanel" id="loc-about" aria-labelledby={`loc-about-${lang}`}>
              <textarea
                className="loc-about"
                rows={8}
                maxLength={LOC_MAX.about}
                lang={lang}
                aria-label={`${B.about} (${lang.toUpperCase()})`}
                aria-describedby="loc-about-hint"
                value={d.about[lang]}
                onChange={(e) => setD({ ...d, about: { ...d.about, [lang]: e.target.value } })}
              />
            </div>
            <small className="adm-meta" id="loc-about-hint">
              {B.aboutHint}
            </small>
          </div>
        </section>
      </form>
      <LogoCard initial={logo} />
      <LocSaveBar auto={auto} />
    </div>
  );
}

function LogoCard({ initial }: { initial: string }) {
  const A = useA();
  const B = A.loc.brand;
  const [url, setUrl] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const seq = useRef(0);
  const failed = (field?: string) => setNote({ ok: false, text: field === "forbidden" ? A.visit.invalid(field) : B.logoBad });

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same file can be picked again
    if (!file) return;
    const n = ++seq.current;
    setBusy(true);
    setNote(null);
    try {
      // a see-through logo stays see-through; a JPEG one gets the disc's own dark behind it
      const blob = await shrinkPhoto(file, "#1f1f1f", { w: 512, h: 512, alpha: true });
      const form = new FormData();
      form.set("image", blob, "logo");
      const r = await uploadLogoAction(form);
      if (n !== seq.current) return;
      if (r.ok) {
        setUrl(r.url);
        setNote({ ok: true, text: B.logoSaved });
      } else failed(r.field);
    } catch {
      if (n === seq.current) failed();
    } finally {
      if (n === seq.current) setBusy(false);
    }
  };

  const remove = async () => {
    const n = ++seq.current;
    setBusy(true);
    setNote(null);
    try {
      const r = await removeLogoAction();
      if (n !== seq.current) return;
      if (r.ok) {
        setUrl("");
        setNote({ ok: true, text: B.logoRemoved });
      } else failed(r.field);
    } catch {
      if (n === seq.current) setNote({ ok: false, text: A.error });
    } finally {
      if (n === seq.current) setBusy(false);
    }
  };

  return (
    <section className="adm-card loc-card" aria-labelledby="loc-logo-h">
      <h2 className="loc-h" id="loc-logo-h">
        {B.logo}
      </h2>
      <div className="loc-logo">
        {/* a new element per picture (key): the old one is never shown in the new one's place while it loads */}
        <span className={url ? "loc-logo-tile is-own" : "loc-logo-tile"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img key={url} src={url} alt={B.logo} width={120} height={120} /> : <img key="mark" src="/brand/rempire-logo-white.svg" alt="REMPIRE" width={118} height={30} />}
        </span>
        <div className="loc-logo-txt">
          <div className="loc-logo-btns">
            <label className={`adm-btn adm-btn-line adm-btn-sm${busy ? " is-busy" : ""}`}>
              <input type="file" accept="image/*" className="sr" disabled={busy} onChange={pick} />
              <PencilIcon />
              {busy ? B.logoBusy : url ? B.logoChange : B.logoAdd}
            </label>
            {url && !busy && (
              <button type="button" className="adm-btn adm-btn-line adm-btn-sm" onClick={remove}>
                <BinIcon />
                {B.logoRemove}
              </button>
            )}
          </div>
          {note ? (
            <p className={note.ok ? "adm-ok" : "adm-err"} role={note.ok ? "status" : "alert"}>
              {note.text}
            </p>
          ) : (
            <small className="adm-meta">{url ? B.logoHint : `${B.logoNone} ${B.logoHint}`}</small>
          )}
        </div>
      </div>
    </section>
  );
}
