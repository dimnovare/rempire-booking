"use client";

/**
 * The admin's sidebar from 900px, in the two modes of the product we follow
 * (docs/reference-looks.md, «Sidebar and tiles»; docs/altegio-pages.md,
 * «Sidebar»): sizes and colours are its own, the icons and words ours.
 *
 *   - «till», the calendar's own: the month with a ring per day (how full
 *     the day is), the tiles («Продажа товара», «Список услуг», «Каталог
 *     товаров»; the fourth, a hand-typed payment, is not built), and
 *     «Избранное», the pages this login has starred;
 *   - «menu», behind the yellow «Все разделы»: every section as an
 *     accordion on black. Its yellow bar reads «Журнал» and goes back to
 *     the calendar and to «till».
 *
 * The mode is kept per browser tab (sessionStorage). A tab that opens on
 * the calendar starts in «till», one that opens on any other page in
 * «menu». A phone has none of this: its bar is in nav.tsx.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { TowerMark } from "@/components/brand";
// the test line's own sheet: the row at the foot opens it
import { REPORT_EVENT } from "@/components/test-banner-view";
import { FAV_HREF } from "@/lib/admin/favourites";
import { monthGrid, shiftMonth, type MonthLoad } from "@/lib/admin/month-load";
import { isLocalDate } from "@/lib/tz";
import { CaretIcon, NextIcon, OutIcon, PrevIcon } from "../icons";
import { useA } from "../lang";
import { logout } from "./account/actions";
import { useFrame } from "./frame";
import { monthLoadAction } from "./frame-actions";
import { MENU, SectionIcon, sectionOpen } from "./sections";
import { StarShape } from "./star";

type Mode = "till" | "menu";
const MODE_KEY = "adm-sb-mode";
const FAV_KEY = "adm-sb-fav";

const stored = (key: string): string | null => {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};
const keep = (key: string, value: string) => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* private mode: the choice lasts until the page is left */
  }
};

export type SidebarProps = {
  user: { name: string; email: string };
  /** a local demo: say so */
  demo: boolean;
  /** today in the salon's zone, YYYY-MM-DD */
  today: string;
  /** this month's load, with the page; null if it could not be read (the month then asks for it itself) */
  load: MonthLoad | null;
  /** staging: the row with «Сообщить о проблеме» */
  report: boolean;
  /** «Мой день | Салон» (src/components/side-switch.tsx) */
  side: React.ReactNode;
};

export function Sidebar({ user, demo, today, load, report, side }: SidebarProps) {
  const A = useA();
  const F = A.frame;
  const path = usePathname();
  const frame = useFrame();
  const onCal = path === "/admin";
  const [mode, setMode] = useState<Mode>(onCal ? "till" : "menu");
  const [favOpen, setFavOpen] = useState(!onCal);

  // what this tab chose before; a new tab keeps what it opened with
  useLayoutEffect(() => {
    const m = stored(MODE_KEY);
    if (m === "till" || m === "menu") setMode(m);
    else keep(MODE_KEY, onCal ? "till" : "menu");
    const f = stored(FAV_KEY);
    if (f === "1" || f === "0") setFavOpen(f === "1");
    // once, when the tab opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const to = (m: Mode) => {
    setMode(m);
    keep(MODE_KEY, m);
  };
  const foldFav = () => {
    keep(FAV_KEY, favOpen ? "0" : "1");
    setFavOpen(!favOpen);
  };

  return (
    <aside className={`sb is-${mode}`} aria-label={F.sidebar}>
      <div className="sb-head">
        <a href="/admin" className="sb-brand" aria-label="REMPIRE">
          <span className="sb-mark">
            <TowerMark />
          </span>
          <span className="sb-name">REMPIRE</span>
        </a>
        {demo && (
          <span className="adm-tag lime" title={A.demo}>
            {A.demoTag}
          </span>
        )}
      </div>
      <div className="sb-side">{side}</div>

      <div className="sb-mid">
        {mode === "till" ? (
          <>
            <MiniMonth today={today} initial={load} />
            <div className="sb-tiles" role="group" aria-label={F.tiles}>
              {/* a tile the login has no right to is not drawn */}
              {!frame.off.includes("sale") && (
                <button type="button" className="sb-tile" onClick={() => frame.open("sale")}>
                  <SectionIcon name="bag" />
                  <TwoLines text={A.sale.title} />
                </button>
              )}
              {!frame.off.includes("services") && (
                <button type="button" className="sb-tile" onClick={() => frame.open("services")}>
                  <SectionIcon name="svc" />
                  <TwoLines text={A.svcList.title} />
                </button>
              )}
              <Link className="sb-tile" href="/admin/catalogue" prefetch={false} aria-current={sectionOpen("/admin/catalogue", path) ? "page" : undefined}>
                <SectionIcon name="box" />
                <TwoLines text={A.nav.catalogue} />
              </Link>
            </div>
            <div className="sb-fav">
              <button type="button" className="sb-fav-head" aria-expanded={favOpen} onClick={foldFav}>
                <SectionIcon name="star" size={18} />
                <span>{F.fav}</span>
                <CaretIcon size={12} />
              </button>
              {favOpen &&
                (frame.favs.length === 0 ? (
                  <p className="sb-fav-empty">{F.favEmpty}</p>
                ) : (
                  <ul className="sb-fav-list" aria-label={F.fav}>
                    {frame.favs.map((p) => {
                      const here = sectionOpen(FAV_HREF[p], path);
                      return (
                        <li key={p}>
                          <Link href={FAV_HREF[p]} prefetch={false} aria-current={here ? "page" : undefined}>
                            <span>{A.nav[p]}</span>
                            {here && <StarShape filled size={14} />}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ))}
            </div>
          </>
        ) : (
          <Menu path={path} />
        )}
      </div>

      <div className="sb-me">
        <div className="who">
          <b>{user.name || user.email}</b>
          {user.name && <span>{user.email}</span>}
        </div>
        <form action={logout}>
          <button className="sb-out" aria-label={A.account.logout} title={A.account.logout}>
            <OutIcon size={18} />
          </button>
        </form>
      </div>
      {mode === "till" ? (
        <button type="button" className="sb-bar" onClick={() => to("menu")}>
          <SectionIcon name="all" size={18} />
          <span>{F.all}</span>
        </button>
      ) : (
        <Link className="sb-bar" href="/admin" prefetch={false} onClick={() => to("till")}>
          <SectionIcon name="cal" size={18} />
          <span>{F.journal}</span>
        </Link>
      )}
      {mode === "till" && report && (
        <div className="sb-foot">
          <button type="button" onClick={() => window.dispatchEvent(new Event(REPORT_EVENT))}>
            {A.test.report}
          </button>
        </div>
      )}
    </aside>
  );
}

/** A tile's words on two lines, as the tiles we follow: the first word, then the rest. */
function TwoLines({ text }: { text: string }) {
  const at = text.indexOf(" ");
  return at < 0 ? (
    <span>{text}</span>
  ) : (
    <span>
      {/* the space stays in the text, so the name reads as two words whatever a reader makes of the break */}
      {text.slice(0, at + 1)}
      <br />
      {text.slice(at + 1)}
    </span>
  );
}

/* ---------- «menu»: the sections as an accordion ---------- */

function Menu({ path }: { path: string }) {
  const A = useA();
  // a section the login has no right to is not listed (frame.tsx)
  const { off } = useFrame();
  // the group with the open page is open; a tap opens another one or shuts it, until the page changes
  const here = MENU.find((row) => row.pages?.some((p) => sectionOpen(p.href, path)))?.key ?? null;
  const [picked, setPicked] = useState<{ path: string; key: string | null } | null>(null);
  const open = picked && picked.path === path ? picked.key : here;
  return (
    <nav className="sb-menu" aria-label={A.sections}>
      {MENU.filter((row) => !off.includes(row.key)).map((row) => {
        if (!row.pages) {
          const on = sectionOpen(row.href!, path);
          return (
            <Link key={row.key} className="sb-row" href={row.href!} prefetch={false} aria-current={on ? "page" : undefined}>
              <SectionIcon name={row.icon} size={20} />
              <span>{A.nav[row.key]}</span>
            </Link>
          );
        }
        const shown = open === row.key;
        return (
          <div key={row.key} className={shown ? "sb-group is-open" : "sb-group"}>
            <button type="button" className="sb-row" aria-expanded={shown} onClick={() => setPicked({ path, key: shown ? null : row.key })}>
              <SectionIcon name={row.icon} size={20} />
              <span>{A.nav[row.key]}</span>
              <CaretIcon size={12} />
            </button>
            {shown &&
              row.pages.map((p) => (
                <Link key={p.href} className="sb-sub" href={p.href} prefetch={false} aria-current={sectionOpen(p.href, path) ? "page" : undefined}>
                  {A.nav[p.key]}
                </Link>
              ))}
          </div>
        );
      })}
    </nav>
  );
}

/* ---------- «till»: the month ---------- */

const noon = (date: string) => new Date(`${date}T12:00:00Z`);

/**
 * The month, Monday first. Each day wears a ring: how much of the barbers'
 * working time that day is booked (src/lib/admin/month-load.ts), green,
 * yellow or red. A day nobody works has no ring; today, and the day the
 * calendar shows, a light disc. A day opens in the calendar.
 */
function MiniMonth({ today, initial }: { today: string; initial: MonthLoad | null }) {
  const A = useA();
  const F = A.frame;
  const path = usePathname();
  const d = useSearchParams().get("d");
  // the day the calendar shows, when the calendar is the page
  const shown = path === "/admin" ? (isLocalDate(d) ? d : today) : null;
  const [month, setMonth] = useState((shown ?? today).slice(0, 7));
  // the calendar went to a day of another month: the month follows it
  const [seenShown, setSeenShown] = useState(shown);
  if (seenShown !== shown) {
    setSeenShown(shown);
    if (shown) setMonth(shown.slice(0, 7));
  }
  const [loads, setLoads] = useState<Record<string, MonthLoad>>(initial ? { [initial.month]: initial } : {});
  // this month comes with the page, and again each time the page is refreshed
  const [sent, setSent] = useState(initial);
  if (sent !== initial) {
    setSent(initial);
    if (initial) setLoads((cur) => ({ ...cur, [initial.month]: initial }));
  }
  // any other month is asked for, and asked again when the page is refreshed
  useEffect(() => {
    if (initial && month === initial.month) return;
    let live = true;
    monthLoadAction(month).then(
      (m) => {
        if (live && m) setLoads((cur) => ({ ...cur, [m.month]: m }));
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [month, initial]);

  const known = loads[month];
  const days = known ? known.days : monthGrid(month).map((date) => ({ date, pct: null, band: null }));
  return (
    <div className="sb-month">
      <div className="sb-month-head">
        <button type="button" aria-label={F.monthPrev} onClick={() => setMonth(shiftMonth(month, -1))}>
          <PrevIcon size={14} />
        </button>
        <span aria-live="polite">{F.month(noon(`${month}-01`))}</span>
        <button type="button" aria-label={F.monthNext} onClick={() => setMonth(shiftMonth(month, 1))}>
          <NextIcon size={14} />
        </button>
      </div>
      <div className="sb-wd" aria-hidden="true">
        {A.staff.weekdays.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className={known ? "sb-days" : "sb-days is-wait"}>
        {days.map((x) => {
          const text = F.day(noon(x.date));
          const cls = ["sb-day", x.date.slice(0, 7) !== month ? "is-out" : "", x.pct == null ? "is-off" : "", x.date === today || x.date === shown ? "is-lit" : ""].filter(Boolean).join(" ");
          return (
            <Link
              key={x.date}
              className={cls}
              href={`/admin?d=${x.date}`}
              prefetch={false}
              aria-current={x.date === shown ? "date" : undefined}
              aria-label={x.pct == null ? (known ? F.dayOff(text) : text) : F.dayLoad(text, x.pct)}
              data-band={x.band ?? undefined}
              style={x.pct == null ? undefined : ({ "--p": `${x.pct}%` } as React.CSSProperties)}
            >
              <span>{Number(x.date.slice(8))}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
