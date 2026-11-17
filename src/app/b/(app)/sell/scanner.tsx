"use client";

/**
 * The camera reads a product's barcode. The phone's own BarcodeDetector
 * where it has one (Android Chrome); otherwise a small JS reader, loaded
 * only when the camera opens (@zxing/browser, 1D codes only). The camera is
 * let go the moment a code is read or the sheet is closed.
 */
import { useEffect, useRef, useState } from "react";
import { useB } from "../../lang";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const B = useB();
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const done = useRef(false);
  const cb = useRef(onCode);
  useEffect(() => {
    cb.current = onCode;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;
    let timer = 0;
    let gone = false;
    const hit = (code: string) => {
      if (done.current || !code) return;
      done.current = true;
      navigator.vibrate?.(40);
      cb.current(code);
    };
    (async () => {
      try {
        const Native = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        if (Native && video.current) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          if (gone) return;
          video.current.srcObject = stream;
          await video.current.play();
          const det = new Native({ formats: FORMATS });
          const tick = async () => {
            if (gone || done.current || !video.current) return;
            try {
              const found = await det.detect(video.current);
              if (found[0]?.rawValue) return hit(found[0].rawValue);
            } catch {
              /* a frame it could not read */
            }
            timer = window.setTimeout(tick, 180);
          };
          void tick();
          return;
        }
        const { BrowserMultiFormatOneDReader } = await import("@zxing/browser");
        if (gone || !video.current) return;
        const reader = new BrowserMultiFormatOneDReader();
        const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" }, audio: false }, video.current, (result) => {
          if (result) hit(result.getText());
        });
        if (gone) controls.stop();
        else stopZxing = () => controls.stop();
      } catch {
        if (!gone) setErr(B.sell.noCamera);
      }
    })();
    return () => {
      gone = true;
      window.clearTimeout(timer);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [B.sell.noCamera]);

  return (
    <div className="bx-scan" role="dialog" aria-label={B.sell.scanning}>
      <video ref={video} className="bx-scan-video" muted playsInline autoPlay />
      <div className="bx-scan-frame" aria-hidden="true" />
      <div className="bx-scan-bar">
        <p>{err ?? B.sell.scanning}</p>
        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onClose}>
          {B.close}
        </button>
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
