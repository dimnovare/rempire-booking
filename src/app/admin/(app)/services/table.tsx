"use client";

/**
 * «Услуги» as the table of the admin we follow (Dim, decisions round 11;
 * the board «Услуги, таблица»).
 *
 * - **Head:** the title with its star and the breadcrumb; one search field
 *   «Название услуги» across the page and the yellow «Добавить услугу».
 * - **Categories:** a grey 56px head each («Барберинг · 6 услуг»), a pencil
 *   that renames it in place and a chevron that folds it; what is folded is
 *   kept for the browser tab. Services without one stand under «Без
 *   категории». A search unfolds everything and leaves out what does not
 *   match.
 * - **A row (52px):** Название · Онлайн-запись (a switch that writes at
 *   once) · Цена (a click edits the base price in place; «от 35 €» when the
 *   barbers' prices differ) · Длительность («Индивидуально» when their
 *   times differ) · Сотрудники (a dark tile with the initial for each who
 *   does it, «+1» past four) · a pencil. A click on the row opens the
 *   service's window (window.tsx), and the open row is outlined in yellow.
 * - **A phone:** the same groups; a row is the name with its price and
 *   time under it and the switch; a tap opens the window as a full-screen
 *   sheet.
 *
 * Not here: drag to reorder (the list had no ordering before; the order is
 * the services' own), «Операции с Excel» (there is no export of services),
 * the columns «Тех. перерыв» and «Технологическая карта».
 */
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import type { BoardService, ServicesBoard } from "@/lib/admin/services";
import { useA } from "../../lang";
import { CaretIcon, PencilIcon, PlusIcon, SearchIcon } from "../../icons";
import { Titled } from "../star";
import { useTabState } from "../tab-state";
import { renameCategoryAction, setOnlineAction, setPriceAction } from "./actions";
import { fromCents, initial, matches, priceText, rowSum, timeText, toCents } from "./labels";
import { ServiceWindow, type May } from "./window";
import "./services.css";

const NONE = "none";
const NEW = "new";
const FOLD_KEY = "adm-svc-folded";

export function ServicesTable({ board, initialOpen, may }: { board: ServicesBoard; initialOpen: string | null; may: May }) {
  const A = useA();
  const S = A.services;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(initialOpen);
  const [err, setErr] = useState<string | null>(null);
  const [foldedRaw, setFolded] = useTabState(FOLD_KEY, "");
  const folded = useMemo(() => new Set(foldedRaw.split(",").filter(Boolean)), [foldedRaw]);
  const [, startTransition] = useTransition();
  // the switch moves at once; the page that comes back with the action says what was saved
  const [onlineNow, setOnlineNow] = useOptimistic<Record<string, boolean>, [string, boolean]>({}, (cur, [id, v]) => ({ ...cur, [id]: v }));

  // the address keeps «?open=» only while that window is open: a reload after it is closed opens nothing
  useEffect(() => {
    if (open === null && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("open")) window.history.replaceState(null, "", window.location.pathname);
  }, [open]);

  const groups = useMemo(() => {
    const known = new Set(board.categories.map((c) => c.id));
    const of = (key: string) => board.services.filter((s) => (key === NONE ? !s.categoryId || !known.has(s.categoryId) : s.categoryId === key));
    const all = [...board.categories.map((c) => ({ key: c.id, name: A.pick(c.name) || S.noCategory, cat: c })), { key: NONE, name: S.noCategory, cat: null }];
    return all
      .map((g) => {
        const services = of(g.key);
        return { ...g, total: services.length, services: services.filter((s) => matches(s, q)) };
      })
      .filter((g) => g.total > 0 && (!q.trim() || g.services.length > 0));
  }, [board, q, A, S]);

  const current = open && open !== NEW ? board.services.find((s) => s.id === open) : undefined;
  const fold = (key: string, on: boolean) => {
    const next = new Set(folded);
    if (on) next.add(key);
    else next.delete(key);
    setFolded([...next].join(","));
  };
  const flip = (s: BoardService, v: boolean) => {
    setErr(null);
    startTransition(async () => {
      setOnlineNow([s.id, v]);
      const r = await setOnlineAction(s.id, v).catch(() => ({ ok: false as const, field: "" }));
      if (!r.ok) setErr(r.field ? A.visit.invalid(r.field) : A.error);
    });
  };

  return (
    <main className="adm-page adm-wide sv-page">
      <div className="sv-head">
        <div className="sv-titles">
          <Titled page="services">
            <h1 className="adm-h1">{S.title}</h1>
          </Titled>
          <p className="sv-crumb only-wide">{S.crumb}</p>
        </div>
      </div>
      <div className="sv-searchrow">
        <label className="sv-search">
          <SearchIcon />
          <input type="search" value={q} placeholder={S.search} aria-label={S.search} maxLength={80} onChange={(e) => setQ(e.target.value)} />
        </label>
        {may.create && (
          <button type="button" className="sv-btn sv-btn-main" onClick={() => setOpen(NEW)}>
            <PlusIcon size={12} />
            {S.add}
          </button>
        )}
      </div>
      {err && (
        <p className="adm-err" role="alert">
          {err}
        </p>
      )}

      <div className="sv-card">
        {board.services.length === 0 ? (
          <p className="adm-meta sv-empty">{S.none}</p>
        ) : groups.length === 0 ? (
          <p className="adm-meta sv-empty" role="status">
            {S.nothing}
          </p>
        ) : (
          <div className="sv-scroll">
            {groups.map((g) => {
              const shut = !q.trim() && folded.has(g.key);
              return (
                <section key={g.key} className="sv-group" aria-label={g.name}>
                  <CategoryHead
                    id={g.cat?.id ?? null}
                    name={g.name}
                    count={g.total}
                    shut={shut}
                    canRename={!!g.cat && may.edit}
                    onFold={() => fold(g.key, !shut)}
                    onError={(t) => setErr(t || null)}
                  />
                  {!shut && (
                    <div role="table" aria-label={g.name} className="sv-table">
                      <div role="row" className="sv-cols only-wide">
                        <span role="columnheader">{S.cols.name}</span>
                        <span role="columnheader">{S.cols.online}</span>
                        <span role="columnheader">{S.cols.price}</span>
                        <span role="columnheader">{S.cols.time}</span>
                        <span role="columnheader">{S.cols.barbers}</span>
                        <span role="columnheader" />
                      </div>
                      {g.services.map((s) => (
                        <ServiceRow
                          key={s.id}
                          s={s}
                          board={board}
                          may={may}
                          online={onlineNow[s.id] ?? s.online}
                          isOpen={open === s.id}
                          onOpen={() => setOpen(s.id)}
                          onOnline={(v) => flip(s, v)}
                          onError={(t) => setErr(t || null)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {open !== null && (open === NEW || current) && (
        <ServiceWindow
          // a window per service: its form starts from that service
          key={open}
          service={current}
          board={board}
          may={may}
          onClose={() => setOpen(null)}
        />
      )}
    </main>
  );
}

/** A category's grey head: its name and count, the pencil (renames it in place), the chevron (folds it). onError("") clears the page's line. */
function CategoryHead({ id, name, count, shut, canRename, onFold, onError }: { id: string | null; name: string; count: number; shut: boolean; canRename: boolean; onFold: () => void; onError: (t: string) => void }) {
  const A = useA();
  const S = A.services;
  const [edit, setEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dropped = useRef(false);

  const commit = async () => {
    if (edit === null || !id || busy) return;
    if (dropped.current) {
      dropped.current = false;
      return setEdit(null);
    }
    const text = edit.trim();
    if (!text || text === name) return setEdit(null);
    setBusy(true);
    const r = await renameCategoryAction(id, A.lang, text).catch(() => ({ ok: false as const, field: "" }));
    setBusy(false);
    if (r.ok) {
      setEdit(null);
      onError("");
    } else onError(r.field ? A.visit.invalid(r.field) : A.error);
  };

  return (
    <div className="sv-ghead">
      {edit !== null ? (
        <input
          className="sv-gname-in"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          aria-label={S.catName}
          maxLength={60}
          value={edit}
          disabled={busy}
          onChange={(e) => setEdit(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              dropped.current = true;
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      ) : (
        <button type="button" className="sv-gfold" aria-expanded={!shut} onClick={onFold}>
          <span className="sv-gname">{name}</span>
          <span className="sv-gcount">· {S.servicesN(count)}</span>
        </button>
      )}
      {canRename && edit === null && (
        <button type="button" className="sv-ibtn" aria-label={S.renameCat(name)} title={S.renameCat(name)} onClick={() => setEdit(name)}>
          <PencilIcon size={16} />
        </button>
      )}
      <button type="button" className={`sv-ibtn sv-chev${shut ? "" : " is-open"}`} aria-label={shut ? S.unfold(name) : S.fold(name)} aria-expanded={!shut} onClick={onFold}>
        <CaretIcon size={16} />
      </button>
    </div>
  );
}

function ServiceRow({
  s,
  board,
  may,
  online,
  isOpen,
  onOpen,
  onOnline,
  onError,
}: {
  s: BoardService;
  board: ServicesBoard;
  may: May;
  online: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onOnline: (v: boolean) => void;
  onError: (t: string) => void;
}) {
  const A = useA();
  const S = A.services;
  const name = A.pick(s.name);
  const sum = rowSum(s, board.barbers);
  const price = priceText(A, sum.price);
  const time = timeText(A, sum.time);
  const shown = sum.who.slice(0, 4);
  const more = sum.who.length - shown.length;

  return (
    <div
      role="row"
      className={`sv-row${isOpen ? " is-open" : ""}${s.active ? "" : " is-off"}`}
      onClick={(e) => {
        // the switch, the price and the buttons do their own thing
        if ((e.target as HTMLElement).closest("button, input, label, a")) return;
        onOpen();
      }}
    >
      <span role="cell" className="sv-c-name">
        <button type="button" className="sv-name" onClick={onOpen}>
          {name}
        </button>
        {!s.active && <span className="adm-tag">{S.inactive}</span>}
        <small className="only-narrow">
          {price} · {time}
        </small>
      </span>
      <span role="cell" className="sv-c-online">
        <label className="sv-onl">
          <input type="checkbox" role="switch" className="sv-sw sv-sw-sm" checked={online} disabled={!may.online} aria-label={S.onlineOf(name)} onChange={(e) => onOnline(e.target.checked)} />
          <span className="only-wide">{online ? S.on : S.off}</span>
        </label>
      </span>
      <span role="cell" className="sv-c-price only-wide">
        <PriceCell s={s} name={name} text={price} may={may.price} onError={onError} />
      </span>
      <span role="cell" className={`sv-c-time only-wide${sum.time.kind === "each" ? " is-each" : ""}`}>
        {time}
      </span>
      <span role="cell" className="sv-c-staff only-wide">
        {sum.who.length === 0 ? (
          <span className="sv-nobody">{S.nobody}</span>
        ) : (
          <span className="sv-tiles" title={sum.who.map((b) => b.name).join(", ")} aria-label={sum.who.map((b) => b.name).join(", ")}>
            {shown.map((b) => (
              <span key={b.id} className="sv-tile" aria-hidden="true">
                {initial(b.name)}
              </span>
            ))}
            {more > 0 && (
              <span className="sv-tile sv-tile-more" aria-hidden="true">
                +{more}
              </span>
            )}
          </span>
        )}
      </span>
      <span role="cell" className="sv-c-edit">
        <button type="button" className="sv-ibtn" aria-label={S.open(name)} title={S.open(name)} onClick={onOpen}>
          <PencilIcon size={16} />
        </button>
      </span>
    </div>
  );
}

/** «Цена»: the base price as a dashed link; a click makes it a field. Enter or leaving it saves, Escape drops it. */
function PriceCell({ s, name, text, may, onError }: { s: BoardService; name: string; text: string; may: boolean; onError: (t: string) => void }) {
  const A = useA();
  const S = A.services;
  const [edit, setEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const dropped = useRef(false);

  if (edit === null)
    return may ? (
      <button
        type="button"
        className="sv-price"
        aria-label={`${S.priceOf(name)}, ${text}`}
        onClick={() => {
          setBad(false);
          setEdit(fromCents(s.priceCents));
        }}
      >
        {text}
      </button>
    ) : (
      <span className="sv-price-plain">{text}</span>
    );

  const commit = async () => {
    if (busy) return;
    if (dropped.current) {
      dropped.current = false;
      return setEdit(null);
    }
    const c = edit === null ? null : toCents(edit);
    if (c === null) {
      setBad(true);
      return onError(S.badPrice);
    }
    if (c === s.priceCents) return setEdit(null);
    setBusy(true);
    const r = await setPriceAction(s.id, c).catch(() => ({ ok: false as const, field: "" }));
    setBusy(false);
    if (r.ok) {
      setEdit(null);
      onError("");
    } else {
      setBad(true);
      onError(r.field ? A.visit.invalid(r.field) : A.error);
    }
  };

  return (
    <span className={`sv-pin${bad ? " is-bad" : ""}`}>
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        inputMode="decimal"
        aria-label={S.priceOf(name)}
        aria-invalid={bad || undefined}
        value={edit}
        disabled={busy}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setBad(false);
          setEdit(e.target.value);
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            dropped.current = true;
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span aria-hidden="true">€</span>
    </span>
  );
}
