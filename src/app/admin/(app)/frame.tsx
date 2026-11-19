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
 * once and saved by an action.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
};

const NONE: Frame = { favs: [], star: () => {}, open: () => {}, say: () => {} };
const Ctx = createContext<Frame>(NONE);

export const useFrame = () => useContext(Ctx);

export function FrameProvider({ favs: sent, children }: { favs: FavPage[]; children: React.ReactNode }) {
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

  const frame = useMemo<Frame>(() => ({ favs, star, open: setDrawer, say }), [favs, star, say]);
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
