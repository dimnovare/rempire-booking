"use client";

/**
 * «Уведомления»: two tabs. «Типы уведомлений» is three cards, «Клиенту»,
 * «Администратору», «Сотруднику» (from 1100px the client's on the left,
 * the other two on the right, as the board), each type a row: its switch,
 * its name with when it goes, its channels, and its own page. A switch
 * saves by itself (autosave.tsx). «Каналы отправки» says how each channel
 * goes from here.
 */
import Link from "next/link";
import { useState } from "react";
import type { Transport, TypeRow } from "@/lib/admin/notification-store";
import type { Audience } from "@/lib/admin/notifications";
import { InfoIcon, NextIcon } from "../../icons";
import { useA } from "../../lang";
import { useAutoSave } from "../autosave";
import { Titled } from "../star";
import { saveTypeAction } from "./actions";
import { summary } from "./words";
import "./notifications.css";

type Props = { rows: TypeRow[]; transports: { list: Transport[]; testRun: boolean }; messages: boolean };

export function NotificationsView({ rows, transports, messages }: Props) {
  const A = useA();
  const N = A.notif;
  const [tab, setTab] = useState<"types" | "channels">("types");
  const of = (a: Audience) => rows.filter((r) => r.audience === a);
  return (
    <div className="ntf">
      <div className="adm-page-head">
        <div className="cb-titles">
          <Titled page="notifications">
            <h1 className="adm-h1">{A.nav.notifications}</h1>
          </Titled>
          <p className="cb-crumb only-wide">{N.crumb}</p>
        </div>
      </div>
      <div className="ntf-tabs" role="tablist" aria-label={A.nav.notifications}>
        {(["types", "channels"] as const).map((t) => (
          <button key={t} type="button" role="tab" id={`ntf-tab-${t}`} aria-controls={`ntf-panel-${t}`} aria-selected={tab === t} onClick={() => setTab(t)}>
            {N.tabs[t]}
          </button>
        ))}
      </div>

      {tab === "types" ? (
        <div className="ntf-panel" role="tabpanel" id="ntf-panel-types" aria-labelledby="ntf-tab-types">
          <div className="ntf-cols">
            <div className="ntf-col">
              <Group audience="client" rows={of("client")} />
            </div>
            <div className="ntf-col">
              <Group audience="salon" rows={of("salon")} />
              <Group audience="staff" rows={of("staff")} />
            </div>
          </div>
          <div className="ntf-foot">
            <InfoIcon size={14} />
            <div>
              {N.foot.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="ntf-panel" role="tabpanel" id="ntf-panel-channels" aria-labelledby="ntf-tab-channels">
          <Channels transports={transports} messages={messages} />
        </div>
      )}
    </div>
  );
}

function Group({ audience, rows }: { audience: Audience; rows: TypeRow[] }) {
  const A = useA();
  const N = A.notif;
  const [open, setOpen] = useState(true);
  // the count follows the switches as they are tapped
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [r.key, r.on])));
  const n = rows.filter((r) => on[r.key] ?? r.on).length;
  const id = `ntf-g-${audience}`;
  return (
    <section className="adm-card ntf-group" aria-labelledby={`${id}-h`}>
      {/* the heading holds the button, not the other way round: a button's insides are no headings to a screen reader */}
      <h2 className="ntf-group-t">
        <button type="button" className="ntf-group-h" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          <span className="ntf-group-name" id={`${id}-h`}>
            {N.groups[audience]}
          </span>
          <span className="ntf-count">{N.count(n, rows.length)}</span>
          <svg className="ntf-caret" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M6 15l6-6 6 6" />
          </svg>
        </button>
      </h2>
      {open && (
        <ul className="ntf-list" id={id}>
          {rows.map((r) => (
            <Row key={r.key} row={r} onChange={(v) => setOn((o) => ({ ...o, [r.key]: v }))} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ row, onChange }: { row: TypeRow; onChange: (on: boolean) => void }) {
  const A = useA();
  const N = A.notif;
  const name = N.types[row.key];
  const [on, setOn] = useState(row.on);
  const set = (v: boolean) => {
    setOn(v);
    onChange(v);
  };
  const auto = useAutoSave(on, set, (v) => saveTypeAction(row.key, { on: v }), { label: name });
  return (
    <li className={`ntf-row${on ? "" : " is-off"}`}>
      <input
        type="checkbox"
        role="switch"
        className="cc-sw"
        checked={on}
        disabled={!row.may}
        aria-label={name}
        title={row.may ? undefined : N.readOnly}
        onChange={(e) => set(e.target.checked)}
        onBlur={auto.flush}
      />
      <Link className="ntf-link" href={`/admin/notifications/${row.key}`} prefetch={false}>
        <span className="ntf-name">
          <b>{name}</b>
          {/* what happened to the switch, in its own row: a phone has no box at the bottom (autosave.tsx) */}
          <small role="status">
            {auto.phase === "bad" || auto.phase === "failed" ? (
              <span className="ntf-bad">{auto.phase === "bad" ? auto.text : A.auto.failed}</span>
            ) : auto.phase === "saved" ? (
              <span className="ntf-ok">{A.saved}</span>
            ) : (
              summary(N, row.key, row.channels)
            )}
          </small>
        </span>
        <span className="ntf-chips">
          {row.channels.map((c) => (
            <span key={c.ch} className={`ntf-chip${c.on ? "" : " is-off"}`}>
              {N.ch[c.ch]}
            </span>
          ))}
        </span>
        <NextIcon size={16} />
      </Link>
    </li>
  );
}

function Channels({ transports, messages }: { transports: Props["transports"]; messages: boolean }) {
  const A = useA();
  const N = A.notif;
  return (
    <div className="ntf-tr">
      {transports.testRun && <p className="adm-note ntf-test">{N.tr.test}</p>}
      <ul className="ntf-tr-list">
        {transports.list.map((t) => (
          <li key={t.ch} className="adm-card ntf-tr-card">
            <div className="ntf-tr-head">
              <h2>{N.ch[t.ch]}</h2>
              <span className={`ntf-state is-${t.state}`}>{N.tr.state[t.state]}</span>
            </div>
            <p className="adm-meta">{N.tr.what[t.ch]}</p>
            {t.from && (
              <p className="ntf-from">
                <span>{N.tr.from[t.ch]}</span> <b>{t.from}</b>
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="adm-meta">{N.tr.setup}</p>
      {messages && (
        <Link className="adm-link ntf-log" href="/admin/messages" prefetch={false}>
          {N.tr.log}
        </Link>
      )}
    </div>
  );
}
