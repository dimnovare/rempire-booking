import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { staffDetail } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { A } from "../../../copy";
import { PrevIcon } from "../../../icons";
import { BarberPage } from "./barber";
import { ProfileForm } from "./forms";

export const metadata = { title: A.staff.title };

export default function StaffDetailPage({ params }: PageProps<"/admin/staff/[id]">) {
  return (
    <Suspense
      fallback={
        <main className="adm-page">
          <p className="adm-wait">{A.loading}</p>
        </main>
      }
    >
      <Detail params={params} />
    </Suspense>
  );
}

function BackToStaff() {
  return (
    <Link className="adm-back" href="/admin/staff">
      <PrevIcon />
      {A.staff.title}
    </Link>
  );
}

async function Detail({ params }: { params: PageProps<"/admin/staff/[id]">["params"] }) {
  if (!dbConfigured())
    return (
      <main className="adm-page">
        <p className="adm-wait">{A.noDb}</p>
      </main>
    );
  const { business } = await requireAdmin();
  const { id } = await params;
  if (id === "new") {
    return (
      <main className="adm-page">
        <BackToStaff />
        <h1 className="adm-h1">{A.staff.add}</h1>
        <ProfileForm id={null} initial={{ name: "", role: { ru: "Барбер", et: "Barber", en: "Barber" }, photoUrl: "", bookable: true, active: true }} />
      </main>
    );
  }
  const today = todayIn(business.timezone);
  const d = await staffDetail(query, business, id, today);
  if (!d) notFound();
  return <BarberPage d={d} tz={business.timezone} today={today} back={<BackToStaff />} />;
}
