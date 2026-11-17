import { Suspense } from "react";
import { listServices } from "@/lib/admin/services";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { A } from "../../copy";
import { ServicesEditor } from "./editor";

export const metadata = { title: A.services.title };

export default function ServicesPage() {
  return (
    <Suspense
      fallback={
        <main className="adm-page">
          <p className="adm-wait">{A.loading}</p>
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
        <p className="adm-wait">{A.noDb}</p>
      </main>
    );
  const { business } = await requireAdmin();
  return <ServicesEditor services={await listServices(query, business.id)} />;
}
