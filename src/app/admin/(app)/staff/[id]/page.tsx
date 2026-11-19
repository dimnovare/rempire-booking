import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { staffDetail } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { can, canGroup } from "@/lib/auth/rights";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import type { Copy } from "../../../copy";
import { PrevIcon } from "../../../icons";
import { Wait } from "../../../lang";
import { getA } from "../../../lang-server";
import { NoRights } from "../../no-rights";
import { BarberPage } from "./barber";
import { ProfileForm } from "./forms";

export default function StaffDetailPage({ params }: PageProps<"/admin/staff/[id]">) {
  return (
    <Suspense
      fallback={
        <main className="adm-page adm-wide">
          <Wait />
        </main>
      }
    >
      <Detail params={params} />
    </Suspense>
  );
}

/** Back to the list: only a phone needs it, a wide screen has the list on the left. */
function BackToStaff({ A }: { A: Copy }) {
  return (
    <Link className="adm-back only-narrow" href="/admin/staff">
      <PrevIcon />
      {A.staff.title}
    </Link>
  );
}

async function Detail({ params }: { params: PageProps<"/admin/staff/[id]">["params"] }) {
  const A = await getA();
  if (!dbConfigured())
    return (
      <main className="adm-page">
        <p className="adm-wait">{A.noDb}</p>
      </main>
    );
  const { user, business } = await requireAdmin();
  const { id } = await params;
  // the section «Сотрудники»; a new barber is «Создание сотрудников»
  if (!canGroup(user, "staff") || (id === "new" && !can(user, "staff.create")))
    return (
      <main className="adm-page">
        <NoRights />
      </main>
    );
  if (id === "new") {
    return (
      <main className="adm-page adm-wide">
        <BackToStaff A={A} />
        <h1 className="adm-h1">{A.staff.add}</h1>
        <div className="adm-card-narrow">
          <ProfileForm id={null} initial={{ name: "", role: { ru: "Барбер", et: "Barber", en: "Barber" }, photoUrl: "", bookable: true, active: true }} />
        </div>
      </main>
    );
  }
  const today = todayIn(business.timezone);
  const d = await staffDetail(query, business, id, today);
  if (!d) notFound();
  // his own app is «Мой день»; another barber's opens with the right to see his column
  const app = d.id !== user.staffId && can(user, "journal.staff", { staffId: d.id });
  return <BarberPage key={d.id} d={d} tz={business.timezone} today={today} back={<BackToStaff A={A} />} app={app} />;
}
