import { Suspense } from "react";
import { listServices } from "@/lib/admin/services";
import { requireAdmin } from "@/lib/auth/current";
import { canGroup } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { NoRights } from "../no-rights";
import { ServicesEditor } from "./editor";

export default function ServicesPage() {
  return (
    <Suspense
      fallback={
        <main className="adm-page">
          <Wait />
        </main>
      }
    >
      <Loaded />
    </Suspense>
  );
}

async function Loaded() {
  if (!dbConfigured())
    return (
      <main className="adm-page">
        <p className="adm-wait">{(await getA()).noDb}</p>
      </main>
    );
  const { user, business } = await requireAdmin();
  // the section «Услуги» itself
  if (!canGroup(user, "services"))
    return (
      <main className="adm-page">
        <NoRights />
      </main>
    );
  return <ServicesEditor services={await listServices(query, business.id)} />;
}
