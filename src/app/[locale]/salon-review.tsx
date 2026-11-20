"use client";

/**
 * «Оцените и напишите отзыв» on the salon's page (Dim, 20.11.2026, decision
 * page round 11; the boards Review-Card and Review-Sheet), as the widget
 * REMPIRE's clients know has it: a card with five empty stars; a tap on a
 * star opens the sheet with that many lit.
 *
 * The sheet: the stars and their word, about whom (the salon or a barber),
 * the name, the text, «Отправить», and a line that the salon checks it
 * first. Sent, it says thank you. POST /api/salon/reviews keeps the review
 * waiting until Renat approves it in «Отзывы» (src/lib/reviews.ts,
 * submitReview): never shown before that.
 *
 * Against bots, no captcha: a field no person sees (a bot fills it in), the
 * time the sheet was open, and the server's limits per address and per day.
 * No phone and no e-mail are asked.
 */
import { useEffect, useRef, useState } from "react";
import { CheckIcon, CrossIcon } from "@/components/brand";
import type { Copy } from "@/lib/i18n";
import "./salon-review.css";

/** The limits the server holds too (src/lib/reviews.ts, REVIEW_MAX). */
const MAX_NAME = 60;
const MAX_TEXT = 1000;
const STAR_PATH = "M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z";

/** One of the big stars: outlined, or filled when lit. */
const BigStar = ({ on, size }: { on: boolean; size: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={on ? "var(--star)" : "none"} stroke="var(--star)" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
    <path d={STAR_PATH} />
  </svg>
);

/** The card under «Отзывы»: five empty stars, each opening the sheet with that many. Sent: a thank-you instead. */
export function ReviewCard({ c, sent, onRate }: { c: Copy; sent: boolean; onRate: (stars: number) => void }) {
  return (
    <section className="rvc" aria-labelledby="rvc-h">
      <h3 id="rvc-h">{c.salon.rate}</h3>
      {sent ? (
        <p className="rvc-sent" role="status">
          <CheckIcon size={18} />
          {c.salon.sent}
        </p>
      ) : (
        <>
          <div className="rvc-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={c.salon.rateN(n)} onClick={() => onRate(n)}>
                <BigStar on={false} size={38} />
              </button>
            ))}
          </div>
          <p className="rvc-sub">{c.salon.rateSub}</p>
        </>
      )}
    </section>
  );
}

type Errors = Partial<Record<"rating" | "name" | "text" | "form", string>>;

/**
 * The sheet. `stars` is the star tapped on the card; `name` the name this
 * device booked with, if any. `onSent` tells the page, so its card thanks
 * too; `onClose` is the cross, the scrim, Escape and «Готово».
 */
export function ReviewSheet({
  c,
  stars,
  name: knownName,
  staff,
  onSent,
  onClose,
}: {
  c: Copy;
  stars: number;
  name: string;
  staff: { id: string; name: string }[];
  onSent: () => void;
  onClose: () => void;
}) {
  const s = c.salon;
  const [rating, setRating] = useState(stars);
  const [whom, setWhom] = useState("salon");
  const [name, setName] = useState(knownName);
  const [text, setText] = useState("");
  const [trap, setTrap] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [opened] = useState(() => Date.now());
  const starRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // the page under it stays put; Escape closes this sheet only, not the salon's page under it; the focus goes back where it was
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = was;
      window.removeEventListener("keydown", onKey, true);
      back?.focus({ preventScroll: true });
    };
  }, [onClose]);

  // the stars as one radio group: the arrows move the choice, as a radio group's do
  const onStarKey = (e: React.KeyboardEvent, n: number) => {
    const to = e.key === "ArrowRight" || e.key === "ArrowUp" ? Math.min(5, n + 1) : e.key === "ArrowLeft" || e.key === "ArrowDown" ? Math.max(1, n - 1) : 0;
    if (!to) return;
    e.preventDefault();
    setRating(to);
    starRefs.current[to - 1]?.focus();
  };

  const send = async () => {
    const errs: Errors = {};
    if (!rating) errs.rating = s.errRating;
    if (!name.trim()) errs.name = s.errName;
    if ([...text].length > MAX_TEXT) errs.text = s.errText(MAX_TEXT);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const r = await fetch("/api/salon/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ rating, staffId: whom === "salon" ? "" : whom, name, text, website: trap, ms: Date.now() - opened }),
      });
      if (r.status === 201) {
        setDone(true);
        onSent();
        return;
      }
      if (r.status === 429) return setErrors({ form: s.errMany });
      const j = r.status === 422 ? ((await r.json().catch(() => null)) as { field?: string } | null) : null;
      const f = j?.field;
      if (f === "rating") setErrors({ rating: s.errRating });
      else if (f === "name") setErrors({ name: s.errName });
      else if (f === "text") setErrors({ text: s.errText(MAX_TEXT) });
      else if (f === "link") setErrors({ text: s.errLink });
      else setErrors({ form: s.errSend });
    } catch {
      setErrors({ form: s.errSend });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-wrap">
      <button type="button" className="sheet-scrim" aria-label={c.close} tabIndex={-1} onClick={onClose} />
      <div className="sheet rvf" role="dialog" aria-modal="true" aria-labelledby="rvf-h">
        <button type="button" className="sheet-x" aria-label={c.close} autoFocus onClick={onClose}>
          <span>
            <CrossIcon size={16} />
          </span>
        </button>
        {done ? (
          <div className="rvf-done" role="status">
            <span className="rvf-tick">
              <CheckIcon size={28} width={2.6} />
            </span>
            <h2 className="t2" id="rvf-h">
              {s.thanks}
            </h2>
            <p>{s.thanksSub}</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {s.done}
            </button>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void send();
            }}
          >
            <h2 className="t2" id="rvf-h">
              {s.yours}
            </h2>
            <div className="rvf-rate">
              <div className="rvf-stars" role="radiogroup" aria-label={s.stars} aria-describedby={errors.rating ? "rvf-rating-err" : undefined}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    ref={(el) => void (starRefs.current[n - 1] = el)}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={c.rated(String(n))}
                    tabIndex={rating ? (rating === n ? 0 : -1) : n === 1 ? 0 : -1}
                    onClick={() => {
                      setRating(n);
                      setErrors((x) => ({ ...x, rating: undefined }));
                    }}
                    onKeyDown={(e) => onStarKey(e, n)}
                  >
                    <BigStar on={n <= rating} size={40} />
                  </button>
                ))}
              </div>
              {rating > 0 && <span className="rvf-word">{s.words[rating - 1]}</span>}
            </div>
            {errors.rating && (
              <p className="alert" id="rvf-rating-err">
                {errors.rating}
              </p>
            )}

            {staff.length > 0 && (
              <>
                <p className="flabel rvf-label" id="rvf-whom">
                  {s.whom}
                </p>
                <div className="rvf-chips" role="radiogroup" aria-labelledby="rvf-whom">
                  {[{ id: "salon", name: s.whomSalon }, ...staff].map((o) => (
                    <button key={o.id} type="button" role="radio" aria-checked={whom === o.id} onClick={() => setWhom(o.id)}>
                      {o.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className={`field rvf-field${errors.name ? " err" : ""}`}>
              <label className="flabel" htmlFor="rvf-name">
                {s.name}
              </label>
              <input
                className="input"
                id="rvf-name"
                name="name"
                autoComplete="given-name"
                maxLength={MAX_NAME}
                value={name}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "rvf-name-err" : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((x) => ({ ...x, name: undefined }));
                }}
              />
              {errors.name && (
                <p className="alert" id="rvf-name-err">
                  {errors.name}
                </p>
              )}
            </div>
            <div className={`field rvf-field rvf-text${errors.text ? " err" : ""}`}>
              <label className="flabel" htmlFor="rvf-text">
                {s.text}
              </label>
              <textarea
                className="input"
                id="rvf-text"
                name="text"
                rows={4}
                maxLength={MAX_TEXT}
                value={text}
                aria-invalid={errors.text ? true : undefined}
                aria-describedby={errors.text ? "rvf-text-err" : undefined}
                onChange={(e) => {
                  setText(e.target.value);
                  setErrors((x) => ({ ...x, text: undefined }));
                }}
              />
              {errors.text && (
                <p className="alert" id="rvf-text-err">
                  {errors.text}
                </p>
              )}
            </div>
            {/* no person sees this field or reaches it with Tab; a bot that fills every field fills it too */}
            <div className="rvf-trap" aria-hidden="true">
              <label>
                Website
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
              </label>
            </div>
            {errors.form && (
              <p className="alert rvf-form-err" role="alert">
                {errors.form}
              </p>
            )}
            <button type="submit" className="btn btn-primary rvf-send" disabled={busy}>
              {busy ? s.sending : s.send}
            </button>
            <p className="rvf-note">{s.afterCheck}</p>
          </form>
        )}
      </div>
    </div>
  );
}
