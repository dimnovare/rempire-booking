/**
 * The camera engine of the barber app's scanner (Dim, 18.11: «the barcode
 * scanner exists already in rempire-shop, so basically the same can be used»).
 *
 * A port of the live shop's own engine — rempire-web, public/shop2/app.js,
 * «the camera engine», as it stands after its two audits on the owner's
 * Samsung (docs/audit/2026-09-06-scanner.md and 2026-09-07-scanner.md in
 * that repo: «scanning was hard and almost impossible» → «a good scanner
 * which works from first time»). The numbers are the shop's, measured there
 * with tools/scan-bench.mjs over 16 896 decodes; the order of decisions is
 * the shop's. Only the shell around it is React (scanner.tsx).
 *
 * One camera stream, two decoders on top of it:
 *   - the browser's own BarcodeDetector where it exists (Chrome on Android —
 *     whose detection lives in Google Play Services, and on a phone without
 *     that module answers nothing, or throws);
 *   - zxing (@zxing/browser), loaded from the first second, so the hand-over
 *     costs no wait. iPhones have no BarcodeDetector at all: zxing IS their
 *     scanner.
 *
 *   start()
 *    ├─ zxing import starts at once (a failed one is retried on the next open)
 *    ├─ BarcodeDetector.getSupportedFormats()   ← empty = skip the native path
 *    ├─ openCamera() → remembered lens, else facingMode:environment → pickLens()
 *    │     enumerateDevices → back lenses → drop wide/ultra/tele/macro → lowest
 *    │     camera2 number → hand the stream over (never two at once) → remember
 *    ├─ tune(): focusMode:continuous, zoom where the pinch was left (1.5× the
 *    │     first time), torch re-read at 0 / 0.5 / 1.5 s (Samsung reports it late)
 *    └─ native loop ── throws three times, or six mute seconds ──▶ zxing loop
 *          every 60 ms: the band under the line straight, turned 13°, straight,
 *          turned −13°, and the whole frame every ninth pass; dark and nothing
 *          read → the torch once; two quiet seconds → zxing's TRY_HARDER joins
 *          in. A self-checking code counts on one frame, others on two.
 *
 * Booking reads only: the first code that counts goes to onCode() and the
 * engine stops listening (the sheet closes and looks the code up in the shop).
 */

/* ---------- the numbers (the shop's, unchanged) ---------- */

export const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];
/** A native detector silent this long hands over to zxing. */
export const FALLBACK_MS = 6000;
/** The floor under one decode pass, not a wait: ~10 ms a plain pass, ~90 ms a TRY_HARDER one. */
export const TICK_MS = 60;
/** zxing walks horizontal rows: a bottle held at 25° reads at 0 %, the band turned back 13° at 33 %. */
export const TILTS = [0, 13, 0, -13];
/** The whole frame every ninth pass — insurance for a code outside the band; 9 is coprime with the 4 tilts. */
export const FULL_EVERY = 9;
/** Formats with their own check digit: one frame is proof enough (99 % inside a second, against 46 % for two). */
const SELF_CHECKED = /^(ean_13|ean_8|upc_a|upc_e|code_128|qr_code)$/;
/** Mean luma under which reading collapses (a dark room is a noisy picture, not a dim one). */
export const DARK_LUMA = 80;
const LUMA_EVERY = 8;
/** Nothing read for this long: zxing's thorough reader joins in, every other pass. */
const HARD_AFTER_MS = 2200;
const ZOOM_KEY = "rempire.scan.zoom";
export const ZOOM_START = 1.5;
const LENS_KEY = "rempire.scan.camera";
const BAD_LENS = /wide|ultra|tele|macro|depth|bokeh|zoom/i;
const BACK_LENS = /back|rear|environment|задн|tagumi/i;
/** A handheld scanner types a code in one burst; a gap longer than this is a person. */
const WEDGE_GAP_MS = 400;

/* ---------- the pure decisions (tests/scan-engine.test.ts) ---------- */

/**
 * Where a lens stands in Android's own numbering. Chrome labels them
 * «camera2 0, facing back», «camera2 2, facing back» …: no «wide» in the
 * words, but Camera2 numbers the primary rear camera 0 and the ultra-wide,
 * tele and macro ones after it. An unnumbered label sorts last.
 */
export function lensRank(label: string): number {
  const m = String(label ?? "").match(/camera2?\s+(\d+)/i);
  return m ? Number(m[1]) : 50;
}

type Device = { kind: string; deviceId: string; label: string };

/**
 * The back lens to read codes with, or null when facingMode's answer is the
 * only one there is (one back lens, or a browser that keeps the labels to
 * itself). `facingMode: environment` on a Samsung with three back lenses is
 * often the wide one — low-res and soft at the 10–20 cm where a code on a
 * 100 ml bottle is read: the shop audit's biggest single cause.
 */
export function pickLens(devices: readonly Device[]): string | null {
  const backs = devices.filter((d) => d.kind === "videoinput" && BACK_LENS.test(d.label || ""));
  if (backs.length < 2) return null;
  let good = backs.filter((d) => !BAD_LENS.test(d.label || ""));
  if (!good.length) good = backs;
  let best = good[0];
  for (const d of good.slice(1)) if (lensRank(d.label) < lensRank(best.label)) best = d;
  return best.deviceId || null;
}

/** Which view of the frame pass `tick` looks at — the same sequence for both decoders. */
export function viewFor(tick: number): { full: true } | { full: false; tilt: number } {
  if (tick % FULL_EVERY === FULL_EVERY - 1) return { full: true };
  return { full: false, tilt: TILTS[tick % TILTS.length] };
}

export function selfChecked(format: string): boolean {
  return SELF_CHECKED.test(String(format ?? "").toLowerCase());
}

/**
 * When a camera read counts. A self-checking code (EAN, UPC, CODE_128, QR)
 * on the first frame — the decoder has already refused one whose check digit
 * does not add up. Anything else on two agreeing frames inside a second.
 */
export class ReadGate {
  private code = "";
  private n = 0;
  private at = 0;

  read(raw: string, format: string, now: number): string | null {
    const code = String(raw ?? "").trim();
    if (!code) return null;
    if (selfChecked(format)) {
      this.code = "";
      this.n = 0;
      return code;
    }
    if (this.code === code && now - this.at < 1000) this.n++;
    else {
      this.code = code;
      this.n = 1;
    }
    this.at = now;
    if (this.n < 2) return null;
    this.code = "";
    this.n = 0;
    return code;
  }
}

/**
 * A bluetooth/USB scanner is a keyboard: characters in a burst, then Enter.
 * Fed every keydown that no input field took; answers the code on Enter.
 */
export class WedgeBuffer {
  private buf = "";
  private at = 0;

  key(key: string, now: number): string | null {
    if (now - this.at > WEDGE_GAP_MS) this.buf = "";
    this.at = now;
    if (key === "Enter") {
      const code = this.buf.trim();
      this.buf = "";
      return code.length >= 4 ? code : null;
    }
    if (key.length === 1 && this.buf.length < 64) this.buf += key;
    return null;
  }
}

export type ZoomCaps = { min: number; max: number };

export function zoomClamp(z: number, caps: ZoomCaps): number {
  return Math.min(caps.max, Math.max(caps.min, z));
}

/** «2,4×» — a number, so no dictionary key. */
export function zoomLabel(z: number): string {
  return (Math.round(z * 10) / 10).toFixed(1).replace(".", ",") + "×";
}

/* ---------- the engine (browser only) ---------- */

export type ScanError = "no_camera" | "denied" | "decoder";

export type ScanState = {
  engine: "native" | "zxing" | "";
  torchOk: boolean;
  torchOn: boolean;
  error: ScanError | null;
};

type Hooks = {
  onCode: (code: string) => void;
  onState: (s: ScanState) => void;
  /** The pinch or double tap moved the lens: show the readout for a moment. */
  onZoom?: (z: number) => void;
};

type Detected = { rawValue: string; format: string };
type Detector = { detect: (src: CanvasImageSource) => Promise<Detected[]> };
type DetectorCtor = (new (o: { formats: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> };
type ZxingReader = { decodeFromCanvas: (c: HTMLCanvasElement) => { getText(): string; getBarcodeFormat(): number } };
type Zxing = { Reader: new (hints: Map<number, unknown>) => ZxingReader; formats: number[]; formatName: (n: number) => string; POSSIBLE_FORMATS: number; TRY_HARDER: number };

const noop = () => {};
const store = {
  get(k: string): string {
    try {
      return localStorage.getItem(k) ?? "";
    } catch {
      return "";
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private window */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* private window */
    }
  },
};

/** zxing, loaded once per page; a failed load (no signal) is forgotten so the next open tries again. */
let zxingLoad: Promise<Zxing> | null = null;
function loadZxing(): Promise<Zxing> {
  if (!zxingLoad) {
    zxingLoad = Promise.all([import("@zxing/browser"), import("@zxing/library")]).then(([b, l]) => {
      const F = l.BarcodeFormat;
      // no ITF here: zxing's ITF reader reads a code into a striped label; the native detector validates its own
      return {
        Reader: b.BrowserMultiFormatReader as unknown as Zxing["Reader"],
        formats: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE],
        formatName: (n: number) => String(F[n] ?? "").toLowerCase(),
        POSSIBLE_FORMATS: l.DecodeHintType.POSSIBLE_FORMATS,
        TRY_HARDER: l.DecodeHintType.TRY_HARDER,
      };
    });
    zxingLoad.catch(() => {
      zxingLoad = null;
    });
  }
  return zxingLoad;
}

function stopTracks(s: MediaStream | null) {
  try {
    s?.getTracks().forEach((t) => t.stop());
  } catch {
    /* already gone */
  }
}

type Caps = MediaTrackCapabilities & { torch?: boolean; zoom?: { min?: number; max?: number }; focusMode?: string[] };
type Advanced = MediaTrackConstraintSet & { torch?: boolean; zoom?: number; focusMode?: string };

function apply(track: MediaStreamTrack | null, c: Advanced) {
  try {
    track?.applyConstraints({ advanced: [c] }).catch(noop);
  } catch {
    /* the lens refused */
  }
}

/** One short beep and a buzz: the code was read. */
function beep() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
      osc.onended = () => void ctx.close();
    }
  } catch {
    /* no sound */
  }
  try {
    navigator.vibrate?.(60);
  } catch {
    /* no buzz */
  }
}

export class ScanEngine {
  private stream: MediaStream | null = null;
  private timer = 0;
  private alive = true;
  private done = false;
  private gate = new ReadGate();
  private crop: HTMLCanvasElement | null = null;
  private full: HTMLCanvasElement | null = null;
  private luma: HTMLCanvasElement | null = null;
  private everRead = false;
  private autoTorched = false;
  private zxingFailed = false;
  private zoomCaps: ZoomCaps | null = null;
  private zoom = 0;
  private torchTimers: number[] = [];
  private state: ScanState = { engine: "", torchOk: false, torchOn: false, error: null };

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly hooks: Hooks,
  ) {}

  private set(patch: Partial<ScanState>) {
    this.state = { ...this.state, ...patch };
    if (this.alive) this.hooks.onState(this.state);
  }

  private track(): MediaStreamTrack | null {
    return this.stream?.getVideoTracks()[0] ?? null;
  }

  /** The camera is up, or on its way: a manual field must not raise the keyboard over it. */
  get live(): boolean {
    return !this.state.error;
  }

  start() {
    if (!this.alive || this.stream) return;
    const camera = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    if (!camera) return this.set({ error: "no_camera" });
    this.set({ error: null });
    // zxing from the first second: a mute native detector hands over with nothing to wait for
    if (this.zxingFailed) this.zxingFailed = false;
    loadZxing().catch(noop);
    const Native = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    // Chrome answers an empty list on a phone whose Play Services lack the barcode module
    const formatsP: Promise<string[]> = Native
      ? Native.getSupportedFormats
        ? Native.getSupportedFormats().catch(() => [])
        : Promise.resolve(NATIVE_FORMATS)
      : Promise.resolve([]);
    Promise.all([this.openCamera(), formatsP]).then(
      ([stream, supported]) => {
        if (!this.alive || this.stream) return stopTracks(stream);
        this.stream = stream;
        this.video.srcObject = stream;
        this.video.play().catch(noop);
        const track = this.track();
        this.tune(track);
        track?.addEventListener("ended", this.onEnded);
        const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
        if (Native && formats.length) this.nativeLoop(Native, formats);
        else this.nativeGaveUp(Native ? "error" : "absent");
      },
      (err: unknown) => {
        if (!this.alive) return;
        console.warn("[scanner] camera:", (err as { name?: string })?.name ?? "error");
        this.set({ error: "denied" });
      },
    );
  }

  /** Lets go of the camera; start() takes it again (the tab came back). */
  pause() {
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.torchTimers.forEach((t) => window.clearTimeout(t));
    this.torchTimers = [];
    this.track()?.removeEventListener("ended", this.onEnded);
    stopTracks(this.stream);
    this.stream = null;
    this.zoomCaps = null;
    this.set({ engine: "", torchOk: false, torchOn: false });
  }

  stop() {
    this.pause();
    this.alive = false;
  }

  /** The stream died under us (screen lock, another app took the camera): open it again. */
  private onEnded = () => {
    if (!this.alive || document.hidden) return;
    this.pause();
    window.setTimeout(() => {
      if (this.alive && !this.stream && !document.hidden) this.start();
    }, 800);
  };

  private gum(video: MediaTrackConstraints) {
    return navigator.mediaDevices.getUserMedia({ video, audio: false });
  }

  private openCamera(): Promise<MediaStream> {
    const want: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    const fresh = () => this.gum({ facingMode: { ideal: "environment" }, ...want }).then((s) => this.chooseLens(s, want));
    const saved = store.get(LENS_KEY);
    if (!saved) return fresh();
    return this.gum({ deviceId: { exact: saved }, ...want }).catch(() => {
      // the remembered lens is gone (site data cleared, another phone): choose again
      store.del(LENS_KEY);
      return fresh();
    });
  }

  private async chooseLens(stream: MediaStream, want: MediaTrackConstraints): Promise<MediaStream> {
    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings?.() ?? {};
    const curId = settings.deviceId ?? "";
    const curW = Number(settings.width) || 0;
    if (!navigator.mediaDevices.enumerateDevices) return stream;
    const devs = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    let best: string | null = null;
    try {
      best = pickLens(devs);
    } catch {
      best = null;
    }
    if (!best || best === curId) {
      if (curId) store.set(LENS_KEY, curId);
      return stream;
    }
    // handed over, never doubled: many Android phones refuse a second live stream
    stopTracks(stream);
    const byFacing = () => this.gum({ facingMode: { ideal: "environment" }, ...want });
    try {
      const s2 = await this.gum({ deviceId: { exact: best }, ...want });
      const w2 = Number(s2.getVideoTracks()[0]?.getSettings?.().width) || 0;
      // it turned out to be the soft low-res one after all
      if (curW >= 1280 && w2 && w2 < 1280) {
        stopTracks(s2);
        return byFacing();
      }
      store.set(LENS_KEY, best);
      return s2;
    } catch {
      return byFacing();
    }
  }

  /** Continuous focus, the zoom where the pinch was left, and the torch re-read as the stream settles. */
  private tune(track: MediaStreamTrack | null) {
    if (!track?.getCapabilities) return;
    let caps: Caps = {};
    try {
      caps = (track.getCapabilities() ?? {}) as Caps;
    } catch {
      /* none */
    }
    if (caps.focusMode?.includes?.("continuous")) apply(track, { focusMode: "continuous" });
    this.zoomCaps = caps.zoom && typeof caps.zoom.max === "number" && caps.zoom.max > 1 ? { min: Number(caps.zoom.min) || 1, max: Number(caps.zoom.max) } : null;
    if (this.zoomCaps) this.setZoom(Number(store.get(ZOOM_KEY)) || ZOOM_START, false);
    this.checkTorch(track);
    this.torchTimers = [500, 1500].map((ms) => window.setTimeout(() => this.checkTorch(track), ms));
  }

  private checkTorch(track: MediaStreamTrack) {
    if (!this.alive || this.track() !== track) return;
    let caps: Caps = {};
    try {
      caps = (track.getCapabilities?.() ?? {}) as Caps;
    } catch {
      /* none */
    }
    const ok = !!caps.torch;
    if (ok !== this.state.torchOk) this.set({ torchOk: ok });
  }

  setTorch(on: boolean) {
    apply(this.track(), { torch: on });
    this.set({ torchOn: on });
  }

  /* ---- zoom: a pinch on the picture, or a double tap ---- */

  get canZoom(): boolean {
    return !!this.zoomCaps;
  }

  get zoomNow(): number {
    return this.zoom || (this.zoomCaps ? zoomClamp(ZOOM_START, this.zoomCaps) : 1);
  }

  setZoom(z: number, byHand: boolean) {
    const caps = this.zoomCaps;
    if (!caps) return;
    const next = zoomClamp(z, caps);
    // a pinch fires a touchmove per frame; a hundredth of the range is the smallest step worth a driver round trip
    if (this.zoom && Math.abs(next - this.zoom) < (caps.max - caps.min) / 100) return;
    this.zoom = next;
    apply(this.track(), { zoom: next });
    if (byHand) {
      store.set(ZOOM_KEY, String(Math.round(next * 100) / 100));
      this.hooks.onZoom?.(next);
    }
  }

  /** Double tap: out to the far end of what the lens does, and back to where the pinch had it. */
  toggleZoom() {
    const caps = this.zoomCaps;
    if (!caps) return;
    const far = zoomClamp(Math.max(ZOOM_START * 2, caps.max * 0.6), caps);
    this.setZoom((this.zoom || 1) >= far - 0.01 ? ZOOM_START : far, true);
  }

  /* ---- the frames ---- */

  /**
   * The band under the scan line, cut out of the centre square the viewfinder
   * shows (object-fit: cover), at the sensor's own resolution and optionally
   * turned back a few degrees. 0.92 × 0.60 of the short side, drawn at 1×:
   * measured to read as well per frame as the old 0.76 × 0.44 at 2×, at a
   * third of the cost, and to forgive a code that is not centred.
   */
  private cropCanvas(tilt: number): HTMLCanvasElement | null {
    const v = this.video;
    if (!v.videoWidth || !v.videoHeight) return null;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const cw = Math.round(side * 0.92);
    const ch = Math.round(side * 0.6);
    const sx = Math.round((v.videoWidth - cw) / 2);
    const sy = Math.round((v.videoHeight - ch) / 2);
    const c = (this.crop ??= document.createElement("canvas"));
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    if (!tilt) {
      ctx.drawImage(v, sx, sy, cw, ch, 0, 0, cw, ch);
      return c;
    }
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((-tilt * Math.PI) / 180);
    ctx.drawImage(v, sx, sy, cw, ch, -cw / 2, -ch / 2, cw, ch);
    ctx.restore();
    return c;
  }

  private fullCanvas(): HTMLCanvasElement | null {
    const v = this.video;
    if (!v.videoWidth || !v.videoHeight) return null;
    const k = v.videoWidth > 1280 ? 1280 / v.videoWidth : 1;
    const w = Math.round(v.videoWidth * k);
    const h = Math.round(v.videoHeight * k);
    const c = (this.full ??= document.createElement("canvas"));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    c.getContext("2d", { willReadFrequently: true })?.drawImage(v, 0, 0, w, h);
    return c;
  }

  private view(tick: number): HTMLCanvasElement | null {
    const v = viewFor(tick);
    return v.full ? this.fullCanvas() : this.cropCanvas(v.tilt);
  }

  /** How light it is in front of the lens, 0–255, off a 32-px thumbnail. */
  private frameLuma(src: HTMLCanvasElement): number {
    try {
      const t = (this.luma ??= document.createElement("canvas"));
      if (t.width !== 32) {
        t.width = 32;
        t.height = 32;
      }
      const tc = t.getContext("2d", { willReadFrequently: true });
      if (!tc) return 255;
      tc.drawImage(src, 0, 0, 32, 32);
      const d = tc.getImageData(0, 0, 32, 32).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      return sum / (d.length / 4);
    } catch {
      return 255;
    }
  }

  /** Dark and nothing read yet: the torch comes on by itself, once. The barber's own tap stays the last word. */
  private autoTorch(src: HTMLCanvasElement) {
    if (!this.state.torchOk || this.state.torchOn || this.autoTorched || this.everRead) return;
    if (this.frameLuma(src) >= DARK_LUMA) return;
    this.autoTorched = true;
    this.setTorch(true);
  }

  private read(raw: string, format: string) {
    if (this.done || !this.alive) return;
    this.everRead = true;
    const code = this.gate.read(raw, format, Date.now());
    if (!code) return;
    this.done = true;
    beep();
    this.hooks.onCode(code);
  }

  /* ---- the two loops ---- */

  private running(engine: ScanState["engine"]): boolean {
    return this.alive && !this.done && this.state.engine === engine && !!this.stream;
  }

  private nativeLoop(Native: DetectorCtor, formats: string[]) {
    let detector: Detector;
    try {
      detector = new Native({ formats });
    } catch {
      return this.nativeGaveUp("error");
    }
    this.set({ engine: "native" });
    let since = 0;
    let hit = false;
    let errs = 0;
    let tick = 0;
    const loop = () => {
      if (!this.running("native")) return;
      const t0 = Date.now();
      // no frame yet: its six seconds count from the first frame it got to look at
      if (this.video.readyState < 2) {
        this.timer = window.setTimeout(loop, TICK_MS);
        return;
      }
      if (!since) since = t0;
      const n = tick++;
      const src = this.view(n);
      if (src && n % LUMA_EVERY === 0) this.autoTorch(src);
      detector
        .detect(src ?? this.video)
        .then(
          (codes) => {
            errs = 0;
            if (codes?.length) {
              hit = true;
              this.read(codes[0].rawValue, codes[0].format);
            }
          },
          (err: { name?: string }) => {
            // «Barcode detection service unavailable» is final; anything else gets three chances
            errs += err?.name === "NotSupportedError" ? 3 : 1;
          },
        )
        .then(() => {
          if (!this.running("native")) return;
          if (errs >= 3) return this.nativeGaveUp("error");
          if (!hit && !this.zxingFailed && Date.now() - since > FALLBACK_MS) return this.nativeGaveUp("silent");
          this.timer = window.setTimeout(loop, Math.max(0, TICK_MS - (Date.now() - t0)));
        });
    };
    loop();
  }

  /**
   * The native detector is mute, broken or not there: zxing takes the same
   * stream. Not the barber's business — it goes to the console and to
   * `data-scanfallback` on the sheet (scanner.tsx), not on screen.
   */
  private nativeGaveUp(reason: "absent" | "error" | "silent") {
    window.clearTimeout(this.timer);
    this.set({ engine: "" });
    this.zxingLoop().then(
      () => {
        if (reason !== "absent" && this.alive) {
          this.video.closest<HTMLElement>("[data-scanengine]")?.setAttribute("data-scanfallback", reason);
          console.info(`[scan] the browser's own barcode detector gave up (${reason}); decoding with zxing instead`);
        }
      },
      () => {
        this.zxingFailed = true;
        if (!this.alive || !this.stream) return;
        // a merely mute detector may still come good; one that threw, or is not there, leaves nothing to run
        const Native = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        if (reason === "silent" && Native) return this.nativeLoop(Native, NATIVE_FORMATS);
        this.set({ error: "decoder" });
      },
    );
  }

  private async zxingLoop() {
    const Z = await loadZxing();
    if (!this.alive || !this.stream) return;
    const hints = new Map<number, unknown>([[Z.POSSIBLE_FORMATS, Z.formats]]);
    const reader = new Z.Reader(hints);
    // TRY_HARDER reads ~9 points more of a frame at 8–10× the cost: kept for a barber clearly struggling
    const readerHard = new Z.Reader(new Map<number, unknown>([...hints, [Z.TRY_HARDER, true]]));
    this.set({ engine: "zxing" });
    let tick = 0;
    let quietSince = Date.now();
    const loop = () => {
      if (!this.running("zxing")) return;
      const t0 = Date.now();
      if (this.video.readyState >= 2) {
        const n = tick++;
        const c = this.view(n);
        if (c && n % LUMA_EVERY === 0) this.autoTorch(c);
        if (c) {
          const thorough = t0 - quietSince > HARD_AFTER_MS && n % 2 === 1;
          try {
            const r = (thorough ? readerHard : reader).decodeFromCanvas(c);
            if (r) {
              quietSince = Date.now();
              this.read(r.getText(), Z.formatName(r.getBarcodeFormat()));
            }
          } catch {
            /* no code in this frame */
          }
        }
      }
      this.timer = window.setTimeout(loop, Math.max(0, TICK_MS - (Date.now() - t0)));
    };
    loop();
  }
}
