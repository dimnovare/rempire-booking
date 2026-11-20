"use client";

/**
 * The salon's pin on OpenStreetMap's own tiles, drawn here with Web
 * Mercator (src/lib/mercator.ts): no map library, no key, no account.
 *
 *   With `onPin` (the owner's «Контакты», as the tool we follow has its
 *   map): the map pans under a finger or the mouse, «+» and «−» zoom, the
 *   pin can be dragged, a tap puts it there, and the arrow keys move it a
 *   little once it has the focus. Each move ends in onPin, six decimals.
 *   `focus` changing brings the pin to the middle, close up (the geocoder
 *   has just found the address).
 *   Without it (the salon's page on the booking site): a still picture with
 *   the pin; the page lays its own link over it.
 *
 * A tile that does not load leaves the map's ground showing: nothing else
 * breaks. «© OpenStreetMap» links to its copyright page, as its tile
 * policy asks. Tiles: https://tile.openstreetmap.org/{z}/{x}/{y}.png.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { clampZoom, fromView, project, round6, tilesFor, toView, unproject, type LatLng, type Px } from "@/lib/mercator";
import "./osm-map.css";

/** Tallinn's middle: where a salon with no pin yet starts looking. */
const TALLINN: LatLng = { lat: 59.437, lng: 24.7536 };
/** How close «Найти» brings the pin. */
const CLOSE = 17;
/** A pointer that moved less than this was a tap, not a drag. */
const TAP_PX = 6;

export type OsmMapWords = { zoomIn: string; zoomOut: string; pin: string; hint?: string; copyright?: string };

type Props = {
  pin: LatLng | null;
  /** where the map looks while there is no pin */
  home?: LatLng;
  zoom?: number;
  /** a new value brings the pin to the middle, close up */
  focus?: number;
  /** the owner's map: the pin moves, and each move ends here */
  onPin?: (p: LatLng) => void;
  /** the map's name for a screen reader */
  label: string;
  words?: OsmMapWords;
  className?: string;
  /** tiles load only once the map is near the screen (the salon's page) */
  lazy?: boolean;
};

type Drag = { kind: "pan"; id: number; x: number; y: number; from: Px; moved: number } | { kind: "pin"; id: number; x: number; y: number; from: Px; moved: number };

const same = (a: LatLng | null, b: LatLng | null) => (a && b ? a.lat === b.lat && a.lng === b.lng : a === b);

export function OsmMap({ pin, home, zoom = 16, focus = 0, onPin, label, words, className, lazy = false }: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(() => ({ center: pin ?? home ?? TALLINN, z: clampZoom(zoom) }));
  // the pin where a finger holds it, in the view's pixels; null when it is not being dragged
  const [held, setHeld] = useState<Px | null>(null);
  const [moved, setMoved] = useState(false);
  const [seen, setSeen] = useState({ focus, pin });

  const { w, h } = size;
  const { center, z } = view;
  const c = project(center, z);

  // a new focus: the pin in the middle, close up; a pin moved from outside (a pasted point) and out of sight: in the middle
  if (seen.focus !== focus || !same(seen.pin, pin)) {
    setSeen({ focus, pin });
    if (pin && seen.focus !== focus) setView({ center: pin, z: Math.max(z, CLOSE) });
    else if (pin && w > 0) {
      const at = toView(pin, c, w, h, z);
      if (at.x < 16 || at.y < 40 || at.x > w - 16 || at.y > h - 8) setView({ center: pin, z });
    }
  }

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tiles = w > 0 && h > 0 ? tilesFor(c, w, h, z) : [];
  const pinAt = held ?? (pin && w > 0 ? toView(pin, c, w, h, z) : null);
  const edit = !!onPin;

  const put = (pt: Px) => {
    const p = fromView({ x: Math.min(w, Math.max(0, pt.x)), y: Math.min(h, Math.max(0, pt.y)) }, c, w, h, z);
    onPin?.({ lat: round6(p.lat), lng: round6(p.lng) });
  };

  const local = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!edit || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: "pan", id: e.pointerId, x: e.clientX, y: e.clientY, from: c, moved: 0 };
  };
  const onPinDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!pinAt || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: "pin", id: e.pointerId, x: e.clientX, y: e.clientY, from: pinAt, moved: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.moved = Math.max(d.moved, Math.hypot(dx, dy));
    if (d.kind === "pan") setView((v) => ({ ...v, center: unproject({ x: d.from.x - dx, y: d.from.y - dy }, v.z) }));
    else if (d.moved >= 2) setHeld({ x: Math.min(w, Math.max(0, d.from.x + dx)), y: Math.min(h, Math.max(0, d.from.y + dy)) });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.kind === "pan") {
      // a tap on the map, not a drag of it: the pin goes there
      if (d.moved < TAP_PX && e.type === "pointerup") put(local(e));
      return;
    }
    if (d.moved >= 2 && e.type === "pointerup") {
      put({ x: d.from.x + (e.clientX - d.x), y: d.from.y + (e.clientY - d.y) });
      setMoved(true);
    }
    setHeld(null);
  };
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 16 : 4;
    const by: Record<string, Px> = { ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step }, ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 } };
    const d = by[e.key];
    if (!d || !pinAt) return;
    e.preventDefault();
    put({ x: pinAt.x + d.x, y: pinAt.y + d.y });
    setMoved(true);
  };
  const zoomBy = (dz: number) => setView((v) => ({ ...v, z: clampZoom(v.z + dz) }));

  const pinMark = (
    <svg width="40" height="52" viewBox="0 0 40 52" aria-hidden="true">
      <ellipse cx="20" cy="49" rx="8" ry="3" className="osm-pin-shadow" />
      <path d="M20 2C10 2 3 9 3 19c0 12 17 28 17 28s17-16 17-28C37 9 30 2 20 2z" className="osm-pin-drop" />
      <circle cx="20" cy="19" r="7" className="osm-pin-dot" />
    </svg>
  );
  const pinStyle = pinAt ? { left: Math.round(pinAt.x) - 20, top: Math.round(pinAt.y) - 48 } : undefined;
  const data = pin ? { "data-lat": pin.lat, "data-lng": pin.lng } : {};

  return (
    <div
      ref={box}
      className={`osm${edit ? " is-edit" : ""}${held ? " is-held" : ""}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={label}
      data-zoom={z}
      onPointerDown={edit ? onDown : undefined}
      onPointerMove={edit ? onMove : undefined}
      onPointerUp={edit ? onUp : undefined}
      onPointerCancel={edit ? onUp : undefined}
    >
      <div className="osm-tiles" aria-hidden="true">
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            src={t.url}
            alt=""
            width={256}
            height={256}
            draggable={false}
            loading={lazy ? "lazy" : "eager"}
            decoding="async"
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ left: t.left, top: t.top }}
            onError={(e) => void (e.currentTarget.style.visibility = "hidden")}
          />
        ))}
      </div>
      {pinAt &&
        (edit ? (
          <button type="button" className="osm-pin" style={pinStyle} aria-label={words?.pin} onPointerDown={onPinDown} onKeyDown={onKey} {...data}>
            {pinMark}
          </button>
        ) : (
          <span className="osm-pin" style={pinStyle} {...data}>
            {pinMark}
          </span>
        ))}
      {edit && pinAt && words?.hint && !moved && !held && (
        <span className="osm-hint" style={{ left: Math.round(pinAt.x), top: Math.round(pinAt.y) + 10 }} aria-hidden="true">
          {words.hint}
        </span>
      )}
      {edit && words && (
        <div className="osm-zoom">
          <button type="button" aria-label={words.zoomIn} disabled={z >= 19} onClick={() => zoomBy(1)}>
            +
          </button>
          <button type="button" aria-label={words.zoomOut} disabled={z <= 2} onClick={() => zoomBy(-1)}>
            −
          </button>
        </div>
      )}
      <a className="osm-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        {words?.copyright ?? "© OpenStreetMap"}
      </a>
    </div>
  );
}
