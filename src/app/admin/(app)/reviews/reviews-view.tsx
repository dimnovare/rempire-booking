"use client";

/**
 * «Отзывы»: the clients' reviews, as the reviews report of the tool we
 * follow (docs/altegio-pages.md, «Отзывы»), in the controls «Записи» uses:
 * 32px, 8px corners, a 1px #e0e3eb line, yellow for «Показать».
 *
 * **From 900px:** the title with its star and the breadcrumb «Отчёты»; the
 * filters (the review's dates, about whom: every review, «О компании» or a
 * barber, the rating, on the booking page or hidden, the page size and the
 * yellow «Показать»); «Найдено N» with the average; the table: date,
 * client (his card when he is known, the phone under the name), the
 * barber, five stars, the text, and «Скрыть» / «Показать» at the end.
 *
 * **A phone:** a card per review, the filters in a sheet.
 *
 * «Скрыть» is ours for the tool's «Удалить»: the review leaves the booking
 * page and the barber's average, and stays here, pale, to be shown again.
 * The filters are a draft until «Показать»; every question after the
 * page's own first is asked by an action.
 *
 * A review a client sent from the salon's page (salon-review.tsx) waits
 * here, first in the list with «Новый», until it is looked at: «Одобрить»
 * puts it on the booking page, «Скрыть» keeps it off. Over the list, «N
 * новых отзывов ждут проверки» and «Показать новые» while any wait.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { REVIEW_COMPANY, REVIEW_PAGE_SIZES, REVIEW_SHOWN, type ReviewQuery } from "@/lib/admin/review-filter";
import type { ReviewList, ReviewRow, ReviewsMay } from "@/lib/reviews";
import { Ava, FunnelIcon, NextIcon, PrevIcon } from "../../icons";
import { useA } from "../../lang";
import { Pager } from "../clients/base-actions";
import { useFrame } from "../frame";
import { Sheet } from "../sheet";
import { StarShape, Titled } from "../star";
import { listReviewsAction, setReviewHiddenAction } from "./actions";
import "./moderation.css";

type Asked = Required<ReviewQuery>;
type Option = { id: string; name: string };

export type ReviewsViewProps = {
  initial: ReviewList;
  /** the page's own first question: what `initial` answers */
  first: Asked;
  tz: string;
  may: ReviewsMay;
  /** the barbers the filter picks from */
  staff: Option[];
};

const same = (a: Asked, b: Asked) => JSON.stringify(a) === JSON.stringify(b);

/** Five stars, as many lit as the rating; the number is for a screen reader. */
function Stars({ n, label }: { n: number; label: string }) {
  return (
    <span className="rv-stars" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? "is-on" : undefined}>
          <StarShape filled size={14} />
        </span>
      ))}
    </span>
  );
}

export function ReviewsView({ initial, first, tz, may, staff }: ReviewsViewProps) {
  const A = useA();
  const V = A.reviews;
  const frame = useFrame();
  const [draft, setDraft] = useState<Asked>(first);
  const [asked, setAsked] = useState<Asked>(first);
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // the review whose «Скрыть» / «Показать» is on its way
  const [turning, setTurning] = useState<string | null>(null);
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
    listReviewsAction(asked).then(
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

  const hide = async (v: ReviewRow, hidden: boolean) => {
    setTurning(v.id);
    try {
      const res = await setReviewHiddenAction(v.id, hidden);
      if (res.ok) {
        // a new one looked at is new no more, either way
        setData((cur) => ({
          ...cur,
          waiting: v.pending ? Math.max(0, cur.waiting - 1) : cur.waiting,
          rows: cur.rows.map((x) => (x.id === v.id ? { ...x, hidden: res.hidden, pending: false } : x)),
        }));
        frame.say(v.pending ? (res.hidden ? V.declined : V.approved) : res.hidden ? V.hidden : V.unhidden);
      } else frame.say(res.code === "forbidden" ? A.rights.none : A.error, true);
    } catch {
      frame.say(A.error, true);
    }
    setTurning(null);
  };

  const day = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" });
  const one = new Intl.NumberFormat(A.intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nameOf = (v: ReviewRow) => v.authorName || V.noName;
  const aboutOf = (v: ReviewRow) => (v.staffName ? V.about(v.staffName) : V.aboutCompany);

  /* ---------- the filters' fields: one set, for a wide screen's form and a phone's sheet ---------- */

  const staffPick = (
    <select aria-label={V.staff} value={draft.staffId} onChange={(e) => set({ staffId: e.target.value })}>
      <option value="">{V.allReviews}</option>
      <option value={REVIEW_COMPANY}>{V.company}</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
  const ratingPick = (
    <select aria-label={V.rating} value={draft.rating} onChange={(e) => set({ rating: e.target.value })}>
      <option value="">{V.anyRating}</option>
      {[5, 4, 3, 2, 1].map((n) => (
        <option key={n} value={String(n)}>
          {V.stars(n)}
        </option>
      ))}
    </select>
  );
  const shownPick = (
    <select aria-label={V.shown} value={draft.shown} onChange={(e) => set({ shown: e.target.value })}>
      {REVIEW_SHOWN.map((k) => (
        <option key={k} value={k}>
          {V.shownOf[k]}
        </option>
      ))}
    </select>
  );
  const dateField = (key: "from" | "to") => <input type="date" aria-label={key === "from" ? V.fromLabel : V.toLabel} value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} />;

  // the new ones alone, from the line over the list
  const showWaiting = () => {
    setDraft((cur) => ({ ...cur, shown: "pending" }));
    setAsked({ ...asked, shown: "pending", page: 1 });
  };
  const tagOf = (v: ReviewRow) =>
    v.pending ? <small className="rv-tag rv-new">{V.newTag}</small> : v.hidden ? <small className="rv-tag">{V.hiddenTag}</small> : null;
  const rowClass = (v: ReviewRow) => (v.pending ? "is-new" : v.hidden ? "is-hidden" : "");
  /** A new one: «Одобрить» and «Скрыть»; any other: «Скрыть» or «Показать». `wide` is the table's look, else a phone's. */
  const actsOf = (v: ReviewRow, at: string, wide: boolean) => {
    const line = wide ? "jr-btn" : "adm-btn adm-btn-line adm-btn-sm";
    if (!v.pending)
      return (
        <button type="button" className={line} aria-label={v.hidden ? V.unhideFor(nameOf(v), at) : V.hideFor(nameOf(v), at)} disabled={turning === v.id} onClick={() => void hide(v, !v.hidden)}>
          {v.hidden ? V.unhide : V.hide}
        </button>
      );
    return (
      <span className="rv-acts">
        <button type="button" className={wide ? "jr-btn jr-main" : "adm-btn adm-btn-lime adm-btn-sm"} aria-label={V.approveFor(nameOf(v), at)} disabled={turning === v.id} onClick={() => void hide(v, false)}>
          {V.approve}
        </button>
        <button type="button" className={line} aria-label={V.declineFor(nameOf(v), at)} disabled={turning === v.id} onClick={() => void hide(v, true)}>
          {V.hide}
        </button>
      </span>
    );
  };

  const clientOf = (v: ReviewRow) =>
    v.clientId ? (
      <Link href={`/admin/clients/${v.clientId}`} prefetch={false} aria-label={V.openClient(nameOf(v))}>
        {nameOf(v)}
      </Link>
    ) : (
      <span>{nameOf(v)}</span>
    );

  return (
    <div className="rc rv">
      <div className="adm-page-head rc-top">
        <div className="cb-titles">
          <Titled page="reviews">
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
          {staffPick}
          {ratingPick}
          {shownPick}
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
              {REVIEW_PAGE_SIZES.map((n) => (
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
              <button type="submit" form="rv-f" className="adm-btn adm-btn-lime">
                {V.show}
              </button>
            }
          >
            <form
              id="rv-f"
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
                <span>{V.staff}</span>
                {staffPick}
              </label>
              <label className="adm-field">
                <span>{V.rating}</span>
                {ratingPick}
              </label>
              <label className="adm-field">
                <span>{V.shown}</span>
                {shownPick}
              </label>
            </form>
          </Sheet>
        </div>
      )}

      <div className="rv-sum">
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
        {!failed && data.average != null && (
          <p className="rv-avg">
            <Stars n={Math.round(data.average)} label={V.average(one.format(data.average))} />
            <span aria-hidden="true">{V.average(one.format(data.average))}</span>
          </p>
        )}
      </div>

      {!failed && data.waiting > 0 && asked.shown !== "pending" && (
        <p className="rv-waiting" role="status">
          <span>{V.waiting(data.waiting)}</span>
          <button type="button" className="adm-link" onClick={showWaiting}>
            {V.showWaiting}
          </button>
        </p>
      )}

      {data.total === 0 ? (
        <p className="adm-meta rc-none">{V.none}</p>
      ) : (
        <div className={`rc-list${busy ? " is-busy" : ""}`}>
          <div className="cl-card rc-sheet only-wide">
            <table className="cl-table rc-table rv-table">
              <thead>
                <tr>
                  <th scope="col">{V.cols.date}</th>
                  <th scope="col">{V.cols.client}</th>
                  <th className="rc-ava" />
                  <th scope="col">{V.cols.staff}</th>
                  <th scope="col">{V.cols.rating}</th>
                  <th scope="col">{V.cols.text}</th>
                  {may.hide && <th className="rv-act" />}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((v) => {
                  const at = day.format(v.createdAt);
                  return (
                    <tr key={v.id} data-id={v.id} className={rowClass(v) || undefined}>
                      <td data-col="date">
                        <span>{at}</span>
                        <small>{V.sources[v.source] ?? v.source}</small>
                      </td>
                      <td data-col="client">
                        {clientOf(v)}
                        {v.clientPhone && <small>{v.clientPhone}</small>}
                      </td>
                      <td className="rc-ava">{v.staffName && <Ava src={v.staffPhoto} name={v.staffName} className="rc-photo" />}</td>
                      <td data-col="staff">{v.staffName ? <b>{v.staffName}</b> : <span>{V.company}</span>}</td>
                      <td data-col="rating">
                        <Stars n={v.rating} label={V.rated(v.rating)} />
                        {tagOf(v)}
                      </td>
                      <td data-col="text" className="rv-text">
                        {v.body ? <span>{v.body}</span> : <small>{V.noText}</small>}
                      </td>
                      {may.hide && <td className="rv-act">{actsOf(v, at, true)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* a phone: a card per review */}
          <ul className="adm-list rv-rows only-narrow">
            {data.rows.map((v) => {
              const at = day.format(v.createdAt);
              return (
                <li key={v.id} data-id={v.id} className={`rv-item ${rowClass(v)}`.trim()}>
                  <div className="rv-line">
                    <Stars n={v.rating} label={V.rated(v.rating)} />
                    <small>{at}</small>
                    {tagOf(v)}
                  </div>
                  <p className="rv-who">
                    <b>{clientOf(v)}</b> <small>{aboutOf(v)}</small>
                  </p>
                  {v.clientPhone && <small>{v.clientPhone}</small>}
                  {v.body && <p className="rv-body">{v.body}</p>}
                  {may.hide && actsOf(v, at, false)}
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
