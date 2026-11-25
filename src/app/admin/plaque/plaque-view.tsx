"use client";

/**
 * The plaque on screen and on paper (page.tsx). The bar above the sheet
 * (size, print) never prints. Everything on the sheet is sized in parts of
 * its own width (cqw), so A4, A5 and A6 are one drawing at three scales,
 * and the preview is that drawing too.
 */
import { useState } from "react";
import { Title, useA } from "../lang";

const SIZES = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
} as const;
type Size = keyof typeof SIZES;

/** The sheet's own words: every client reads one of them, whatever the admin's language. */
const FACE = [
  {
    lang: "ru",
    book: "Запишитесь онлайн",
    scan: "Наведите камеру телефона на код",
  },
  { lang: "et", book: "Broneeri aeg", scan: "Suuna telefoni kaamera koodile" },
  {
    lang: "en",
    book: "Book online",
    scan: "Point your phone camera at the code",
  },
] as const;

export function PlaqueView({
  link,
  host,
  size,
  d,
  test,
  title,
}: {
  link: string;
  host: string;
  size: number;
  d: string;
  test: boolean;
  title: string;
}) {
  const P = useA().plaque;
  const [paper, setPaper] = useState<Size>("A5");
  const { w, h } = SIZES[paper];
  return (
    <main className="pl">
      <Title text={title} />
      {/* the paper the browser prints on: the sheet's own size, no margins, nothing but the sheet */}
      <style>{`@page { size: ${paper}; margin: 0; } @media print { .pl-sheet { width: ${w}mm !important; height: ${h}mm !important; } }`}</style>
      <div className="pl-bar">
        <h1 className="adm-h1">{P.title}</h1>
        <div className="pl-tools">
          <div className="adm-seg" role="group" aria-label={P.size}>
            {(Object.keys(SIZES) as Size[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={paper === s}
                onClick={() => setPaper(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="adm-btn adm-btn-sm pl-print"
            onClick={() => window.print()}
          >
            {P.print}
          </button>
        </div>
        <p className="adm-meta">{P.hint}</p>
      </div>
      <div
        className="pl-sheet"
        style={{ aspectRatio: `${w} / ${h}` }}
        data-paper={paper}
      >
        <div className="pl-face">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed vector mark, nothing to optimise */}
          <img
            className="pl-mark"
            src="/brand/rempire-logo.svg"
            alt="REMPIRE"
          />
          <div className="pl-book">
            {FACE.map((f) => (
              <p key={f.lang} lang={f.lang}>
                {f.book}
              </p>
            ))}
          </div>
          <svg
            className="pl-qr"
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={link}
            shapeRendering="crispEdges"
          >
            <rect width={size} height={size} fill="#fff" />
            <path d={d} fill="#000" />
          </svg>
          <p className="pl-host">{host}</p>
          <div className="pl-scan">
            {FACE.map((f) => (
              <p key={f.lang} lang={f.lang}>
                {f.scan}
              </p>
            ))}
          </div>
        </div>
        {test ? <p className="pl-test">{P.test}</p> : null}
      </div>
    </main>
  );
}
