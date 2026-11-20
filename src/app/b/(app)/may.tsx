"use client";

/**
 * What this login may do in the barber app's column (its rights:
 * src/lib/barber/day.ts, barberMay). The day's page hands it down here, so
 * a sheet deep inside can leave out a control the login has no right to.
 * That is only tidiness: every action asks the same rights again on the
 * server.
 */
import { createContext, useContext } from "react";
import type { BMay } from "@/lib/barber/day";
import { useB } from "../lang";

/** Outside a provider nothing is held back: the server still decides. */
const ALL: BMay = { see: true, call: true, card: true, create: true, newClient: true, pickClient: true, edit: true, editCame: true, services: true, note: true, clientNote: true, move: true, cancel: true, stats: true, from: null };

const Ctx = createContext<BMay>(ALL);

export const MayProvider = Ctx.Provider;
export const useMay = () => useContext(Ctx);

/** The page of a login that has no right to see it. */
export function NoRights() {
  const B = useB();
  return (
    <main className="adm-page">
      <h1 className="adm-h1">{B.rights.none}</h1>
      <p className="adm-meta">{B.rights.noneLead}</p>
    </main>
  );
}
