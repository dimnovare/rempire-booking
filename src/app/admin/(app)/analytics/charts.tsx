"use client";

/**
 * The three charts of «Основные показатели», in plain SVG (the repo has no
 * chart library, and needs none): the look the tool's charts have
 * (docs/altegio-pages.md, «Charts»): a #e0e0e0 grid, 12px #9aa3b1 axis
 * text, the legend centred underneath with round markers, 275px high.
 *
 *   LineChart    smooth 2px lines at .85 opacity («Продажи»);
 *   StackedBars  bars up to 16px wide, the first series at the bottom, the
 *                day's total over each bar («Посещаемость», «Заполненность»).
 *
 * A chart is as wide as its card (measured, so its words stay 12px on a
 * phone too). Pointing at a day, or tapping it, shows that day's figures;
 * the same figures are in a table for a screen reader.
 */
import { useLayoutEffect, useRef, useState } from "react";

export type Series = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

type Common = {
  dates: string[];
  /** «22 окт» under a bar */
  dayLabel: (date: string) => string;
  /** «Пятница, 20 ноября» in the tip */
  dayTitle: (date: string) => string;
  /** a value as the axis and the tip write it */
  format: (n: number) => string;
  /** what the chart is, for a screen reader */
  label: string;
  /** the axis goes at least this high, so an empty chart still has round steps */
  minTop: number;
  series: Series[];
};

const H = 275;
const PAD = { top: 22, right: 8, bottom: 30, left: 56 };

/** The plot box's width, read before the first paint; null until then (the server cannot know it). */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number | null] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = (width: number) => setW(Math.max(240, Math.round(width)));
    // at once, then on every change (an observer reports only when the page is drawn)
    fit(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => fit(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Round steps from 0 up to a round top at or over `max`: four or five lines. */
export function niceTicks(max: number, count = 4): number[] {
  const m = max > 0 ? max : 1;
  const raw = m / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(m / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step)
    out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** A smooth line through the points that never swings past them (monotone cubic, Fritsch–Carlson). */
export function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (!n) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    s.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
  }
  const t: number[] = [s[0]];
  for (let i = 1; i < n - 1; i++)
    t.push(s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2);
  t.push(s[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (s[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / s[i];
    const b = t[i + 1] / s[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * s[i];
      t[i + 1] = k * b * s[i];
    }
  }
  const f = (v: number) => Math.round(v * 10) / 10;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += `C${f(x0 + h)},${f(y0 + t[i] * h)} ${f(x1 - h)},${f(y1 - t[i + 1] * h)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

/** The frame both charts share: the grid, the axes, the hover layer, the tip, the legend and the table. */
function Frame({
  dates,
  dayLabel,
  dayTitle,
  format,
  label,
  minTop,
  series,
  top: dataTop,
  children,
}: Common & { top: number; children: (g: Geometry) => React.ReactNode }) {
  const [ref, measured] = useWidth();
  const w = measured ?? 0;
  const [hover, setHover] = useState<number | null>(null);
  const ticks = niceTicks(Math.max(dataTop, minTop));
  const top = ticks[ticks.length - 1] || 1;
  const n = Math.max(1, dates.length);
  const iw = w - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const slot = iw / n;
  const g: Geometry = {
    x: (i) => PAD.left + slot * (i + 0.5),
    y: (v) => PAD.top + ih - (Math.max(0, v) / top) * ih,
    slot,
    base: PAD.top + ih,
    hover,
  };
  // a label every k days, so two never touch
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 58))));
  const tipLeft = hover === null ? 0 : g.x(hover);
  return (
    <figure className="dsk-chart">
      <div
        className="dsk-plot"
        ref={ref}
        style={{ minHeight: H }}
        onMouseLeave={() => setHover(null)}
      >
        {measured !== null && (
          <svg
            width={w}
            height={H}
            viewBox={`0 0 ${w} ${H}`}
            role="img"
            aria-label={label}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line
                  x1={PAD.left}
                  x2={w - PAD.right}
                  y1={g.y(v)}
                  y2={g.y(v)}
                  className="dsk-grid"
                />
                <text
                  x={PAD.left - 8}
                  y={g.y(v)}
                  dy="0.35em"
                  textAnchor="end"
                  className="dsk-axis"
                >
                  {format(v)}
                </text>
              </g>
            ))}
            {dates.map((d, i) =>
              i % every === 0 ? (
                <text
                  key={d}
                  x={g.x(i)}
                  y={H - 10}
                  textAnchor="middle"
                  className="dsk-axis"
                >
                  {dayLabel(d)}
                </text>
              ) : null,
            )}
            {hover !== null && (
              <line
                x1={g.x(hover)}
                x2={g.x(hover)}
                y1={PAD.top}
                y2={g.base}
                className="dsk-guide"
              />
            )}
            {children(g)}
            {/* the hit targets: a whole day's column, wider than any mark in it */}
            {dates.map((d, i) => (
              <rect
                key={d}
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover((cur) => (cur === i ? null : i))}
              />
            ))}
          </svg>
        )}
        {hover !== null && (
          <div
            className={`dsk-tip${tipLeft > w / 2 ? " is-left" : ""}`}
            style={{ left: tipLeft }}
            aria-hidden="true"
          >
            <b>{dayTitle(dates[hover])}</b>
            {series.map((s) => (
              <span key={s.key}>
                <i style={{ background: s.color }} />
                {s.label}: <b>{format(s.values[hover] ?? 0)}</b>
              </span>
            ))}
          </div>
        )}
      </div>
      <figcaption>
        <ul className="dsk-legend">
          {series.map((s) => (
            <li key={s.key}>
              <i style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      </figcaption>
      {/* a table ignores the 1 px width of .sr and grows to its content: the box around it is what hides it */}
      <div className="sr">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">{label}</th>
              {series.map((s) => (
                <th key={s.key} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((d, i) => (
              <tr key={d}>
                <th scope="row">{dayTitle(d)}</th>
                {series.map((s) => (
                  <td key={s.key}>{format(s.values[i] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

type Geometry = {
  x: (i: number) => number;
  y: (v: number) => number;
  slot: number;
  base: number;
  hover: number | null;
};

/** «Продажи»: a smooth line per series, a dot on the day pointed at. */
export function LineChart(props: Common) {
  const top = Math.max(0, ...props.series.flatMap((s) => s.values));
  return (
    <Frame {...props} top={top}>
      {(g) =>
        props.series.map((s) => (
          <g key={s.key}>
            <path
              d={smoothPath(s.values.map((v, i) => [g.x(i), g.y(v)]))}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeOpacity={0.85}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {g.hover !== null && (
              <circle
                cx={g.x(g.hover)}
                cy={g.y(s.values[g.hover] ?? 0)}
                r={4}
                fill={s.color}
                stroke="#fff"
                strokeWidth={2}
              />
            )}
          </g>
        ))
      }
    </Frame>
  );
}

/**
 * «Посещаемость» and «Заполненность»: the series stacked, the first at the
 * bottom, 2px of the card between two of them; the day's total over its bar
 * (`total` writes it), where there is room for it.
 */
export function StackedBars({
  total,
  ...props
}: Common & { total: (n: number) => string }) {
  const sums = props.dates.map((_, i) =>
    props.series.reduce((n, s) => n + (s.values[i] ?? 0), 0),
  );
  const top = Math.max(0, ...sums);
  return (
    <Frame {...props} top={top}>
      {(g) => {
        const bw = Math.max(3, Math.min(16, g.slot * 0.6));
        const labels = g.slot >= 22;
        return props.dates.map((d, i) => {
          let at = 0;
          const parts = props.series.map((s, k) => {
            const v = s.values[i] ?? 0;
            const y0 = g.y(at);
            at += v;
            const y1 = g.y(at);
            // a gap of the card's colour between two parts
            const h = Math.max(0, y0 - y1 - (k > 0 && v > 0 ? 2 : 0));
            return v > 0 && h > 0 ? (
              <rect
                key={s.key}
                x={g.x(i) - bw / 2}
                y={y1}
                width={bw}
                height={h}
                rx={Math.min(2, bw / 4)}
                fill={s.color}
              />
            ) : null;
          });
          const sum = sums[i];
          return (
            <g key={d}>
              {parts}
              {sum > 0 && (labels || g.hover === i) && (
                <text
                  x={g.x(i)}
                  y={g.y(sum) - 6}
                  textAnchor="middle"
                  className="dsk-total"
                >
                  {total(sum)}
                </text>
              )}
            </g>
          );
        });
      }}
    </Frame>
  );
}
