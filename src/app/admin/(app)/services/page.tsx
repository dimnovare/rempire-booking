/**
 * /admin/services: «Категории услуг» (breadcrumb «Услуги»; Dim, round 13)
 * as the table of the admin we follow (Dim, decisions round 11; the boards
 * «Услуги, таблица» and «Услуга, окно»).
 * The categories fold, each service is a row, and a service opens in a
 * 900px window from the right (a full-screen sheet on a phone), where each
 * barber's own price and time are set.
 *
 * /admin/services?open=<id>   opens that service's window (the barber page links here)
 *
 * What the login may change comes with the page (`may`), by its rights
 * (src/lib/auth/rights.ts); the server asks them again on every change.
 */
import { Suspense } from "react";
import { servicesBoard } from "@/lib/admin/services";
import { requireAdmin } from "@/lib/auth/current";
import { can, canGroup } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { NoRights } from "../no-rights";
import { ServicesTable } from "./table";

export default function ServicesPage({ searchParams }: PageProps<"/admin/services">) {
  return (
    <Suspense
      fallback={
        <main className="adm-page">
          <Wait />
        </main>
      }
    >
      <Loaded searchParams={searchParams} />
    </Suspense>
  );
}

async function Loaded({ searchParams }: Pick<PageProps<"/admin/services">, "searchParams">) {
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
  const [board, sp] = await Promise.all([servicesBoard(query, business.id), searchParams]);
  const open = typeof sp?.open === "string" && board.services.some((s) => s.id === sp.open) ? sp.open : null;
  const edit = can(user, "services.edit");
  return (
    <ServicesTable
      board={board}
      initialOpen={open}
      may={{
        create: can(user, "services.create") && edit,
        edit,
        name: edit && can(user, "services.edit.name"),
        // «Категория услуги»: a service's category, a new one, a category's pencil
        category: edit && can(user, "services.edit.category"),
        price: edit && can(user, "services.edit.price"),
        online: edit && can(user, "services.edit.online"),
        off: edit && can(user, "services.delete"),
        staff: can(user, "services.staff"),
      }}
    />
  );
}
