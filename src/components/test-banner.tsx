/**
 * The «Тестовая версия» line (docs/test-run.md): on every staging screen of
 * the client pages, the admin and the barber app, gone at the move
 * (src/lib/test-run.ts: ALLOW_INDEXING=yes).
 *
 * In the admin and /b it is the first thing in the shell: admin.css gives
 * `.test-banner` its place (sticky above the top bar, 36px plus the notch)
 * and its look (the «test line» block at the end). With `report` it holds
 * «Сообщить о проблеме»; the login screens get the line alone.
 *
 * A sync server wrapper: it reads only the switch, so a layout can hold it
 * without waiting for the request; the words come from useA()/useB().
 */
import type { CSSProperties } from "react";
import type { Locale } from "@/lib/i18n";
import { testRun } from "@/lib/test-run";
import { AdminTestBannerView, BarberTestBannerView } from "./test-banner-view";

export function TestBanner({ app, report = false }: { app: "admin" | "b"; report?: boolean }) {
  if (!testRun()) return null;
  return app === "b" ? <BarberTestBannerView report={report} /> : <AdminTestBannerView report={report} />;
}

const LINE: Record<Locale, string> = { ru: "Тестовая версия", et: "Testversioon", en: "Test version" };

/** The client pages have no admin.css: their line carries its own look. */
const CLIENT: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "4px 12px",
  background: "#f5c400",
  color: "#000",
  font: "600 13px/1.2 var(--font-body), system-ui, sans-serif",
  letterSpacing: "0.02em",
};

/** The client pages: the line only (clients don't report; the testers do it from their app). */
export function ClientTestBanner({ locale }: { locale: Locale }) {
  if (!testRun()) return null;
  return (
    <div className="test-banner" style={CLIENT}>
      {LINE[locale]}
    </div>
  );
}
