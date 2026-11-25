"use client";

/**
 * «Изменения данных»: the change log, as the change log of the tool we
 * follow (docs/altegio-pages.md, «Изменения данных»), in the controls
 * «Записи» uses: 32px, 8px corners, a 1px #e0e3eb line, yellow for
 * «Показать».
 *
 * **From 900px:** the title with its star and the breadcrumb «Отчёты»; the
 * filters (the day of the change, the author, what was changed, the page
 * size and the yellow «Показать»); «Найдено N»; the table: the date, the
 * object (a visit by its time, a client by his name, an invoice by its
 * number…), the author, the action, and «Показать» at the end, which
 * unfolds what changed under the row, field by field, before → after.
 *
 * **A phone:** a card per change, its details under it; the filters in a
 * sheet.
 *
 * The filters are a draft until «Показать»; every question after the
 * page's own first is asked by an action.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { CHANGE_ENTITIES, CHANGE_PAGE_SIZES, type ChangeQuery } from "@/lib/admin/change-filter";
import { isRoleCode, PRESETS } from "@/lib/auth/rights-catalogue";
import type { ChangeList, ChangeRow, ChangeValue } from "@/lib/admin/change-log";
import { FunnelIcon, NextIcon, PrevIcon } from "../../icons";
import { useA } from "../../lang";
import { eur } from "../../copy";
import { Pager } from "../clients/base-actions";
import { Sheet } from "../sheet";
import { Titled } from "../star";
import { listChangesAction } from "./actions";

type Asked = Required<ChangeQuery>;
type Option = { id: string; name: string };

export type ChangesViewProps = {
  initial: ChangeList;
  /** the page's own first question: what `initial` answers */
  first: Asked;
  tz: string;
  /** the logins the author filter picks from */
  authors: Option[];
};

const same = (a: Asked, b: Asked) => JSON.stringify(a) === JSON.stringify(b);

export function ChangesView({ initial, first, tz, authors }: ChangesViewProps) {
  const A = useA();
  const V = A.changes;
  const [draft, setDraft] = useState<Asked>(first);
  const [asked, setAsked] = useState<Asked>(first);
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // the rows whose details are unfolded
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
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
    listChangesAction(asked).then(
      (list) => {
        if (n !== s.seq) return;
        setData(list);
        // a row still listed stays unfolded (the page shown again asks anew)
        setOpen((cur) => new Set(list.rows.map((x) => x.id).filter((id) => cur.has(id))));
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
  const fold = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const when = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const short = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const dayOnly = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" });

  const authorOf = (c: ChangeRow) => (c.author.kind === "login" ? (c.author.name ?? "") : V.authors[c.author.kind]);
  const actionOf = (c: ChangeRow) => V.actions[c.action] ?? c.action;
  /** the object in two lines: what it is, and whose or which */
  const objectOf = (c: ChangeRow): [string, string | null] => {
    const O = V.objects;
    const o = c.object;
    switch (c.entity) {
      case "appointment":
        return [O.visit(o.at == null ? null : short.format(o.at)), o.name];
      case "client":
        return c.entityId ? [o.name || O.client, o.name ? O.client : null] : [O.clientBase, null];
      case "review":
        return [O.review(o.at == null ? null : dayOnly.format(o.at)), o.name];
      case "invoice":
        return [c.entityId ? O.invoice(o.number) : O.invoices, o.name];
      case "business":
        return [O.business, null];
      default: {
        const what = O.kinds[c.entity] ?? c.entity;
        return o.name ? [what, o.name] : [what, null];
      }
    }
  };
  const valueText = (key: string, v: ChangeValue | null): string => {
    if (!v || v.t === "none") return "—";
    if (v.t === "bool") return v.v ? A.yes : V.no;
    if (v.t === "time") return when.format(v.v);
    if (v.t === "money") return eur(v.v);
    if (v.t === "list") return v.v.length ? v.v.map((x) => (key === "changed" ? (V.fields[x] ?? x) : x)).join(", ") : "—";
    if (key === "status") return A.visit.status[v.v] ?? V.statuses[v.v] ?? v.v;
    if (key === "by" || key === "source") return V.byOf[v.v] ?? v.v;
    // a login's role, kept as its code (rights-catalogue.ts): the reader's words for it
    if (key === "role" && isRoleCode(v.v)) return PRESETS[v.v][A.lang];
    return v.v;
  };

  /* ---------- the filters' fields: one set, for a wide screen's form and a phone's sheet ---------- */

  const authorPick = (
    <select aria-label={V.author} value={draft.author} onChange={(e) => set({ author: e.target.value })}>
      <option value="">{V.allAuthors}</option>
      {authors.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
      <option value="client">{V.authors.client}</option>
      <option value="system">{V.systemPick}</option>
    </select>
  );
  const entityPick = (
    <select aria-label={V.entity} value={draft.entity} onChange={(e) => set({ entity: e.target.value })}>
      <option value="">{V.allEntities}</option>
      {CHANGE_ENTITIES.map((k) => (
        <option key={k} value={k}>
          {V.entities[k] ?? k}
        </option>
      ))}
    </select>
  );
  const dateField = (key: "from" | "to") => <input type="date" aria-label={key === "from" ? V.fromLabel : V.toLabel} value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} />;

  const details = (c: ChangeRow) =>
    c.fields.length === 0 ? (
      <p className="chg-none">{V.noDetails}</p>
    ) : (
      <dl className="chg-fields">
        {c.fields.map((f) => (
          <div key={f.key} className="chg-field">
            <dt>{V.fields[f.key] ?? f.key}</dt>
            <dd>
              {f.before && f.after ? (
                <>
                  <s>{valueText(f.key, f.before)}</s>
                  <span aria-hidden="true"> → </span>
                  <span className="sr">{V.became}</span>
                  <b>{valueText(f.key, f.after)}</b>
                </>
              ) : f.after ? (
                <b>{valueText(f.key, f.after)}</b>
              ) : (
                <>
                  <span className="chg-was">{V.was}</span> <s>{valueText(f.key, f.before)}</s>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  const foldButton = (c: ChangeRow, cls: string, at: string) => {
    const isOpen = open.has(c.id);
    const [what] = objectOf(c);
    return (
      <button type="button" className={cls} aria-expanded={isOpen} aria-controls={at} aria-label={isOpen ? V.hideFor(what, when.format(c.at)) : V.showFor(what, when.format(c.at))} onClick={() => fold(c.id)}>
        {isOpen ? V.hide : V.showDetails}
      </button>
    );
  };

  return (
    <div className="rc chg">
      <div className="adm-page-head rc-top">
        <div className="cb-titles">
          <Titled page="changes">
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
          {authorPick}
          {entityPick}
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
              {CHANGE_PAGE_SIZES.map((n) => (
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
              <button type="submit" form="chg-f" className="adm-btn adm-btn-lime">
                {V.show}
              </button>
            }
          >
            <form
              id="chg-f"
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
                <span>{V.author}</span>
                {authorPick}
              </label>
              <label className="adm-field">
                <span>{V.entity}</span>
                {entityPick}
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
            <table className="cl-table rc-table chg-table">
              <thead>
                <tr>
                  <th scope="col">{V.cols.date}</th>
                  <th scope="col">{V.cols.object}</th>
                  <th scope="col">{V.cols.author}</th>
                  <th scope="col">{V.cols.action}</th>
                  <th scope="col">{V.cols.details}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((c) => {
                  const [what, sub] = objectOf(c);
                  return (
                    <Fragment key={c.id}>
                      <tr data-id={c.id} data-entity={c.entity} data-action={c.action} className={open.has(c.id) ? "is-open" : undefined}>
                        <td data-col="date">{when.format(c.at)}</td>
                        <td data-col="object">
                          <b>{what}</b>
                          {sub && <small>{sub}</small>}
                        </td>
                        <td data-col="author">{authorOf(c)}</td>
                        <td data-col="action">{actionOf(c)}</td>
                        <td className="chg-act">{foldButton(c, "jr-btn", `chg-w-${c.id}`)}</td>
                      </tr>
                      {open.has(c.id) && (
                        <tr className="chg-more">
                          <td colSpan={5} id={`chg-w-${c.id}`}>
                            {details(c)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* a phone: a card per change */}
          <ul className="adm-list chg-rows only-narrow">
            {data.rows.map((c) => {
              const [what, sub] = objectOf(c);
              return (
                <li key={c.id} data-id={c.id} data-entity={c.entity} data-action={c.action} className="chg-item">
                  <div className="chg-line">
                    <b>{actionOf(c)}</b>
                    <small>{when.format(c.at)}</small>
                  </div>
                  <p className="chg-what">
                    <span>{what}</span>
                    {sub && <small> · {sub}</small>}
                  </p>
                  <small className="chg-by">{authorOf(c)}</small>
                  {foldButton(c, "adm-btn adm-btn-line adm-btn-sm", `chg-n-${c.id}`)}
                  {open.has(c.id) && <div id={`chg-n-${c.id}`}>{details(c)}</div>}
                </li>
              );
            })}
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
