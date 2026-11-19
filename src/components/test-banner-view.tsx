"use client";

/**
 * The «Тестовая версия» line and its «Сообщить о проблеме» sheet
 * (src/components/test-banner.tsx decides whether it shows at all). The
 * admin's sheet and the barber app's are their own, so it looks and closes
 * like every other sheet there.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useA } from "@/app/admin/lang";
import { Sheet } from "@/app/admin/(app)/sheet";
import { useB } from "@/app/b/lang";
import { BSheet } from "@/app/b/(app)/sheet";
import { reportProblemAction, reportsInfoAction } from "./test-banner-actions";

type Words = { line: string; report: string; ask: string; send: string; sent: string; fail: string; tooMany: string };

/** The admin's sidebar has its own «Сообщить о проблеме» (sidebar.tsx): it opens this sheet by this event. */
export const REPORT_EVENT = "adm:report";

export function AdminTestBannerView({ report }: { report: boolean }) {
  const A = useA();
  const [open, setOpen] = useState(false);
  // Renat's way to what came in: in the sheet, so it goes with the line at the move
  const [all, setAll] = useState<number | null>(null);
  useEffect(() => {
    if (open) void reportsInfoAction().then(setAll, () => setAll(null));
  }, [open]);
  useEffect(() => {
    if (!report) return;
    const ask = () => setOpen(true);
    window.addEventListener(REPORT_EVENT, ask);
    return () => window.removeEventListener(REPORT_EVENT, ask);
  }, [report]);
  return (
    <>
      <Line t={A.test} report={report} open={open} onOpen={() => setOpen(true)} />
      {open && (
        <Sheet title={A.test.report} onClose={() => setOpen(false)}>
          <ReportForm app="admin" t={A.test} />
          {all !== null && (
            <p className="adm-meta">
              <a href="/admin/reports">{`${A.test.all} (${all})`}</a>
            </p>
          )}
        </Sheet>
      )}
    </>
  );
}

export function BarberTestBannerView({ report }: { report: boolean }) {
  const B = useB();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Line t={B.test} report={report} open={open} onOpen={() => setOpen(true)} />
      {open && (
        <BSheet title={B.test.report} onClose={() => setOpen(false)}>
          <ReportForm app="b" t={B.test} />
        </BSheet>
      )}
    </>
  );
}

function Line({ t, report, open, onOpen }: { t: Words; report: boolean; open: boolean; onOpen: () => void }) {
  return (
    <div className="test-banner">
      <span>{t.line}</span>
      {report && (
        <button type="button" aria-expanded={open} onClick={onOpen}>
          {t.report}
        </button>
      )}
    </div>
  );
}

/** What went wrong, sent with an explicit «Отправить» (no autosave: a half-typed report is not a report). */
function ReportForm({ app, t }: { app: "admin" | "b"; t: Words }) {
  const path = usePathname();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await reportProblemAction({ app, path, text });
      if (r.ok) {
        setText("");
        setMsg({ ok: true, text: t.sent });
      } else setMsg({ ok: false, text: r.code === "too_many" ? t.tooMany : t.fail });
    } catch {
      setMsg({ ok: false, text: t.fail });
    }
    setBusy(false);
  };

  return (
    <div className="adm-form">
      <label className="adm-field">
        <span>{t.ask}</span>
        <textarea rows={5} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {msg && (
        <p className={msg.ok ? "adm-ok" : "adm-err"} role="status">
          {msg.text}
        </p>
      )}
      <button type="button" className="adm-btn adm-btn-lime" disabled={busy || !text.trim()} onClick={() => void send()}>
        {t.send}
      </button>
    </div>
  );
}
