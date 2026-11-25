"use client";

/**
 * The plaque on screen and on paper (page.tsx; design artifact
 * 53PfD3DxCRkbDyjwLVvBHB). On screen: a card with the size, the link the
 * code holds and «Распечатать», beside the sheet drawn to scale inside an
 * A4 outline. On paper: the sheet alone (plaque.css). Everything on the
 * sheet is sized in parts of its own width (cqw), so A4, A5 and A6 are one
 * drawing at three scales, and the preview is that drawing too.
 */
import Link from "next/link";
import { useState } from "react";
import { PrevIcon, PrintIcon } from "../../icons";
import { Title, useA } from "../../lang";
import { useFrame } from "../frame";

const SIZES = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
} as const;
type Size = keyof typeof SIZES;

/** The sheet's own words: every client reads one of them, whatever the admin's language. */
const BOOK = { ru: "Запишитесь онлайн", more: [{ lang: "et", text: "Broneeri aeg" }, { lang: "en", text: "Book online" }] } as const;
const SCAN = [
  { lang: "ru", text: "Наведите камеру телефона на код" },
  { lang: "et", text: "Suuna telefoni kaamera koodile" },
  { lang: "en", text: "Point your phone camera at the code" },
] as const;

export function PlaqueView({ link, host, size, d, test, title, back }: { link: string; host: string; size: number; d: string; test: boolean; title: string; back: string }) {
  const P = useA().plaque;
  const frame = useFrame();
  const [paper, setPaper] = useState<Size>("A5");
  const { w, h } = SIZES[paper];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      frame.say(P.copied);
    } catch {
      // no clipboard (an old browser, an insecure page): select the address, so a long press copies it
      (document.getElementById("pl-link") as HTMLInputElement | null)?.select();
    }
  };
  return (
    <>
      <Title text={title} />
      {/* the paper the browser prints on: the sheet's own size, no margins, nothing but the sheet */}
      <style>{`@page { size: ${paper}; margin: 0; } @media print { .pl-sheet { width: ${w}mm !important; height: ${h}mm !important; } }`}</style>
      <Link className="pl-back" href="/admin/settings/online" prefetch={false}>
        <PrevIcon size={16} />
        {back}
      </Link>
      <div className="pl-head">
        <h1 className="adm-h1">{P.title}</h1>
        <p className="ac-sub">{P.subtitle}</p>
      </div>
      <div className="pl-grid">
        <section className="pl-bar ac-card">
          <div className="pl-fld">
            <span id="pl-size">{P.size}</span>
            <div className="ac-seg" role="group" aria-labelledby="pl-size">
              {(Object.keys(SIZES) as Size[]).map((s) => (
                <button key={s} type="button" aria-pressed={paper === s} onClick={() => setPaper(s)}>
                  {s}
                </button>
              ))}
            </div>
            <small className="ac-hint">{P.sizeHint[paper]}</small>
          </div>
          <div className="pl-fld">
            <label htmlFor="pl-link">{P.link}</label>
            <div className="pl-link">
              <input id="pl-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="adm-btn adm-btn-line pl-copy" aria-label={P.copy} title={P.copy} onClick={() => void copy()}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="8" y="8" width="12" height="12" rx="2" />
                  <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                </svg>
              </button>
            </div>
            <small className="ac-hint">{test ? P.test : P.linkHint}</small>
          </div>
          <button type="button" className="adm-btn adm-btn-lime pl-print" onClick={() => window.print()}>
            <PrintIcon size={18} />
            {P.print}
          </button>
          <p className="ac-hint">{P.hint}</p>
        </section>
        <div className="pl-stage">
          <div className="pl-a4">
            <span className="pl-a4-n" aria-hidden="true">
              A4
            </span>
            <div className="pl-sheet" style={{ "--w": w, aspectRatio: `${w} / ${h}` } as React.CSSProperties} data-paper={paper}>
              <div className="pl-face">
                {/* eslint-disable-next-line @next/next/no-img-element -- a fixed vector mark, nothing to optimise */}
                <img className="pl-mark" src="/brand/rempire-logo.svg" alt="REMPIRE" />
                <div className="pl-book">
                  <p lang="ru">{BOOK.ru}</p>
                  <p className="pl-more">
                    {BOOK.more.map((m, i) => (
                      <span key={m.lang} lang={m.lang}>
                        {i > 0 && " · "}
                        {m.text}
                      </span>
                    ))}
                  </p>
                </div>
                <svg className="pl-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={link} shapeRendering="crispEdges">
                  <rect width={size} height={size} fill="#fff" />
                  <path d={d} fill="#000" />
                </svg>
                <p className="pl-host">{host}</p>
                <div className="pl-scan">
                  {SCAN.map((f) => (
                    <p key={f.lang} lang={f.lang}>
                      {f.text}
                    </p>
                  ))}
                </div>
              </div>
              {test ? <p className="pl-test">{P.test}</p> : null}
            </div>
          </div>
          <span className="pl-scale">{P.scale(paper)}</span>
        </div>
      </div>
    </>
  );
}
