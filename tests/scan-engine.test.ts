/**
 * The barber app's barcode scanner: the decisions its camera engine makes,
 * ported from the live shop's scanner (rempire-web, public/shop2/app.js,
 * after its audits of 06–07.09.2026). Only the parts that need no camera:
 * which lens, which view of the frame, when a read counts, a handheld
 * scanner's keystrokes, the zoom.
 */
import { describe, expect, it } from "vitest";
import {
  FULL_EVERY,
  lensRank,
  pickLens,
  ReadGate,
  selfChecked,
  TILTS,
  viewFor,
  WedgeBuffer,
  zoomClamp,
  zoomLabel,
} from "@/app/b/(app)/sell/scan-engine";
import { FAKE_PRODUCTS } from "@/lib/shop";

const cam = (deviceId: string, label: string) => ({ kind: "videoinput", deviceId, label });

describe("which back lens", () => {
  it("reads Android's own numbering from Chrome's labels", () => {
    expect(lensRank("camera2 0, facing back")).toBe(0);
    expect(lensRank("camera2 2, facing back")).toBe(2);
    expect(lensRank("Back Camera")).toBe(50);
  });

  it("takes the lowest-numbered back lens, never the front one", () => {
    const devs = [cam("f", "camera2 1, facing front"), cam("w", "camera2 2, facing back"), cam("main", "camera2 0, facing back")];
    expect(pickLens(devs)).toBe("main");
  });

  it("drops a lens that says wide, ultra, tele or macro", () => {
    const devs = [cam("uw", "Back Ultra Wide Camera"), cam("tele", "Back Telephoto Camera"), cam("main", "Back Camera")];
    expect(pickLens(devs)).toBe("main");
  });

  it("leaves the choice to facingMode with one back lens, or no labels", () => {
    expect(pickLens([cam("a", "camera2 0, facing back"), cam("f", "camera2 1, facing front")])).toBeNull();
    expect(pickLens([cam("a", ""), cam("b", "")])).toBeNull();
    expect(pickLens([{ kind: "audioinput", deviceId: "m", label: "back mic" }, cam("a", "camera2 0, facing back")])).toBeNull();
  });
});

describe("which view of the frame", () => {
  it("turns the band back 13° either way on every other pass", () => {
    expect([0, 1, 2, 3].map((t) => viewFor(t))).toEqual(TILTS.map((tilt) => ({ full: false, tilt })));
  });

  it("looks at the whole frame every ninth pass", () => {
    const full = Array.from({ length: 27 }, (_, t) => t).filter((t) => viewFor(t).full);
    expect(full).toEqual([FULL_EVERY - 1, 2 * FULL_EVERY - 1, 3 * FULL_EVERY - 1]);
  });
});

describe("when a camera read counts", () => {
  it("a code with its own check digit counts on the first frame", () => {
    for (const f of ["ean_13", "EAN_8", "upc_a", "upc_e", "code_128", "qr_code"]) expect(selfChecked(f)).toBe(true);
    expect(new ReadGate().read("4006381333931", "ean_13", 0)).toBe("4006381333931");
  });

  it("one without (ITF, CODE_39) has to be read twice inside a second", () => {
    expect(selfChecked("itf")).toBe(false);
    const g = new ReadGate();
    expect(g.read("12345678", "itf", 0)).toBeNull();
    expect(g.read("12345678", "itf", 400)).toBe("12345678");
    // the buffer is spent: the next frame starts again
    expect(g.read("12345678", "itf", 500)).toBeNull();
  });

  it("a different code, or a second too late, starts again", () => {
    const g = new ReadGate();
    expect(g.read("AAAA1", "code_39", 0)).toBeNull();
    expect(g.read("AAAA2", "code_39", 100)).toBeNull();
    expect(g.read("AAAA2", "code_39", 1200)).toBeNull();
    expect(g.read("AAAA2", "code_39", 1300)).toBe("AAAA2");
  });

  it("an empty read is no read", () => {
    expect(new ReadGate().read("  ", "ean_13", 0)).toBeNull();
  });
});

describe("a handheld scanner is a keyboard", () => {
  const burst = (w: WedgeBuffer, s: string, t0: number, step = 10) => {
    let out: string | null = null;
    [...s].forEach((k, i) => (out = w.key(k, t0 + i * step) ?? out));
    return w.key("Enter", t0 + s.length * step) ?? out;
  };

  it("digits in a burst, then Enter, are one code", () => {
    expect(burst(new WedgeBuffer(), "4006381333931", 0)).toBe("4006381333931");
  });

  it("a pause of more than 400 ms starts a new burst", () => {
    const w = new WedgeBuffer();
    w.key("9", 0);
    w.key("9", 10);
    expect(burst(w, "12345", 1000)).toBe("12345");
  });

  it("fewer than four characters is a stray key, not a code", () => {
    expect(burst(new WedgeBuffer(), "123", 0)).toBeNull();
  });

  it("keys that are not characters are ignored", () => {
    const w = new WedgeBuffer();
    w.key("Shift", 0);
    expect(burst(w, "RMP-0042", 5)).toBe("RMP-0042");
  });
});

describe("the fake shop's barcodes", () => {
  // a camera reads an EAN-13 only when its check digit adds up: a demo code that does not is one no scanner can read
  const eanOk = (c: string) => {
    const d = [...c].map(Number);
    const sum = d.slice(0, 12).reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0);
    return /^\d{13}$/.test(c) && (10 - (sum % 10)) % 10 === d[12];
  };

  it("are valid EAN-13s, so a printed label scans", () => {
    expect(FAKE_PRODUCTS.length).toBeGreaterThan(0);
    for (const p of FAKE_PRODUCTS) expect(eanOk(p.barcode ?? ""), `${p.productId} ${p.barcode}`).toBe(true);
  });
});

describe("the zoom", () => {
  it("stays inside what the lens can do", () => {
    expect(zoomClamp(9, { min: 1, max: 8 })).toBe(8);
    expect(zoomClamp(0.5, { min: 1, max: 8 })).toBe(1);
    expect(zoomClamp(2.4, { min: 1, max: 8 })).toBe(2.4);
  });

  it("is written the way a phone camera writes it", () => {
    expect(zoomLabel(1.5)).toBe("1,5×");
    expect(zoomLabel(2.44)).toBe("2,4×");
    expect(zoomLabel(3)).toBe("3,0×");
  });
});
