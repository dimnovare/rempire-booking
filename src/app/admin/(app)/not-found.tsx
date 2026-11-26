"use client";

/**
 * An admin address we do not have (/admin/<anything>, [...missing]/page.tsx),
 * or a notFound() inside a section (a client, a barber or an invoice that is
 * not there): inside the admin's frame, so the menu stays, with one way on.
 * Without it the bare default page came up, black and in English.
 */
import { useA } from "../lang";

export default function AdminNotFound() {
  const A = useA();
  return (
    <main className="adm-page">
      <title>{`${A.missing.title} · REMPIRE`}</title>
      <div className="adm-card">
        <h1 className="adm-h1">{A.missing.title}</h1>
        <p className="adm-meta">{A.missing.lead}</p>
        <a className="adm-btn adm-btn-lime adm-btn-sm" href="/admin">
          {A.missing.home}
        </a>
      </div>
    </main>
  );
}
