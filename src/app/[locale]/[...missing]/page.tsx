import { notFound } from "next/navigation";

/**
 * Any address under this part that no page answers: its own not-found.tsx
 * (in its frame and language), not the bare default 404. Real pages win
 * over this catch-all, so it only ever sees what does not exist.
 */
// always a 404: nothing to check for an instant navigation (the dev server's «Could not validate instant»)
export const instant = false;

export default function Missing(): never {
  notFound();
}
