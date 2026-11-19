"use client";

/**
 * A login's access rights (the owner, 19.11.2026: «add all switches»; the
 * list is docs/altegio-rights.md, as data in
 * src/lib/auth/rights-catalogue.ts).
 *
 *   - the role: one of eight presets; picking one fills in its defaults,
 *     after a question, because it replaces the set as it is;
 *   - «Скопировать права»: another login's set, after the same question;
 *   - a search over the rights;
 *   - each group as a block that opens: its switch, «N из M прав», and a
 *     menu «Выдать все» / «Убрать все» (only the rights that work here);
 *     inside, the rights, a nested one under its parent; a right with a
 *     value is a select;
 *   - a right whose function we do not have is grey and says «нет в
 *     системе»: it shows how the preset has it and cannot be switched;
 *   - «Сохранить» writes the whole set at once (account/actions.ts);
 *   - «История изменений прав»: every save, with what went on and off.
 *
 * Nothing here decides anything: the server keeps the rules of a save
 * (src/lib/auth/rights-store.ts) and answers with the reason when it
 * refuses. A switch the login that edits could not hand out is shown
 * locked for it, so the refusal is rare.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { diffRights, normalizeRights, scopeOf, type StoredRights } from "@/lib/auth/rights";
import { GROUP_KEYS, GROUPS, groupKey, HISTORY_DAYS, isRoleCode, presetRights, PRESETS, RIGHTS, rightDef, ROLE_CODES, type GroupKey, type RightDef, type RightValue, type RoleCode } from "@/lib/auth/rights-catalogue";
import type { RightsChange } from "@/lib/auth/rights-store";
import { CaretIcon, PrevIcon, SearchIcon } from "../../../icons";
import { useA } from "../../../lang";
import { Ask } from "../../clients/[id]/parts";
import { copyRightsAction, saveRightsAction } from "../actions";

export type RightsViewProps = {
  target: { id: string; email: string; name: string; you: boolean; barber: string | null };
  initial: StoredRights;
  /** the other logins, to copy from */
  logins: { id: string; label: string }[];
  /** the barbers a scope can name */
  staff: { id: string; name: string }[];
  history: RightsChange[];
  /** the login that edits is an owner: it may hand out anything */
  owner: boolean;
  /** what the login that edits holds itself (it hands out nothing else) */
  mine: string[];
  tz: string;
};

const same = (a: StoredRights, b: StoredRights) => {
  const d = diffRights(a, b);
  return a.preset === b.preset && !d.on.length && !d.off.length && !d.values.length;
};

/** A right's children, by parent. */
const KIDS = new Map<string, RightDef[]>();
for (const r of RIGHTS) if (r.parent) KIDS.set(r.parent, [...(KIDS.get(r.parent) ?? []), r]);
const under = (key: string): string[] => (KIDS.get(key) ?? []).flatMap((k) => [k.key, ...under(k.key)]);

export function RightsView({ target, initial, logins, staff, history, owner, mine, tz }: RightsViewProps) {
  const A = useA();
  const R = A.rights;
  const lang = A.lang;
  const [base, setBase] = useState(initial);
  const [cur, setCur] = useState(initial);
  const [open, setOpen] = useState<readonly GroupKey[]>([]);
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState<{ kind: "role"; role: RoleCode } | { kind: "copy"; from: string } | null>(null);
  const [copyFrom, setCopyFrom] = useState(logins[0]?.id ?? "");
  const [menu, setMenu] = useState<GroupKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  // a group that was switched off keeps what it had, until the page is left: switched on again, it is as it was
  const stash = useRef(new Map<GroupKey, string[]>());

  const on = useMemo(() => new Set(cur.on), [cur.on]);
  const held = useMemo(() => new Set(mine), [mine]);
  const dirty = !same(base, cur);
  const words = (w: { ru: string; et: string; en: string }) => w[lang];

  // closing the three-dot menu: a click anywhere else, or Escape
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => !(e.target as Element | null)?.closest?.(".rt-menu") && setMenu(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [menu]);

  // leaving with changes that are not saved: the browser's own question
  useEffect(() => {
    if (!dirty) return;
    const stop = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", stop);
    return () => window.removeEventListener("beforeunload", stop);
  }, [dirty]);

  const put = (next: { preset?: RoleCode; on: Iterable<string>; values?: Record<string, RightValue> }) => {
    setNote(null);
    setCur(normalizeRights({ preset: next.preset ?? cur.preset, on: [...next.on], values: next.values ?? cur.values }));
  };

  /** May the login that edits switch this on? An owner anything; anyone else only what he holds. */
  const mayGive = (key: string) => owner || held.has(key);

  const toggle = (r: RightDef, to: boolean) => {
    const next = new Set(on);
    if (to) next.add(r.key);
    else for (const k of [r.key, ...under(r.key)]) next.delete(k);
    put({ on: next });
  };

  const toggleGroup = (g: GroupKey, to: boolean) => {
    const next = new Set(on);
    const keys = RIGHTS.filter((r) => r.group === g).map((r) => r.key as string);
    if (to) {
      next.add(groupKey(g));
      for (const k of stash.current.get(g) ?? []) next.add(k);
    } else {
      stash.current.set(g, keys.filter((k) => on.has(k)));
      next.delete(groupKey(g));
      for (const k of keys) next.delete(k);
    }
    put({ on: next });
  };

  /** «Выдать все» / «Убрать все»: only the rights that work here, and only what the editor may hand out. */
  const all = (g: GroupKey, to: boolean) => {
    const next = new Set(on);
    if (to && g !== "single") next.add(groupKey(g));
    for (const r of RIGHTS) {
      if (r.group !== g || !r.built || r.value) continue;
      if (to && (mayGive(r.key) || on.has(r.key))) next.add(r.key);
      if (!to) next.delete(r.key);
    }
    setMenu(null);
    put({ on: next });
  };

  const setValue = (key: string, v: RightValue) => put({ on, values: { ...cur.values, [key]: v } });

  const applyRole = (role: RoleCode) => {
    stash.current.clear();
    const p = presetRights(role);
    put({ preset: role, on: p.on, values: p.values });
  };

  const copy = async (from: string): Promise<string | null> => {
    const got = await copyRightsAction(from, target.id).catch(() => null);
    if (!got) return A.error;
    stash.current.clear();
    setCur(got);
    setNote({ text: R.copied });
    return null;
  };

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await saveRightsAction(target.id, { preset: cur.preset, on: cur.on, values: cur.values });
      if (r.ok) {
        setBase(cur);
        setNote({ text: A.saved });
      } else if (r.code === "beyond") {
        setNote({ text: R.errors.beyond(r.keys.map((k) => labelOf(k)).join("; ")), bad: true });
      } else setNote({ text: R.errors[r.code] ?? A.error, bad: true });
    } catch {
      setNote({ text: A.error, bad: true });
    } finally {
      setBusy(false);
    }
  };

  /** A key as words: a right's label, or «Раздел «…»» for a group's switch. */
  const labelOf = (key: string): string => {
    if (key.startsWith("group:")) {
      const g = key.slice(6) as GroupKey;
      return GROUPS[g] ? R.groupOn(words(GROUPS[g])) : key;
    }
    const d = rightDef(key);
    return d ? words(d) : key;
  };

  const needle = q.trim().toLocaleLowerCase();
  /** The rights of a group that the search leaves: a match, and what it is nested under. */
  const shownOf = (g: GroupKey): RightDef[] => {
    const list = RIGHTS.filter((r) => r.group === g);
    if (!needle) return list;
    const keep = new Set<string>();
    for (const r of list) {
      if (!words(r).toLocaleLowerCase().includes(needle)) continue;
      for (let k: string | null = r.key; k; k = rightDef(k)?.parent ?? null) keep.add(k);
    }
    return list.filter((r) => keep.has(r.key));
  };

  const when = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const anyShown = GROUP_KEYS.some((g) => shownOf(g).length > 0);

  return (
    <div className="rt">
      <Link className="adm-back" href="/admin/account" prefetch={false}>
        <PrevIcon />
        {A.account.title}
      </Link>
      <header className="rt-head">
        <h1 className="adm-h1">{R.title}</h1>
        <p className="rt-who">
          <b>{target.name || target.email}</b>
          {target.name && <span>{target.email}</span>}
          {target.barber && target.barber !== target.name && <span>{target.barber}</span>}
          {target.you && <span className="adm-tag lime">{A.account.you}</span>}
        </p>
      </header>

      <div className="rt-tools">
        <label className="rt-field">
          <span>{R.role}</span>
          <select
            className="rt-in"
            value={cur.preset}
            aria-label={R.role}
            onChange={(e) => {
              const role = e.target.value;
              if (isRoleCode(role) && role !== cur.preset) setAsk({ kind: "role", role });
            }}
          >
            {ROLE_CODES.map((c) => (
              <option key={c} value={c} disabled={!owner && c === "OW"}>
                {words(PRESETS[c])}
              </option>
            ))}
          </select>
        </label>
        {logins.length > 0 && (
          <div className="rt-field">
            <span>{R.copy}</span>
            <div className="rt-copy">
              <select className="rt-in" value={copyFrom} aria-label={R.copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                {logins.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button type="button" className="rt-btn" disabled={!copyFrom || busy} onClick={() => setAsk({ kind: "copy", from: copyFrom })}>
                {R.copy}
              </button>
            </div>
          </div>
        )}
        <label className="rt-field rt-search">
          <span>{R.search}</span>
          <span className="rt-search-in">
            <SearchIcon size={16} />
            <input className="rt-in" type="search" value={q} placeholder={R.searchPh} aria-label={R.search} onChange={(e) => setQ(e.target.value)} />
          </span>
        </label>
      </div>
      <p className="rt-hint">{R.roleHint}</p>

      {!anyShown && <p className="adm-meta">{R.nothing}</p>}

      <div className="rt-groups">
        {GROUP_KEYS.map((g) => {
          const G = GROUPS[g];
          const title = words(G);
          const rows = shownOf(g);
          if (needle && !rows.length) return null;
          const isOpen = !!needle || open.includes(g);
          const single = g === "single";
          const gOn = single || on.has(groupKey(g));
          const count = RIGHTS.filter((r) => r.group === g && on.has(r.key)).length;
          const hasBuilt = RIGHTS.some((r) => r.group === g && r.built && !r.value);
          return (
            <section key={g} className={`rt-group${gOn ? "" : " is-off"}${G.built ? "" : " is-locked"}`} data-group={g}>
              <div className="rt-ghead">
                <button type="button" className="rt-gtitle" aria-expanded={isOpen} onClick={() => setOpen(open.includes(g) ? open.filter((x) => x !== g) : [...open, g])}>
                  <CaretIcon size={12} />
                  <b>{title}</b>
                  <small data-count="">{R.count(count, G.size)}</small>
                  {!G.built && <small className="rt-lock">{R.locked}</small>}
                </button>
                {!single && (
                  <input
                    type="checkbox"
                    role="switch"
                    className="rt-sw"
                    aria-label={R.groupOn(title)}
                    checked={gOn}
                    disabled={!G.built || (!gOn && !mayGive(groupKey(g)))}
                    onChange={(e) => toggleGroup(g, e.target.checked)}
                  />
                )}
                {hasBuilt && (
                  <span className="rt-menu">
                    <button type="button" className="rt-dots" aria-label={R.menu(title)} aria-haspopup="menu" aria-expanded={menu === g} onClick={() => setMenu(menu === g ? null : g)}>
                      <i />
                      <i />
                      <i />
                    </button>
                    {menu === g && (
                      <span className="rt-pop" role="menu" aria-label={R.menu(title)}>
                        <button type="button" role="menuitem" onClick={() => all(g, true)}>
                          {R.giveAll}
                        </button>
                        <button type="button" role="menuitem" onClick={() => all(g, false)}>
                          {R.takeAll}
                        </button>
                      </span>
                    )}
                  </span>
                )}
              </div>
              {isOpen && (
                <ul className="rt-rows">
                  {rows.map((r) => {
                    const checked = on.has(r.key);
                    const parentOff = !gOn || (!!r.parent && !on.has(r.parent));
                    const locked = !r.built;
                    const noGive = !checked && !mayGive(r.key);
                    const label = words(r);
                    const id = `rt-${r.key}`;
                    return (
                      <li key={r.key} className={`rt-row${locked ? " is-locked" : ""}${parentOff ? " is-under-off" : ""}`} style={{ "--depth": r.depth } as React.CSSProperties} data-right={r.key}>
                        {r.value ? (
                          <div className="rt-value">
                            <label htmlFor={id}>{label}</label>
                            {locked ? (
                              <small className="rt-lock" title={R.lockedHint}>
                                {R.locked}
                              </small>
                            ) : r.value === "history" ? (
                              <select
                                id={id}
                                className="rt-in"
                                disabled={!gOn}
                                value={cur.values[r.key] == null ? "none" : String(cur.values[r.key])}
                                onChange={(e) => setValue(r.key, e.target.value === "none" ? null : Number(e.target.value))}
                              >
                                {/* a value that is not one of the offered ones stays in the list as it is */}
                                {[...new Set<number | null>([...HISTORY_DAYS, typeof cur.values[r.key] === "number" ? (cur.values[r.key] as number) : null])].map((d) => (
                                  <option key={String(d)} value={d === null ? "none" : String(d)}>
                                    {d === null ? R.historyAll : d === 0 ? R.historyNone : R.historyDays(d)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Scope
                                id={id}
                                value={cur.values[r.key]}
                                staff={staff}
                                disabled={!gOn}
                                allWord={r.key === "clients.show" ? R.clientsAll : R.staffAll}
                                chosenWord={r.key === "clients.show" ? R.clientsChosen : R.staffChosen}
                                onChange={(v) => setValue(r.key, v)}
                              />
                            )}
                          </div>
                        ) : (
                          <label className="rt-toggle" title={locked ? R.lockedHint : noGive ? R.notYours : undefined}>
                            <input type="checkbox" role="switch" className="rt-sw" checked={checked} disabled={locked || parentOff || noGive} onChange={(e) => toggle(r, e.target.checked)} />
                            <span>{label}</span>
                            {locked && <small className="rt-lock">{R.locked}</small>}
                          </label>
                        )}
                        {r.period && r.built && checked && !parentOff && (
                          <label className="rt-period">
                            <span>{R.period}</span>
                            <select className="rt-in" value={cur.values[r.key] === "today" ? "today" : "all"} onChange={(e) => setValue(r.key, e.target.value === "today" ? "today" : "all")}>
                              <option value="all">{R.periodAll}</option>
                              <option value="today">{R.periodToday}</option>
                            </select>
                          </label>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <footer className="rt-save">
        <p className={note?.bad ? "adm-err" : "rt-note"} role={note?.bad ? "alert" : "status"}>
          {note ? note.text : dirty ? R.unsaved : ""}
        </p>
        <button type="button" className="rt-btn rt-main" disabled={busy || !dirty} onClick={() => void save()}>
          {A.save}
        </button>
      </footer>

      <section className="rt-hist" aria-label={R.history}>
        <h2 className="adm-card-h">{R.history}</h2>
        {history.length === 0 ? (
          <p className="adm-meta">{R.historyEmpty}</p>
        ) : (
          <ul>
            {history.map((h) => (
              <li key={h.id}>
                <p className="rt-hist-when">
                  <b>{when.format(new Date(h.at))}</b>
                  {h.by && <span>{h.by}</span>}
                </p>
                {h.presetFrom && h.presetTo && h.presetFrom !== h.presetTo && isRoleCode(h.presetFrom) && isRoleCode(h.presetTo) && (
                  <p>{R.roleChanged(words(PRESETS[h.presetFrom]), words(PRESETS[h.presetTo]))}</p>
                )}
                {h.on.length > 0 && (
                  <p data-on="">
                    <span className="rt-plus">{R.turnedOn}</span> {h.on.map(labelOf).join("; ")}
                  </p>
                )}
                {h.off.length > 0 && (
                  <p data-off="">
                    <span className="rt-minus">{R.turnedOff}</span> {h.off.map(labelOf).join("; ")}
                  </p>
                )}
                {h.values.length > 0 && (
                  <p>
                    <span className="rt-other">{R.valueChanged}</span> {h.values.map(labelOf).join("; ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {ask?.kind === "role" && (
        <Ask
          title={R.roleAsk(words(PRESETS[ask.role]))}
          text={R.replaceText}
          yes={R.roleYes}
          onYes={() => {
            applyRole(ask.role);
            return null;
          }}
          onClose={() => setAsk(null)}
        />
      )}
      {ask?.kind === "copy" && (
        <Ask title={R.copyAsk(logins.find((l) => l.id === ask.from)?.label ?? "")} text={R.replaceText} yes={R.copyYes} onYes={() => copy(ask.from)} onClose={() => setAsk(null)} />
      )}
    </div>
  );
}

/** Whose: everyone's, or the chosen barbers'. */
function Scope({ id, value, staff, disabled, allWord, chosenWord, onChange }: { id: string; value: RightValue | undefined; staff: { id: string; name: string }[]; disabled: boolean; allWord: string; chosenWord: string; onChange: (v: RightValue) => void }) {
  const scope = scopeOf(value);
  const chosen = scope === "all" ? [] : scope;
  return (
    <div className="rt-scope">
      <select id={id} className="rt-in" disabled={disabled} value={scope === "all" ? "all" : "chosen"} onChange={(e) => onChange(e.target.value === "all" ? "all" : [])}>
        <option value="all">{allWord}</option>
        <option value="chosen">{chosenWord}</option>
      </select>
      {scope !== "all" && (
        <div className="rt-chips" role="group" aria-label={chosenWord}>
          {staff.map((s) => {
            const has = chosen.includes(s.id);
            return (
              <button key={s.id} type="button" className="rt-chip" aria-pressed={has} disabled={disabled} onClick={() => onChange(has ? chosen.filter((x) => x !== s.id) : [...chosen, s.id])}>
                {s.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
