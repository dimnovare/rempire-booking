import { Suspense } from "react";
import { listServices } from "@/lib/admin/services";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
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
  const { business } = await requireAdmin();
  return <ServicesEditor services={await listServices(query, business.id)} />;
}
