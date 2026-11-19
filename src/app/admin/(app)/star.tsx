"use client";

/**
 * The star beside a page's title: yellow when the login has the page in
 * «Избранное» (the sidebar from 900px lists them). Shown from 900px only: a
 * phone has no sidebar to list them in.
 */
import type { FavPage } from "@/lib/admin/favourites";
import { useA } from "../lang";
import { useFrame } from "./frame";

/** A page's title with its star: wrap the heading. */
export function Titled({ page, children }: { page: FavPage; children: React.ReactNode }) {
  return (
    <div className="adm-titled">
      {children}
      <PageStar page={page} />
    </div>
  );
}

export function PageStar({ page }: { page: FavPage }) {
  const A = useA();
  const frame = useFrame();
  const on = frame.favs.includes(page);
  const label = on ? A.frame.favRemove(A.nav[page]) : A.frame.favAdd(A.nav[page]);
  return (
    <button type="button" className="adm-star" aria-pressed={on} aria-label={label} title={label} onClick={() => frame.star(page, !on)}>
      <StarShape filled={on} />
    </button>
  );
}

export function StarShape({ filled, size = 16 }: { filled: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
    </svg>
  );
}
