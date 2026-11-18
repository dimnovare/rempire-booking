"use client";

/**
 * The scanner sheet of «Продать». Three ways a code comes in:
 *   - the camera, read by the live shop's own engine (scan-engine.ts: the
 *     right back lens, focus and zoom, the native detector with zxing behind
 *     it, the torch);
 *   - the barber types it into the field under the picture;
 *   - a bluetooth/USB handheld scanner types it (a burst of keys and Enter).
 * The first code goes to onCode() and the sheet closes. The camera is let go
 * the moment the sheet closes, and while the app is in the background.
 *
 * The picture takes a pinch, or a double tap, to zoom — bound natively and
 * not passive, so the page does not pinch with it (the box is
 * `touch-action: none`). A lens without zoom binds nothing and shows nothing.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useB } from "../../lang";
import { ScanEngine, WedgeBuffer, zoomLabel, type ScanState } from "./scan-engine";

const TORCH = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3h8l-1 6H9zM9 9h6v12H9zM12 13v3" />
  </svg>
);

const CLOSE = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const B = useB();
  const sheet = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const manual = useRef<HTMLInputElement>(null);
  const engine = useRef<ScanEngine | null>(null);
  const [st, setSt] = useState<ScanState>({ engine: "", torchOk: false, torchOn: false, error: null });
  const [zoom, setZoom] = useState<string | null>(null);

  // one code, once: the camera, the field and a handheld scanner can race
  const cb = useRef(onCode);
  const sent = useRef(false);
  useEffect(() => {
    cb.current = onCode;
  });
  const send = useRef((code: string) => {
    const c = code.trim();
    if (!c || sent.current) return;
    sent.current = true;
    cb.current(c);
  }).current;

  // the engine, for as long as the sheet is open
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let hide = 0;
    const e = new ScanEngine(v, {
      onCode: send,
      onState: setSt,
      onZoom: (z) => {
        setZoom(zoomLabel(z));
        window.clearTimeout(hide);
        hide = window.setTimeout(() => setZoom(null), 1200);
      },
    });
    engine.current = e;
    e.start();
    const onVisible = () => {
      if (document.hidden) e.pause();
      else if (e.live) e.start();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(hide);
      e.stop();
      engine.current = null;
    };
  }, [send]);

  // pinch and double tap on the picture only
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let from = 0;
    let base = 0;
    let tapAt = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const start = (ev: TouchEvent) => {
      const e = engine.current;
      if (!e?.canZoom) return;
      if (ev.touches.length === 2) {
        from = dist(ev.touches);
        base = e.zoomNow;
        tapAt = 0; // the first finger of a pinch is not half a double tap
        ev.preventDefault();
        return;
      }
      if (ev.touches.length !== 1) return;
      const now = Date.now();
      if (now - tapAt < 400) {
        tapAt = 0;
        e.toggleZoom();
        ev.preventDefault();
        return;
      }
      tapAt = now;
    };
    const move = (ev: TouchEvent) => {
      const e = engine.current;
      if (!e?.canZoom || !from || ev.touches.length !== 2) return;
      ev.preventDefault();
      const r = dist(ev.touches) / from;
      if (Number.isFinite(r) && r > 0) e.setZoom(base * r, true);
    };
    const end = (ev: TouchEvent) => {
      if (ev.touches.length < 2) from = 0;
    };
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);

  // a handheld scanner: keys that no field took, in one burst, then Enter
  useEffect(() => {
    const w = new WedgeBuffer();
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && t !== document.body && t !== document.documentElement && (t.matches?.("input,textarea,select,[contenteditable]") || t.isContentEditable)) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const code = w.key(ev.key, Date.now());
      if (code) {
        ev.preventDefault();
        send(code);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [send]);

  // the phone's keyboard shrinks only the visual viewport: the sheet follows it, so the field stays above the keys
  useEffect(() => {
    const vv = window.visualViewport;
    const el = sheet.current;
    if (!vv || !el) return;
    const fit = () => {
      el.style.height = `${Math.round(vv.height)}px`;
      el.style.top = `${Math.round(vv.offsetTop)}px`;
    };
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, []);

  // no camera: the field is the scanner, and takes the focus (with one, the keyboard would cover the picture)
  useEffect(() => {
    if (st.error) manual.current?.focus();
  }, [st.error]);

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    send(manual.current?.value ?? "");
  };

  const err =
    st.error === "no_camera" ? B.sell.noCamera : st.error === "denied" ? B.sell.cameraDenied : st.error === "decoder" ? B.sell.decoderFailed : null;

  return (
    <div ref={sheet} className="bx-scan" role="dialog" aria-label={B.sell.scanning} data-scanengine={st.engine}>
      <div ref={box} className="bx-scan-box">
        <video ref={video} className="bx-scan-video" muted playsInline autoPlay />
        <div className="bx-scan-frame" aria-hidden="true" />
        {zoom && (
          <span className="bx-scan-zoom" aria-hidden="true">
            {zoom}
          </span>
        )}
        <button type="button" className="bx-scan-close" aria-label={B.close} onClick={onClose}>
          {CLOSE}
        </button>
        {st.torchOk && (
          <button
            type="button"
            className="bx-scan-torch"
            aria-label={B.sell.torch}
            aria-pressed={st.torchOn}
            onClick={() => engine.current?.setTorch(!st.torchOn)}
          >
            {TORCH}
          </button>
        )}
      </div>
      <div className="bx-scan-bar">
        <p className={err ? "is-err" : undefined} role={err ? "alert" : undefined}>
          {err ?? B.sell.scanning}
        </p>
        <form className="bx-scan-manual" onSubmit={submit}>
          <input
            ref={manual}
            inputMode="text"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={B.sell.codePlaceholder}
            aria-label={B.sell.codeLabel}
          />
          <button type="submit" className="adm-btn adm-btn-line adm-btn-sm">
            {B.sell.codeFind}
          </button>
        </form>
      </div>
    </div>
  );
}

/** A photo or a screenshot, made small on the phone (1024 px, JPEG) before it goes anywhere. */
export async function shrinkPhoto(file: File, max = 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("not an image"));
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}
