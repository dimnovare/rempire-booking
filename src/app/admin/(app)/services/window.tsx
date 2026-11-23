"use client";

/**
 * One service's window (the board «Услуга, окно»): from 900px a 900px
 * drawer from the right over the dimmed table, a round «›» on its seam; on a
 * phone a full-screen sheet. Escape, the seam, the dark side and «Отмена»
 * close it; with changes that are not saved it asks first.
 *
 * - **Head:** the name, «Барберинг · 4 сотрудника» (the barbers who do it
 *   as the window stands), two tabs with a yellow line under the open one.
 * - **«Основные настройки»:** «Название» (in the login's language),
 *   «Категория» (or a new one by its name), «Базовая цена» with «Указать
 *   цену в диапазоне» (the service's «от–до»), «Длительность» in hours and
 *   minutes, «Технический перерыв после записи». Then «Сотрудники,
 *   оказывающие услугу»: a row per working barber with his price and time
 *   («своя» where it is not the base's) and «Оказывает / Не оказывает»; a
 *   barber who does not do it is grey. «Итоговая цена» and «Итоговая
 *   длительность» with the line that says why.
 * - **«Онлайн-запись»:** the switch (the client sees it and books it) and
 *   the name in the other two languages.
 * - **Foot:** «Отключить услугу» (or «Включить снова») on the left; «Отмена»
 *   and the yellow «Сохранить» on the right, live once something changed.
 *
 * A barber's number equal to the base is stored as «the base», so it moves
 * when the base moves (src/lib/admin/service-board.ts). What the login may
 * not change is shown and cannot be typed into; the server asks again.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { effective, HOURS, lengthsWith, MAX_LENGTH, MIN_LENGTH, MINUTES, BUFFERS, sumUp, type Base, type Eff } from "@/lib/admin/service-board";
import type { BoardBarber, BoardService, ServicesBoard } from "@/lib/admin/services";
import type { Locale } from "@/lib/i18n";
import { type Copy } from "../../copy";
import { useA } from "../../lang";
import { InfoIcon, NextIcon, XIcon } from "../../icons";
import { saveServiceAction, type ServiceForm } from "./actions";
import { baseOf, fromCents, initial, priceText, timeText, toCents } from "./labels";

/** What the login may change here (page.tsx, by its rights). */
export type May = { create: boolean; edit: boolean; name: boolean; category: boolean; price: boolean; online: boolean; off: boolean; staff: boolean };

const NEW_CAT = "__new";
const LANGS: readonly Locale[] = ["ru", "et", "en"];

type Row = { staffId: string; offered: boolean; price: string; min: number; priceFollows: boolean; minFollows: boolean };
type Draft = {
  names: Record<Locale, string>;
  category: string;
  newCat: string;
  price: string;
  range: boolean;
  priceMax: string;
  duration: number;
  buffer: number;
  online: boolean;
  active: boolean;
  rows: Row[];
};

function draftOf(service: BoardService | undefined, board: ServicesBoard): Draft {
  const base: Base = service ? baseOf(service) : { priceCents: 0, priceMaxCents: null, durationMin: 30 };
  const by = new Map((service?.offers ?? []).map((o) => [o.staffId, o]));
  return {
    names: { ru: service?.name.ru ?? "", et: service?.name.et ?? "", en: service?.name.en ?? "" },
    category: service ? (service.categoryId && board.categories.some((c) => c.id === service.categoryId) ? service.categoryId : "") : (board.categories[0]?.id ?? ""),
    newCat: "",
    price: service ? fromCents(service.priceCents) : "",
    range: service?.priceMaxCents != null && service.priceMaxCents > service.priceCents,
    priceMax: service?.priceMaxCents != null && service.priceMaxCents > service.priceCents ? fromCents(service.priceMaxCents) : "",
    duration: base.durationMin,
    buffer: service?.bufferMin ?? 0,
    online: service?.online ?? true,
    active: service?.active ?? true,
    rows: board.barbers.map((b) => {
      const o = by.get(b.id);
      const e = effective(base, o ?? { priceCents: null, priceMaxCents: null, durationMin: null });
      return {
        staffId: b.id,
        // a new service: every barber does it, at its base, as before
        offered: service ? o?.offered === true : true,
        price: fromCents(e.priceCents),
        min: e.durationMin,
        priceFollows: e.priceCents === base.priceCents,
        minFollows: e.durationMin === base.durationMin,
      };
    }),
  };
}

/** What is wrong with the window, or null. */
function wrong(A: Copy, d: Draft, lang: Locale, barbers: readonly BoardBarber[]): string | null {
  const S = A.services;
  if (!LANGS.some((l) => d.names[l].trim()) || !d.names[lang].trim()) return S.needName;
  if (d.category === NEW_CAT && !d.newCat.trim()) return S.needCategory;
  const p = toCents(d.price);
  if (p === null) return S.badPrice;
  if (d.range) {
    const top = toCents(d.priceMax);
    if (top === null || top < p) return S.badRange;
  }
  if (!(d.duration >= MIN_LENGTH && d.duration <= MAX_LENGTH)) return S.badLength;
  for (const r of d.rows) {
    if (!r.offered) continue;
    if (toCents(r.price) === null || !(r.min >= MIN_LENGTH && r.min <= MAX_LENGTH)) return S.badBarber(barbers.find((b) => b.id === r.staffId)?.name ?? "");
  }
  return null;
}

export function ServiceWindow({ service, board, may, onClose }: { service?: BoardService; board: ServicesBoard; may: May; onClose: () => void }) {
  const A = useA();
  const S = A.services;
  const lang = A.lang;
  const uid = useId();
  const isNew = !service;
  // what it opened with: the page that comes back after a change elsewhere does not make it «changed»
  const [start] = useState<Draft>(() => draftOf(service, board));
  const [d, setD] = useState<Draft>(start);
  const [tab, setTab] = useState<"main" | "online">("main");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const dirty = JSON.stringify(d) !== JSON.stringify(start);
  const canEdit = isNew ? may.create : may.edit;
  const canRows = canEdit && may.staff;
  // a new service's barbers may be chosen with the right to make it: at its base, as «every barber» was
  const canDoes = canEdit && (may.staff || isNew);

  const close = () => (dirty ? setAsking(true) : onClose());
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      if (asking) setAsking(false);
      else if (dirty) setAsking(true);
      else onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [asking, dirty, onClose]);
  // the keyboard starts inside it, before the first paint
  useLayoutEffect(() => {
    const el = box.current;
    if (el && !el.contains(document.activeElement)) el.focus();
  }, []);

  // ---- the base, as typed; the barbers who follow it move with it
  const basePrice = toCents(d.price);
  const baseTop = d.range ? toCents(d.priceMax) : null;
  const base: Base = { priceCents: basePrice ?? 0, priceMaxCents: baseTop != null && basePrice != null && baseTop > basePrice ? baseTop : null, durationMin: d.duration };
  const setPrice = (price: string) => setD((v) => ({ ...v, price, rows: v.rows.map((r) => (r.priceFollows ? { ...r, price } : r)) }));
  const setDuration = (duration: number) => setD((v) => ({ ...v, duration, rows: v.rows.map((r) => (r.minFollows ? { ...r, min: duration } : r)) }));
  const setRow = (i: number, patch: Partial<Row>) => setD((v) => ({ ...v, rows: v.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const stored = new Map((service?.offers ?? []).map((o) => [o.staffId, o]));
  const effOf = (r: Row): Eff => {
    const cents = toCents(r.price) ?? base.priceCents;
    const own = stored.get(r.staffId);
    const top = cents === base.priceCents ? base.priceMaxCents : own?.priceCents != null && own.priceMaxCents != null && own.priceMaxCents > cents ? own.priceMaxCents : null;
    return { priceCents: cents, priceMaxCents: top, durationMin: r.min };
  };
  const doing = d.rows.filter((r) => r.offered);
  const sum = sumUp(base, doing.map(effOf));
  const catName =
    d.category === NEW_CAT ? d.newCat.trim() || S.newCategory.replace("…", "") : A.pick(board.categories.find((c) => c.id === d.category)?.name) || S.noCategory;
  const title = isNew ? S.newTitle : A.pick(service.name) || S.crumb;

  const why = sum.nobody
    ? S.whyNobody
    : `${sum.price.kind === "from" ? S.whyFrom(priceText(A, sum.price)) : S.whyOne(priceText(A, sum.price))} ${sum.time.kind === "each" ? S.whyEach : S.whyTime(timeText(A, sum.time))}`;

  const save = async () => {
    const bad = wrong(A, d, lang, board.barbers);
    if (bad) return setErr(bad);
    setErr(null);
    setBusy(true);
    const f: ServiceForm = {
      name: { ru: d.names.ru.trim(), et: d.names.et.trim(), en: d.names.en.trim() },
      durationMin: d.duration,
      priceCents: basePrice!,
      priceMaxCents: d.range ? toCents(d.priceMax) : null,
      bufferMin: d.buffer,
      online: d.online,
      active: d.active,
      allBarbers: false,
      // without «Категория услуги» a service keeps its category; a new one goes into the first
      category: !isNew && !may.category ? undefined : d.category === NEW_CAT ? { name: { ru: "", et: "", en: "", [lang]: d.newCat.trim() } } : d.category ? { id: d.category } : null,
      // without the right to the barbers' rows an existing service leaves them as they are
      barbers: canDoes ? d.rows.map((r) => ({ staffId: r.staffId, offered: r.offered, priceCents: toCents(r.price) ?? base.priceCents, durationMin: r.min })) : undefined,
    };
    try {
      const r = await saveServiceAction(service?.id ?? null, f);
      // stays busy on success: the window goes, and the table comes back with the page
      if (r.ok) return onClose();
      const [field, staffId] = r.field.split(":");
      setErr(staffId ? S.badBarber(board.barbers.find((b) => b.id === staffId)?.name ?? "") : A.visit.invalid(field));
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  const hours = Math.floor(d.duration / 60);
  const minutes = d.duration % 60;
  const minuteChoices = MINUTES.includes(minutes) ? MINUTES : [...MINUTES, minutes].sort((a, b) => a - b);
  const buffers = BUFFERS.includes(d.buffer) ? BUFFERS : [...BUFFERS, d.buffer].sort((a, b) => a - b);
  const others = LANGS.filter((l) => l !== lang);

  return (
    <div className="sv-wrap" onClick={close}>
      <div ref={box} className="sv-win" role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sv-seam only-wide" aria-label={A.close} title={A.close} onClick={close}>
          <NextIcon size={18} />
        </button>
        <header className="sv-whead">
          <div className="sv-wtitles">
            <h2 id={`${uid}-t`}>{title}</h2>
            <p>{S.subtitle(catName, doing.length)}</p>
          </div>
          <button type="button" className="sv-x only-narrow" aria-label={A.close} onClick={close}>
            <XIcon size={20} />
          </button>
        </header>
        <div className="sv-tabs" role="tablist" aria-label={S.tabs}>
          {(["main", "online"] as const).map((t) => (
            <button key={t} type="button" role="tab" id={`${uid}-${t}`} aria-controls={`${uid}-p-${t}`} aria-selected={tab === t} className="sv-tab" onClick={() => setTab(t)}>
              {t === "main" ? S.tabMain : S.tabOnline}
            </button>
          ))}
        </div>

        <div className="sv-wbody">
          {!d.active && <p className="sv-offnote">{S.offNote}</p>}
          {tab === "main" ? (
            <div role="tabpanel" id={`${uid}-p-main`} aria-labelledby={`${uid}-main`} className="sv-panel">
              <div className="sv-grid2">
                <label className="sv-field">
                  <span>{S.name}</span>
                  <input
                    className="sv-in"
                    maxLength={120}
                    value={d.names[lang]}
                    readOnly={!canEdit || (!isNew && !may.name)}
                    onChange={(e) => setD({ ...d, names: { ...d.names, [lang]: e.target.value } })}
                  />
                </label>
                <div className="sv-field">
                  <label htmlFor={`${uid}-cat`}>{S.category}</label>
                  <select id={`${uid}-cat`} className="sv-in sv-sel" value={d.category} disabled={!canEdit || !may.category} onChange={(e) => setD({ ...d, category: e.target.value })}>
                    {board.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {A.pick(c.name) || S.noCategory}
                      </option>
                    ))}
                    {(!d.category || board.categories.length === 0) && <option value="">{S.noCategory}</option>}
                    {may.category && <option value={NEW_CAT}>{S.newCategory}</option>}
                  </select>
                  {d.category === NEW_CAT && (
                    <input className="sv-in" aria-label={S.newCategoryName} placeholder={S.newCategoryName} maxLength={60} value={d.newCat} onChange={(e) => setD({ ...d, newCat: e.target.value })} />
                  )}
                </div>
              </div>

              <div className="sv-grid2">
                <div className="sv-field">
                  <span id={`${uid}-bp`}>{S.basePrice}</span>
                  <div className="sv-prices">
                    <Money
                      label={d.range ? S.priceFrom : S.basePrice}
                      value={d.price}
                      disabled={!canEdit || (!isNew && !may.price)}
                      wide
                      onChange={setPrice}
                    />
                    {d.range && (
                      <>
                        <span className="sv-dash" aria-hidden="true">
                          –
                        </span>
                        <Money label={S.priceTo} value={d.priceMax} disabled={!canEdit || (!isNew && !may.price)} wide onChange={(v) => setD({ ...d, priceMax: v })} />
                      </>
                    )}
                  </div>
                  <label className="sv-check">
                    <input
                      type="checkbox"
                      checked={d.range}
                      disabled={!canEdit || (!isNew && !may.price)}
                      onChange={(e) => setD({ ...d, range: e.target.checked, priceMax: e.target.checked ? d.priceMax : "" })}
                    />
                    {S.range}
                  </label>
                </div>
                <div className="sv-field">
                  <span id={`${uid}-dur`}>{S.duration}</span>
                  <div className="sv-dur" role="group" aria-labelledby={`${uid}-dur`}>
                    <select className="sv-in sv-sel" aria-label={S.hours} value={hours} disabled={!canEdit} onChange={(e) => setDuration(Number(e.target.value) * 60 + minutes)}>
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {S.h(h)}
                        </option>
                      ))}
                    </select>
                    <select className="sv-in sv-sel" aria-label={S.minutes} value={minutes} disabled={!canEdit} onChange={(e) => setDuration(hours * 60 + Number(e.target.value))}>
                      {minuteChoices.map((m) => (
                        <option key={m} value={m}>
                          {S.m(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="sv-buffer">
                    <span>{S.buffer}</span>
                    <select className="sv-in sv-sel" value={d.buffer} disabled={!canEdit} onChange={(e) => setD({ ...d, buffer: Number(e.target.value) })}>
                      {buffers.map((b) => (
                        <option key={b} value={b}>
                          {b === 0 ? S.noBuffer : S.m(b)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <h3 className="sv-h3">{S.staffTitle}</h3>
              <p className="sv-note">{S.staffNote}</p>
              {board.barbers.length === 0 ? (
                <p className="adm-meta">{S.noBarbers}</p>
              ) : (
                <div className="sv-staff" role="table" aria-label={S.staffTitle}>
                  <div role="row" className="sv-shead only-wide">
                    <span role="columnheader">{S.staffCols.who}</span>
                    <span role="columnheader">{S.staffCols.price}</span>
                    <span role="columnheader">{S.staffCols.time}</span>
                    <span role="columnheader">{S.staffCols.does}</span>
                  </div>
                  {d.rows.map((r, i) => {
                    const b = board.barbers.find((x) => x.id === r.staffId)!;
                    const e = effOf(r);
                    const ownP = r.offered && toCents(r.price) !== null && e.priceCents !== base.priceCents;
                    const ownT = r.offered && r.min !== base.durationMin;
                    return (
                      <div role="row" key={r.staffId} className={`sv-srow${r.offered ? "" : " is-off"}`}>
                        <span role="cell" className="sv-who">
                          <span className="sv-pic" aria-hidden="true">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {b.photoUrl ? <img src={b.photoUrl} alt="" loading="lazy" /> : initial(b.name)}
                          </span>
                          <span className="txt">
                            <b>{b.name}</b>
                            <small>{A.pick(b.role) || A.visit.barber}</small>
                          </span>
                        </span>
                        <span role="cell" className="sv-sprice">
                          <Money label={S.priceFor(b.name)} value={r.price} disabled={!r.offered || !canRows} onChange={(v) => setRow(i, { price: v, priceFollows: false })} />
                          {ownP && <span className="sv-own">{S.own}</span>}
                        </span>
                        <span role="cell" className="sv-stime">
                          <select
                            className="sv-in sv-sel"
                            aria-label={S.timeFor(b.name)}
                            value={r.min}
                            disabled={!r.offered || !canRows}
                            onChange={(ev) => setRow(i, { min: Number(ev.target.value), minFollows: false })}
                          >
                            {lengthsWith(r.min).map((m) => (
                              <option key={m} value={m}>
                                {A.mins(m)}
                              </option>
                            ))}
                          </select>
                          {ownT && <span className="sv-own">{S.own}</span>}
                        </span>
                        <span role="cell" className="sv-sdoes">
                          <label>
                            <span>{r.offered ? S.does : S.doesNot}</span>
                            <input type="checkbox" role="switch" className="sv-sw" aria-label={S.doesOf(b.name)} checked={r.offered} disabled={!canDoes} onChange={(ev) => setRow(i, { offered: ev.target.checked })} />
                          </label>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="sv-sum">
                <div>
                  <small>{S.totalPrice}</small>
                  <b>{priceText(A, sum.price)}</b>
                </div>
                <div>
                  <small>{S.totalTime}</small>
                  <b>{timeText(A, sum.time)}</b>
                </div>
                <p>
                  <InfoIcon size={16} />
                  <span>{why}</span>
                </p>
              </div>
            </div>
          ) : (
            <div role="tabpanel" id={`${uid}-p-online`} aria-labelledby={`${uid}-online`} className="sv-panel">
              <label className="sv-online">
                <input type="checkbox" role="switch" className="sv-sw" checked={d.online} disabled={!canEdit || (!isNew && !may.online)} onChange={(e) => setD({ ...d, online: e.target.checked })} />
                <span className="txt">
                  <b>{S.tabOnline}</b>
                  <small>{d.online ? S.onlineSwitch : S.onlineHint}</small>
                </span>
              </label>
              <h3 className="sv-h3">{S.otherNames}</h3>
              <div className="sv-grid2">
                {others.map((l) => (
                  <label key={l} className="sv-field">
                    <span>{S.nameIn[l]}</span>
                    <input
                      className="sv-in"
                      maxLength={120}
                      value={d.names[l]}
                      readOnly={!canEdit || (!isNew && !may.name)}
                      onChange={(e) => setD({ ...d, names: { ...d.names, [l]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="sv-wfoot">
          <div className="sv-wfoot-l">
            {!isNew && (d.active ? may.off : may.edit) && (
              <button type="button" className="sv-btn sv-btn-text" onClick={() => setD({ ...d, active: !d.active })}>
                {d.active ? S.disable : S.enable}
              </button>
            )}
            {err && (
              <p className="adm-err" role="alert">
                {err}
              </p>
            )}
          </div>
          <div className="sv-wfoot-r">
            <button type="button" className="sv-btn" onClick={close}>
              {A.cancel}
            </button>
            <button type="button" className="sv-btn sv-btn-main" disabled={busy || !canEdit || (!isNew && !dirty)} onClick={() => void save()}>
              {A.save}
            </button>
          </div>
        </footer>
      </div>

      {asking && (
        <div className="sv-ask-wrap" onClick={(e) => e.stopPropagation()}>
          <div className="sv-ask" role="alertdialog" aria-modal="true" aria-labelledby={`${uid}-ask`}>
            <h2 id={`${uid}-ask`}>{S.unsaved}</h2>
            <p>{S.unsavedText}</p>
            <div className="sv-ask-btns">
              <button type="button" className="sv-btn" onClick={() => setAsking(false)}>
                {S.stay}
              </button>
              <button type="button" className="sv-btn sv-btn-main" onClick={onClose}>
                {S.leave}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A sum of euros: the field and «€» beside it. */
function Money({ label, value, disabled, wide = false, onChange }: { label: string; value: string; disabled?: boolean; wide?: boolean; onChange: (v: string) => void }) {
  return (
    <span className={`sv-money${wide ? " is-wide" : ""}`}>
      <input className="sv-in" inputMode="decimal" aria-label={label} value={value} disabled={disabled} maxLength={9} onChange={(e) => onChange(e.target.value)} />
      <span aria-hidden="true">€</span>
    </span>
  );
}
