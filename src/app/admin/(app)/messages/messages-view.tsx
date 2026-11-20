"use client";

/**
 * «Сообщения»: every message the app sends, as the messages report of the
 * tool we follow (docs/altegio-pages.md, «Сообщения»), in the controls
 * «Записи» uses: 32px, 8px corners, a 1px #e0e3eb line, yellow for
 * «Показать».
 *
 * **From 900px:** the title with its star and the breadcrumb «Отчёты»; the
 * filters (the day it was queued, the type, the status, the channel, a
 * search by the recipient, the page size and the yellow «Показать»);
 * «Найдено N»; the table: the date, the contact (the client's card when
 * he is known, the phone or e-mail under the name), what it said, its type,
 * its status with the time of it, its channel with the service that carried
 * it.
 *
 * **A phone:** a card per message, the filters in a sheet.
 *
 * The filters are a draft until «Показать»; every question after the
 * page's own first is asked by an action.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MESSAGE_CHANNELS, MESSAGE_KIND_GROUPS, MESSAGE_PAGE_SIZES, MESSAGE_Q_MAX, MESSAGE_STATUSES, type MessageQuery } from "@/lib/admin/message-filter";
import type { MessageList, MessageRow, MessagesMay } from "@/lib/admin/message-log";
import { FunnelIcon, NextIcon, PrevIcon } from "../../icons";
import { useA } from "../../lang";
import { Pager } from "../clients/base-actions";
import { Sheet } from "../sheet";
import { Titled } from "../star";
import { listMessagesAction } from "./actions";

type Asked = Required<MessageQuery>;

export type MessagesViewProps = {
  initial: MessageList;
  /** the page's own first question: what `initial` answers */
  first: Asked;
  tz: string;
  may: MessagesMay;
};

const same = (a: Asked, b: Asked) => JSON.stringify(a) === JSON.stringify(b);

export function MessagesView({ initial, first, tz, may }: MessagesViewProps) {
  const A = useA();
  const V = A.messages;
  const [draft, setDraft] = useState<Asked>(first);
  const [asked, setAsked] = useState<Asked>(first);
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const r = useRef({ seq: 0, started: false });

  // the server sent the first page anew: that is the list while the question is still the page's own
  const [sent, setSent] = useState(initial);
  if (sent !== initial) {
    setSent(initial);
    if (same(asked, first)) setData(initial);
  }

  useEffect(() => {
    const s = r.current;
    // the first page came with the page; every later run asks (a new question, or the page shown again)
    if (!s.started) {
      s.started = true;
      return;
    }
    const n = ++s.seq;
    setBusy(true);
    listMessagesAction(asked).then(
      (list) => {
        if (n !== s.seq) return;
        setData(list);
        setBusy(false);
        setFailed(false);
      },
      () => {
        if (n !== s.seq) return;
        setBusy(false);
        setFailed(true);
      },
    );
    return () => {
      s.seq++;
    };
  }, [asked]);

  const show = () => {
    setFiltersOpen(false);
    setAsked({ ...draft, page: 1 });
  };
  const turnPage = (page: number) => {
    setAsked({ ...asked, page });
    window.scrollTo({ top: 0 });
  };
  const set = (patch: Partial<Asked>) => setDraft((cur) => ({ ...cur, ...patch }));

  const when = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const short = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const kindOf = (m: MessageRow) => V.kinds[m.kind] ?? m.kind;
  const statusOf = (m: MessageRow) => V.statuses[m.status] ?? m.status;
  const statusTime = (m: MessageRow) => (m.statusAt == null ? "" : m.status === "queued" || m.status === "sending" ? V.due(short.format(m.statusAt)) : short.format(m.statusAt));
  const channelOf = (m: MessageRow) => V.channels[m.channel] ?? m.channel;
  const carrier = (m: MessageRow) => [m.provider ? (V.providers[m.provider] ?? m.provider) : "", m.channel === "sms" && m.segments && m.segments > 1 ? V.parts(m.segments) : ""].filter(Boolean).join(" · ");
  const nameOf = (m: MessageRow) => m.name || (m.toStaff ? V.someLogin : V.noName);

  /* ---------- the filters' fields: one set, for a wide screen's form and a phone's sheet ---------- */

  const kindPick = (
    <select aria-label={V.kind} value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
      <option value="">{V.allKinds}</option>
      {MESSAGE_KIND_GROUPS.map((g) => (
        <optgroup key={g.key} label={V.groups[g.key]}>
          {g.kinds.map((k) => (
            <option key={k} value={k}>
              {V.kinds[k] ?? k}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
  const statusPick = (
    <select aria-label={V.status} value={draft.status} onChange={(e) => set({ status: e.target.value })}>
      <option value="">{V.allStatuses}</option>
      {MESSAGE_STATUSES.map((k) => (
        <option key={k} value={k}>
          {V.statuses[k]}
        </option>
      ))}
    </select>
  );
  const channelPick = (
    <select aria-label={V.channel} value={draft.channel} onChange={(e) => set({ channel: e.target.value })}>
      <option value="">{V.allChannels}</option>
      {MESSAGE_CHANNELS.map((k) => (
        <option key={k} value={k}>
          {V.channels[k]}
        </option>
      ))}
    </select>
  );
  const searchField = (
    <input
      type="search"
      enterKeyHint="search"
      autoComplete="off"
      maxLength={MESSAGE_Q_MAX}
      aria-label={V.search}
      placeholder={may.phones ? V.searchPh : V.searchPhNames}
      value={draft.q}
      onChange={(e) => set({ q: e.target.value })}
    />
  );
  const dateField = (key: "from" | "to") => <input type="date" aria-label={key === "from" ? V.fromLabel : V.toLabel} value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} />;

  const who = (m: MessageRow) =>
    m.clientId ? (
      <Link href={`/admin/clients/${m.clientId}`} prefetch={false} aria-label={V.openClient(nameOf(m))}>
        {nameOf(m)}
      </Link>
    ) : (
      <span>{nameOf(m)}</span>
    );
  const contactLine = (m: MessageRow) => m.contact ?? (m.toStaff ? V.toApp : V.toPhone);
  /** what it said; a login code never shows more than that it was one */
  const said = (m: MessageRow) =>
    m.kind === "login_code" ? (
      <small>{V.codeHidden}</small>
    ) : m.content ? (
      <span>{m.content}</span>
    ) : m.visitAt != null ? (
      <span>{V.aboutVisit(short.format(m.visitAt), m.staffName)}</span>
    ) : (
      <small>—</small>
    );

  return (
    <div className="rc msg">
      <div className="adm-page-head rc-top">
        <div className="cb-titles">
          <Titled page="messages">
            <h1 className="adm-h1">{V.title}</h1>
          </Titled>
          <p className="cb-crumb only-wide">{V.crumb}</p>
        </div>
        <button type="button" className="adm-btn adm-btn-line adm-btn-sm only-narrow" onClick={() => setFiltersOpen(true)}>
          <FunnelIcon />
          {V.filters}
        </button>
      </div>

      <form
        className="rc-filters only-wide"
        role="search"
        aria-label={V.filters}
        onSubmit={(e) => {
          e.preventDefault();
          show();
        }}
      >
        <div className="rc-dates">
          <b>{V.period}</b>
          <label className="rc-date">
            <span>{V.from}</span>
            {dateField("from")}
          </label>
          <label className="rc-date">
            <span>{V.to}</span>
            {dateField("to")}
          </label>
        </div>
        <div className="rc-grid">
          {kindPick}
          {statusPick}
          {channelPick}
          {searchField}
        </div>
        <div className="rc-run">
          <label className="rc-size">
            <select
              aria-label={V.perPageLabel}
              value={draft.size}
              onChange={(e) => {
                // how many a page is no filter: it applies at once, to the question as it was last asked
                const size = Number(e.target.value);
                set({ size });
                setAsked({ ...asked, size, page: 1 });
              }}
            >
              {MESSAGE_PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>{V.perPage}</span>
          </label>
          <button type="submit" className="jr-btn jr-main rc-show">
            {V.show}
          </button>
        </div>
      </form>

      {filtersOpen && (
        <div className="only-narrow">
          <Sheet
            title={V.filters}
            onClose={() => setFiltersOpen(false)}
            bar={
              <button type="submit" form="msg-f" className="adm-btn adm-btn-lime">
                {V.show}
              </button>
            }
          >
            <form
              id="msg-f"
              className="adm-form"
              onSubmit={(e) => {
                e.preventDefault();
                show();
              }}
            >
              <div className="adm-row">
                <label className="adm-field">
                  <span>{V.fromLabel}</span>
                  {dateField("from")}
                </label>
                <label className="adm-field">
                  <span>{V.toLabel}</span>
                  {dateField("to")}
                </label>
              </div>
              <label className="adm-field">
                <span>{V.kind}</span>
                {kindPick}
              </label>
              <label className="adm-field">
                <span>{V.status}</span>
                {statusPick}
              </label>
              <label className="adm-field">
                <span>{V.channel}</span>
                {channelPick}
              </label>
              <label className="adm-field">
                <span>{V.search}</span>
                {searchField}
              </label>
            </form>
          </Sheet>
        </div>
      )}

      <p className={`rc-found${failed ? " is-bad" : ""}`} role="status">
        {failed ? (
          A.error
        ) : (
          <>
            <span>{V.found}</span>
            <b>{data.total}</b>
          </>
        )}
      </p>

      {data.total === 0 ? (
        <p className="adm-meta rc-none">{V.none}</p>
      ) : (
        <div className={`rc-list${busy ? " is-busy" : ""}`}>
          <div className="cl-card rc-sheet only-wide">
            <table className="cl-table rc-table msg-table">
              <thead>
                <tr>
                  <th scope="col">{V.cols.date}</th>
                  <th scope="col">{V.cols.contact}</th>
                  <th scope="col">{V.cols.content}</th>
                  <th scope="col">{V.cols.kind}</th>
                  <th scope="col">{V.cols.status}</th>
                  <th scope="col">{V.cols.channel}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((m) => (
                  <tr key={m.id} data-id={m.id} data-kind={m.kind} data-status={m.status}>
                    <td data-col="date">{when.format(m.createdAt)}</td>
                    <td data-col="contact">
                      {who(m)}
                      <small>{contactLine(m)}</small>
                    </td>
                    <td data-col="content" className="msg-said">
                      {said(m)}
                    </td>
                    <td data-col="kind">{kindOf(m)}</td>
                    <td data-col="status">
                      <span className={`msg-st is-${m.status}`}>{statusOf(m)}</span>
                      {statusTime(m) && <small>{statusTime(m)}</small>}
                    </td>
                    <td data-col="channel">
                      <span>{channelOf(m)}</span>
                      {carrier(m) && <small>{carrier(m)}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* a phone: a card per message */}
          <ul className="adm-list msg-rows only-narrow">
            {data.rows.map((m) => (
              <li key={m.id} data-id={m.id} data-kind={m.kind} data-status={m.status} className="msg-item">
                <div className="msg-line">
                  <b>{kindOf(m)}</b>
                  <small>{when.format(m.createdAt)}</small>
                </div>
                <p className="msg-who">
                  {who(m)} <small>{contactLine(m)}</small>
                </p>
                <div className="msg-said">{said(m)}</div>
                <p className="msg-meta">
                  <span className={`msg-st is-${m.status}`}>{statusOf(m)}</span>
                  <small>{[statusTime(m), channelOf(m), carrier(m)].filter(Boolean).map((t) => ` · ${t}`).join("")}</small>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.pages > 1 && (
        <>
          <div className="rc-pager only-wide">
            <Pager page={data.page} pages={data.pages} busy={busy} onTurn={turnPage} />
          </div>
          <nav className="cl-pages only-narrow" aria-label={A.clients.pages}>
            <button type="button" className="adm-btn adm-btn-line adm-btn-sm" disabled={data.page <= 1 || busy} onClick={() => turnPage(data.page - 1)}>
              <PrevIcon size={16} />
              {A.clients.prev}
            </button>
            <span>{A.clients.page(data.page, data.pages)}</span>
            <button type="button" className="adm-btn adm-btn-line adm-btn-sm" disabled={data.page >= data.pages || busy} onClick={() => turnPage(data.page + 1)}>
              {A.clients.next}
              <NextIcon size={16} />
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
