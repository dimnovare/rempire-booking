import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { canGroup } from "@/lib/auth/rights";
import { dbConfigured } from "@/lib/db";
import { getA } from "../../lang-server";
import { NoRights } from "../no-rights";

/**
 * «Барберы». The list itself is in the layout (rail.tsx): on a phone the
 * list of rows, from 900px the table of the admin we follow (table.tsx;
 * Dim, round 15), which takes the whole width. A barber opens on his own
 * page. This page only says when there is no list to show.
 */
export default function StaffPage() {
  return (
    <Suspense fallback={null}>
      <Index />
    </Suspense>
  );
}

async function Index() {
  if (!dbConfigured())
    return (
      <main className="adm-page">
        <p className="adm-wait">{(await getA()).noDb}</p>
      </main>
    );
  const { user } = await requireAdmin();
  if (!canGroup(user, "staff"))
    return (
      <main className="adm-page">
        <NoRights />
      </main>
    );
  return null;
}
