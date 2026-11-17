import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { staffDetail } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { todayIn } from "@/lib/tz";
import { A } from "../../../copy";
import { DaysForm, HoursForm, OffersForm, ProfileForm, SpecialForm, TimeOffForm } from "./forms";

export const metadata = { title: A.staff.title };

export default function StaffDetailPage({ params }: PageProps<"/admin/staff/[id]">) {
  return (
    <main className="adm-page">
      <Link className="adm-link" href="/admin/staff">
        ‹ {A.staff.title}
      </Link>
      <Suspense fallback={<p className="adm-wait">{A.loading}</p>}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: PageProps<"/admin/staff/[id]">["params"] }) {
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireAdmin();
  const { id } = await params;
  if (id === "new") {
    return (
      <>
        <h1 className="adm-h1">{A.staff.add}</h1>
        <ProfileForm id={null} initial={{ name: "", role: { ru: "Барбер", et: "Barber", en: "Barber" }, photoUrl: "", bookable: true, active: true }} />
      </>
    );
  }
  const today = todayIn(business.timezone);
  const d = await staffDetail(query, business, id, today);
  if (!d) notFound();
  return (
    <>
      <h1 className="adm-h1">{d.name}</h1>
      <section className="adm-section">
        <h2 className="adm-h2">{A.staff.profile}</h2>
        <ProfileForm
          id={d.id}
          initial={{ name: d.name, role: { ru: d.role.ru ?? "", et: d.role.et ?? "", en: d.role.en ?? "" }, photoUrl: d.photoUrl ?? "", bookable: d.bookable, active: d.active }}
        />
      </section>
      <section className="adm-section">
        <h2 className="adm-h2">{A.staff.offers}</h2>
        <OffersForm staffId={d.id} offers={d.offers} />
      </section>
      <section className="adm-section">
        <h2 className="adm-h2">{A.staff.hours}</h2>
        <HoursForm staffId={d.id} hours={d.hours} />
      </section>
      <section className="adm-section">
        <h2 className="adm-h2">{A.staff.overrides}</h2>
        <DaysForm staffId={d.id} overrides={d.overrides} today={today} />
      </section>
      <section className="adm-section">
        <h2 className="adm-h2">{A.staff.timeOff}</h2>
        <TimeOffForm staffId={d.id} rows={d.timeOff} tz={business.timezone} today={today} />
      </section>
      <section className="adm-section">
        <h2 className="adm-h2">{A.staff.special}</h2>
        <SpecialForm staffId={d.id} rows={d.special} tz={business.timezone} today={today} />
      </section>
    </>
  );
}
