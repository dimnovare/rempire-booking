"use client";

/**
 * «Доступ» → «Входы»: the salon's logins in the look of Altegio's staff list
 * (Dim, 25.11.2026, design artifact 53PfD3DxCRkbDyjwLVvBHB): a row per login
 * with its role (a link to its rights), the barber it is, how it logs in,
 * its last login and an on/off switch. From 900px a table; on a phone the
 * same rows as cards. «Добавить вход» opens the admin's drawer with the
 * rights page's eight roles. A row's «⋯» (a menu wide, a sheet on a
 * phone) has «Удалить вход» last (delete-login.tsx); the toast after it
 * has «Вернуть».
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LOCALES, type Locale } from "@/lib/i18n";
import { LANG_NAMES } from "../../copy";
import { DotsIcon, InfoIcon, PlusIcon, SearchIcon } from "../../icons";
import { useA } from "../../lang";
import { Drawer } from "../drawer";
import { useFrame } from "../frame";
import { Pop } from "../pop";
import { addUser, deleteUserAction, restoreUserAction, toggleUser } from "./actions";
import { DeleteAsk, RowSheet } from "./delete-login";
import { LinkStaff } from "./forms";

export type AccessRow = {
  id: string;
  email: string;
  name: string;
  /** the rights preset (users.rights_preset), when it has one */
  code: string | null;
  roleName: string;
  role: "owner" | "admin" | "staff";
  staffId: string | null;
  staffName: string | null;
  hasPassword: boolean;
  /** the last login, formatted; null: never */
  last: string | null;
  active: boolean;
  /** the barbers an owner's or admin's login may be */
  linkable: { id: string; name: string }[];
};

export type RoleOption = { code: string; name: string; hint: string };

export function AccessList({
  rows,
  me,
  ownerMe,
  mayRights,
  mayRemove,
  roles,
}: {
  rows: AccessRow[];
  me: string;
  /** an owner's login is switched off or deleted only by an owner (account/actions.ts) */
  ownerMe: boolean;
  mayRights: boolean;
  mayRemove: boolean;
  roles: RoleOption[];
}) {
  const A = useA();
  const T = A.account;
  const frame = useFrame();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [state, setState] = useState<"" | "on" | "off">("");
  const [asking, setAsking] = useState<AccessRow | null>(null);
  const [deleting, setDeleting] = useState<AccessRow | null>(null);
  const [acts, setActs] = useState<AccessRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!s || r.email.toLowerCase().includes(s) || r.name.toLowerCase().includes(s)) && (!role || r.code === role) && (!state || (state === "on") === r.active));
  }, [rows, q, role, state]);
  // only the roles somebody has: «Все роли» and those
  const used = roles.filter((o) => rows.some((r) => r.code === o.code));

  const switchOn = async (r: AccessRow) => {
    setBusy(r.id);
    try {
      if (!(await toggleUser(r.id, true))) frame.say(A.error, true);
    } catch {
      frame.say(A.error, true);
    }
    setBusy(null);
  };
  const flip = (r: AccessRow) => (r.active ? setAsking(r) : void switchOn(r));
  /** why this login cannot be switched off or deleted by this one; null: it can */
  const blockedWhy = (r: AccessRow, del: boolean) => (r.id === me ? (del ? T.ownNoDel : T.ownNo) : !ownerMe && r.role === "owner" ? T.ownerOnly : null);

  // «Вернуть» in the toast: the login as it was, while the server still allows it
  const restore = async (r: AccessRow) => {
    try {
      const res = await restoreUserAction(r.id);
      frame.say(res === "ok" ? T.restored(r.email) : res === "taken" ? T.restoreTaken(r.email) : T.restoreLate, res !== "ok");
    } catch {
      frame.say(A.error, true);
    }
  };
  const remove = async (r: AccessRow) => {
    if (!(await deleteUserAction(r.id))) return A.error;
    frame.say(T.deleted(r.email), false, { label: T.undo, run: () => void restore(r) });
    return null;
  };
  const switchOff = async (r: AccessRow) => {
    if (!(await toggleUser(r.id, false))) return A.error;
    frame.say(T.offDone(r.email));
    return null;
  };

  return (
    <div className="ac-list">
      <div className="ac-tools">
        <label className="ac-search">
          <SearchIcon />
          <input type="search" placeholder={T.search} aria-label={T.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select aria-label={T.role} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">{T.allRoles}</option>
          {used.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </select>
        <select aria-label={T.cols.access} value={state} onChange={(e) => setState(e.target.value as "" | "on" | "off")}>
          <option value="">{T.stateAll}</option>
          <option value="on">{T.stateOn}</option>
          <option value="off">{T.stateOff}</option>
        </select>
        <span className="ac-found">{T.found(shown.length)}</span>
      </div>
      {mayRights && (
        <p className="ac-note">
          <InfoIcon />
          <span>{T.note}</span>
        </p>
      )}
      <div role="table" aria-label={T.users} className="ac-table">
        <div role="row" className="ac-cols">
          <span role="columnheader">{T.cols.login}</span>
          <span role="columnheader">{T.cols.role}</span>
          <span role="columnheader">{T.cols.barber}</span>
          <span role="columnheader" className="ac-how">{T.cols.how}</span>
          <span role="columnheader">{T.cols.last}</span>
          <span role="columnheader">{T.cols.access}</span>
          <span role="columnheader">
            <span className="sr">{T.cols.acts}</span>
          </span>
        </div>
        {shown.map((r) => {
          const mine = r.id === me;
          const why = blockedWhy(r, true);
          const mayFlip = mayRemove && !why;
          return (
            <div role="row" key={r.id} className={`ac-row${r.active ? "" : " is-off"}`}>
              <span role="cell" className="ac-who">
                <span className="ac-av" aria-hidden="true">
                  {(r.name || r.email).slice(0, 1).toUpperCase()}
                </span>
                <span className="ac-id">
                  <span className="ac-name">
                    <b>{r.name || r.email.split("@")[0]}</b>
                    {mine && <span className="ac-tag is-you">{T.you}</span>}
                    {!r.active && <span className="ac-tag">{T.disabled}</span>}
                  </span>
                  <small>{r.email}</small>
                </span>
              </span>
              <span role="cell" className="ac-role">
                {mayRights ? (
                  <Link href={`/admin/account/${r.id}`} prefetch={false} aria-label={`${r.roleName} · ${A.rights.open}: ${r.email}`}>
                    {r.roleName}
                  </Link>
                ) : (
                  r.roleName
                )}
              </span>
              <span role="cell" className="ac-barber">
                {r.role !== "staff" && r.active ? (
                  <LinkStaff key={r.staffId ?? ""} id={r.id} email={r.email} staffId={r.staffId} staff={r.linkable} />
                ) : r.staffName ? (
                  <>
                    <span className="ac-ph">{T.barber}: </span>
                    {r.staffName}
                  </>
                ) : (
                  <span className="ac-mute">{T.notBarber}</span>
                )}
              </span>
              <span role="cell" className="ac-how">
                {r.hasPassword ? <KeyIcon /> : <MailIcon />}
                {r.hasPassword ? T.howPw : T.howCode}
              </span>
              <span role="cell" className={`ac-last${r.last ? "" : " ac-mute"}`}>
                <span className="ac-ph">{T.lastLogin}: </span>
                {r.last ?? T.never}
              </span>
              <span role="cell" className="ac-sw">
                <input
                  type="checkbox"
                  role="switch"
                  className="adm-sw"
                  checked={r.active}
                  disabled={!mayFlip || busy === r.id}
                  title={mayRemove ? (blockedWhy(r, false) ?? undefined) : undefined}
                  aria-label={r.active ? T.switchOff(r.email) : T.switchOn(r.email)}
                  onChange={(e) => (e.target.checked ? void switchOn(r) : setAsking(r))}
                />
              </span>
              <span role="cell" className="ac-acts">
                {(mayRights || mayRemove) && (
                  <>
                    {/* from 900px: the row's menu; «Удалить вход» last, apart, in red (design «Доступ: меню строки») */}
                    <Pop kind="menu" name={T.actsOf(r.email)} label={T.actsOf(r.email)} icon button={<DotsIcon size={18} />}>
                      {(close) => (
                        <>
                          {mayRights && (
                            <Link role="menuitem" className="jr-item" href={`/admin/account/${r.id}`} prefetch={false} onClick={close}>
                              <span>{A.rights.title}</span>
                            </Link>
                          )}
                          {mayFlip && (
                            <button
                              type="button"
                              role="menuitem"
                              className="jr-item"
                              onClick={() => {
                                close();
                                flip(r);
                              }}
                            >
                              <span>{r.active ? T.offYes : T.enable}</span>
                            </button>
                          )}
                          {mayRemove && (
                            <>
                              <div role="separator" className="ac-sep" />
                              <button
                                type="button"
                                role="menuitem"
                                className="jr-item is-red"
                                disabled={!!why}
                                aria-describedby={why ? `ac-own-w-${r.id}` : undefined}
                                onClick={() => {
                                  close();
                                  setDeleting(r);
                                }}
                              >
                                <span>{T.delYes}</span>
                              </button>
                              {why && (
                                <small className="ac-own" id={`ac-own-w-${r.id}`}>
                                  {why}
                                </small>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </Pop>
                    {/* on a phone: «⋯» opens a sheet from the bottom with the same actions */}
                    <button type="button" className="adm-ibtn ac-more" aria-label={T.actsOf(r.email)} aria-haspopup="dialog" onClick={() => setActs(r)}>
                      <DotsIcon size={20} />
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
        {!shown.length && <p className="ac-none">{T.nobody}</p>}
      </div>
      {asking && <OffAsk email={asking.email} onClose={() => setAsking(null)} onYes={async () => ((await toggleUser(asking.id, false)) ? null : A.error)} />}
      {deleting && <DeleteAsk row={deleting} onClose={() => setDeleting(null)} onYes={() => remove(deleting)} onOff={() => switchOff(deleting)} />}
      {acts && (
        <RowSheet
          row={acts}
          blocked={blockedWhy(acts, true)}
          mayRights={mayRights}
          mayFlip={mayRemove && !blockedWhy(acts, true)}
          mayDelete={mayRemove}
          onClose={() => setActs(null)}
          onFlip={() => {
            setActs(null);
            flip(acts);
          }}
          onDelete={() => {
            setActs(null);
            setDeleting(acts);
          }}
        />
      )}
    </div>
  );
}

/** «Добавить вход» and its drawer: name, e-mail, one of the eight roles, the barber, the language, how it logs in. */
export function AddLogin({ staff, roles, compact }: { staff: { id: string; name: string }[]; roles: RoleOption[]; compact?: boolean }) {
  const A = useA();
  const T = A.account;
  const frame = useFrame();
  const blank = { name: "", email: "", preset: "SP", staffId: staff[0]?.id ?? "", also: "", how: "code" as "code" | "pw", password: "", locale: A.lang as Locale };
  const [open, setOpen] = useState(false);
  const [u, setU] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isBarber = u.preset === "SP";

  const close = () => {
    setOpen(false);
    setErr(null);
  };
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const f = new FormData();
      f.set("name", u.name);
      f.set("email", u.email);
      f.set("preset", u.preset);
      // a barber's login is its barber; any other may be one too
      f.set("staffId", isBarber ? u.staffId : u.also);
      f.set("locale", u.locale);
      if (u.how === "pw") f.set("password", u.password);
      const r = await addUser(f);
      if (r.ok) {
        frame.say(T.added(u.email.trim()));
        setU(blank);
        setOpen(false);
      } else setErr(r.field === "email_taken" ? T.taken : r.field === "password" ? T.short : A.visit.invalid(r.field));
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };

  return (
    <>
      <button type="button" className={`adm-btn adm-btn-lime adm-btn-sm ac-add${compact ? " is-compact" : ""}`} onClick={() => setOpen(true)}>
        <PlusIcon />
        {T.addUser}
      </button>
      {open && (
        <Drawer
          title={T.newLogin}
          head
          onClose={close}
          foot={
            <button type="submit" form="ac-new" className="dw-btn dw-btn-main" disabled={busy}>
              {T.addUser}
            </button>
          }
        >
          <form
            id="ac-new"
            className="dw-col dw-col-main ac-new"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="dw-pair">
              <label className="dw-field">
                <span>{T.name}</span>
                <input autoComplete="off" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} />
              </label>
              <label className="dw-field">
                <span>
                  {T.email} <i className="ac-req">*</i>
                </span>
                <input type="email" required autoComplete="off" value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} />
                <small className="dw-note">{T.emailHint}</small>
              </label>
            </div>
            <fieldset className="ac-set">
              <legend>
                {T.role} <span className="dw-note">{T.roleHint}</span>
              </legend>
              <div className="ac-opts">
                {roles.map((o) => (
                  <label key={o.code} className="ac-opt">
                    <input type="radio" name="preset" value={o.code} checked={u.preset === o.code} onChange={() => setU({ ...u, preset: o.code })} />
                    <span>
                      <b>{o.name}</b>
                      <small>{o.hint}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="dw-pair">
              <label className="dw-field">
                <span>
                  {isBarber ? T.barber : T.alsoBarber}
                  {isBarber && <i className="ac-req"> *</i>}
                </span>
                {isBarber ? (
                  <select required value={u.staffId} onChange={(e) => setU({ ...u, staffId: e.target.value })}>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select value={u.also} onChange={(e) => setU({ ...u, also: e.target.value })}>
                    <option value="">{T.notBarber}</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
                <small className="dw-note">{isBarber ? T.barberHint : u.also ? T.alsoHint : ""}</small>
              </label>
              <div className="dw-field">
                <span>{A.langLabel}</span>
                <div className="ac-seg" role="group" aria-label={A.langLabel}>
                  {LOCALES.map((l) => (
                    <button key={l} type="button" lang={l} aria-pressed={u.locale === l} onClick={() => setU({ ...u, locale: l })}>
                      {LANG_NAMES[l]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <fieldset className="ac-set">
              <legend>{T.howLegend}</legend>
              <div className="ac-opts">
                <label className="ac-opt">
                  <input type="radio" name="how" checked={u.how === "code"} onChange={() => setU({ ...u, how: "code" })} />
                  <span>
                    <b>{T.howCodeOpt}</b>
                    <small>{T.howCodeHint}</small>
                  </span>
                </label>
                <label className="ac-opt">
                  <input type="radio" name="how" checked={u.how === "pw"} onChange={() => setU({ ...u, how: "pw" })} />
                  <span>
                    <b>{T.howPwOpt}</b>
                    <small>{T.howPwHint}</small>
                  </span>
                </label>
              </div>
              {u.how === "pw" && (
                <label className="dw-field ac-first">
                  <span>{T.firstPassword}</span>
                  <input type="password" required autoComplete="new-password" minLength={8} maxLength={200} value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} />
                </label>
              )}
            </fieldset>
            {err && (
              <p className="adm-err" role="alert">
                {err}
              </p>
            )}
          </form>
        </Drawer>
      )}
    </>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 7.7-7.7M16 7l2.5 2.5M18.5 4.5 21 7" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

/** «Отключить этот вход?»: the admin's own small dialog, with what stays and a red «Отключить вход» (design artifact, 25.11). */
function OffAsk({ email, onClose, onYes }: { email: string; onClose: () => void; onYes: () => Promise<string | null> }) {
  const A = useA();
  const T = A.account;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const e = await onYes();
      if (e) setErr(e);
      else onClose();
    } catch {
      setErr(A.error);
    }
    setBusy(false);
  };
  return (
    <div className="cc-ask-wrap" onClick={() => !busy && onClose()}>
      <div className="cc-ask" role="alertdialog" aria-modal="true" aria-label={T.offAsk} onClick={(e) => e.stopPropagation()}>
        <h2>{T.offAsk}</h2>
        <p>{T.offText(email)}</p>
        <p className="ac-mute">{T.offHint}</p>
        {err && (
          <p className="adm-err" role="alert">
            {err}
          </p>
        )}
        <div className="cc-ask-btns">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <button type="button" className="cc-btn" autoFocus disabled={busy} onClick={onClose}>
            {A.cancel}
          </button>
          <button type="button" className="cc-btn cc-btn-red" disabled={busy} onClick={() => void go()}>
            {T.offYes}
          </button>
        </div>
      </div>
    </div>
  );
}
