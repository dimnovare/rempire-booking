"use client";

/**
 * What the whole admin shares around a page (docs/reference-looks.md,
 * «Sidebar and tiles»):
 *
 *   - «Избранное»: the pages this login has starred. The sidebar lists
 *     them, the star beside a page's title (star.tsx) changes them;
 *   - the two drawers the sidebar's tiles open, «Продажа товара» and
 *     «Список услуг» (a phone opens the sale from «Ещё»);
 *   - one line that says a thing is done.
 *
 * The layout hands it the login's starred pages; a star is shown changed at
 * once and saved by an action. It also hands it `off`: the sections and
 * tiles this login has no right to («clients», «staff», «services»,
 * «sale»), which the menus then leave out. The pages themselves refuse on
 * the server; this only keeps a dead link off the screen.
 *
 * And the login's own tabs for a phone's bottom bar (`bar`, with «Мой
 * день» for a login linked to a barber) and how many requests wait for an
 * answer (`waiting`, the dot on «Запросы»): src/lib/admin/app-nav.ts.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { BarKey } from "@/lib/admin/app-nav";
import type { FavPage } from "@/lib/admin/favourites";
import { useA } from "../lang";
import { favouriteAction } from "./frame-actions";
import { SaleDrawer } from "./sale-drawer";
import { ServicesDrawer } from "./services-drawer";

export type DrawerName = "sale" | "services";

type Frame = {
  favs: readonly FavPage[];
  star: (page: FavPage, on: boolean) => void;
  open: (drawer: DrawerName) => void;
  say: (text: string, bad?: boolean) => void;
  /** what this login has no right to: section keys, and «sale» */
  off: readonly string[];
  /** the login's tabs in a phone's bottom bar */
  bar: readonly BarKey[];
  /** requests waiting for an answer */
  waiting: number;
};

/** The salon's own tabs: what a login not linked to a barber has. */
const SALON_BAR: readonly BarKey[] = ["calendar", "clients", "requests", "invoices", "more"];
const NONE: Frame = { favs: [], star: () => {}, open: () => {}, say: () => {}, off: [], bar: SALON_BAR, waiting: 0 };
const Ctx = createContext<Frame>(NONE);

export const useFrame = () => useContext(Ctx);

export function FrameProvider({
  favs: sent,
  off = NONE.off,
  bar = SALON_BAR,
  waiting = 0,
  children,
}: {
  favs: FavPage[];
  off?: readonly string[];
  bar?: readonly BarKey[];
  waiting?: number;
  children: React.ReactNode;
}) {
  const A = useA();
  const [favs, setFavs] = useState<readonly FavPage[]>(sent);
  // the server sent the list anew (the page was refreshed): that is the list
  const [seen, setSeen] = useState(sent);
  if (seen !== sent) {
    setSeen(sent);
    setFavs(sent);
  }
  const [drawer, setDrawer] = useState<DrawerName | null>(null);
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const say = useCallback((text: string, bad = false) => setToast({ text, bad }), []);

  const star = useCallback(
    (page: FavPage, on: boolean) => {
      // shown at once; the answer is the list as it is saved
      setFavs((cur) => (on ? (cur.includes(page) ? cur : [...cur, page]) : cur.filter((p) => p !== page)));
      favouriteAction(page, on).then(
        (list) => {
          if (list) setFavs(list);
        },
        () => {
          setFavs((cur) => (on ? cur.filter((p) => p !== page) : cur.includes(page) ? cur : [...cur, page]));
          say(A.error, true);
        },
      );
    },
    [A.error, say],
  );

  const offKey = off.join(",");
  const barKey = bar.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const frame = useMemo<Frame>(() => ({ favs: favs.filter((p) => !off.includes(p)), star, open: setDrawer, say, off, bar, waiting }), [favs, star, say, offKey, barKey, waiting]);
  const close = useCallback(() => setDrawer(null), []);

  return (
    <Ctx.Provider value={frame}>
      {children}
      {drawer === "sale" && <SaleDrawer onClose={close} onSaved={(what) => say(A.sale.saved(what))} />}
      {drawer === "services" && <ServicesDrawer onClose={close} />}
      {toast && (
        <p className={`adm-toast adm-frame-toast${toast.bad ? " is-bad" : ""}`} role="status">
          {toast.text}
        </p>
      )}
    </Ctx.Provider>
  );
}
