import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { listReports } from "@/lib/problem-reports";
import { testRun } from "@/lib/test-run";
import { Title, Wait } from "../../lang";
import { getA } from "../../lang-server";
import { DoneButton } from "./done";

/**
 * What the testers sent with «Сообщить о проблеме» (docs/test-run.md):
 * Renat's, and Claude's, to read the test run back. Staging only; owner
 * only. The banner links here (src/components/test-banner.tsx).
 */
export default function ReportsPage() {
  return (
    <main className="adm-page">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { business } = await requireOwner();
  if (!testRun()) notFound();
  const reports = await listReports(query, business.id);
  const when = new Intl.DateTimeFormat(A.intl, { timeZone: business.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <>
      <Title text={A.test.reports} />
      <h1 className="adm-h1">{A.test.reports}</h1>
      <p className="adm-meta">{A.test.reportsLead}</p>
      {reports.length === 0 ? (
        <p className="adm-meta">{A.test.none}</p>
      ) : (
        <ul className="adm-list" data-reports="">
          {reports.map((r) => (
            <li key={r.id} className="adm-card" data-report={r.id} style={{ display: "grid", gap: 6, opacity: r.doneAt ? 0.55 : 1 }}>
              <div className="adm-who-row">
                <b>{r.email || A.test.noLogin}</b>
                <span className="adm-tag">{r.app === "b" ? "/b" : "admin"}</span>
                {r.doneAt && <span className="adm-tag lime">{A.test.doneTag}</span>}
              </div>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{r.text}</p>
              <small className="adm-meta">
                {when.format(new Date(r.createdAt))} · {A.test.screen} <code>{r.path || "/"}</code>
                {r.userAgent ? ` · ${r.userAgent.slice(0, 120)}` : ""}
              </small>
              <div>
                <DoneButton id={r.id} done={r.doneAt !== null} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
