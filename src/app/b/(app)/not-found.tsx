"use client";

/**
 * A barber app address we do not have (/b/<anything>, [...missing]/page.tsx),
 * or a notFound() inside it: in the app's frame, with the way back to his day.
 * Without it the bare default page came up, black and in English.
 */
import { useB } from "../lang";

export default function BarberNotFound() {
  const B = useB();
  return (
    <main className="adm-page">
      <title>{`${B.missing.title} · REMPIRE`}</title>
      <div className="adm-card">
        <h1 className="adm-h1">{B.missing.title}</h1>
        <p className="adm-meta">{B.missing.lead}</p>
        <a className="adm-btn adm-btn-lime adm-btn-sm" href="/b">
          {B.missing.home}
        </a>
      </div>
    </main>
  );
}
