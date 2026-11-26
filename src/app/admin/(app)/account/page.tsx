import Link from "next/link";
import { Suspense } from "react";
import { listStaff } from "@/lib/admin/staff";
import { listUsers } from "@/lib/auth/login";
import { requireAdmin } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { PRESETS, isRoleCode, type RoleCode } from "@/lib/auth/rights-catalogue";
import { backfillRights } from "@/lib/auth/rights-store";
import { dbConfigured, query } from "@/lib/db";
import { BellIcon, OutIcon } from "../../icons";
import { Wait } from "../../lang";
import { getA } from "../../lang-server";
import { Titled } from "../star";
import { AccessList, AddLogin, type AccessRow, type RoleOption } from "./access";
import { logout } from "./actions";
import { MyLang, PasswordForm } from "./forms";
import { lastShort } from "./last-login";

/** «Новый вход» offers the rights page's eight roles, in the order of their reach. */
const ROLE_ORDER: RoleCode[] = ["OW", "MG", "AD", "SP", "CC", "AC", "SM", "VW"];

export default function AccountPage({ searchParams }: PageProps<"/admin/account">) {
  return (
    <main className="adm-page adm-wide ac-page">
      {/* the language needs the request, so the heading waits with the rest */}
      <Suspense fallback={<Wait />}>
        <Loaded searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * «Доступ» (Dim, 25.11.2026, design artifact 53PfD3DxCRkbDyjwLVvBHB): two
 * tabs, «Входы» (the salon's logins, access.tsx) and «Мой вход» (this
 * login's language, password, pushes and «Выйти»), ?tab=me. The logins are
 * for a login with «Управлять пользователями» (src/lib/auth/rights.ts): a
 * new one needs the right to invite, switching one off the right to
 * remove, and a login's rights (its own page, [id]/) the right to manage
 * rights. Without the first, only «Мой вход».
 */
async function Loaded({ searchParams }: { searchParams: PageProps<"/admin/account">["searchParams"] }) {
  const A = await getA();
  const T = A.account;
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const [{ user, business }, sp] = await Promise.all([requireAdmin(), searchParams]);
  const owner = can(user, "settings.users");
  const mayInvite = can(user, "settings.users.invite");
  const mayRemove = can(user, "settings.users.remove");
  const mayRights = can(user, "settings.users.rights");
  const tab = owner && sp.tab !== "me" ? "list" : "me";
  // every login has its set before the list names its role (a login from before the rights gets it now)
  if (owner) await backfillRights(query, business.id);
  const [users, staff, presets] = owner
    ? await Promise.all([listUsers(query, business.id), listStaff(query, business.id), query<{ id: string; rights_preset: string | null }>("select id, rights_preset from users where business_id = $1", [business.id])])
    : [[], [], []];
  const roleName = (code: string | null | undefined, role: string) => (isRoleCode(code) ? PRESETS[code][A.lang] : T.roles[role]);
  const myRole = roleName(user.rights.preset, user.role);
  const [mine] = user.staffId ? await query<{ display_name: string }>("select display_name from staff where id = $1 and business_id = $2", [user.staffId, business.id]) : [];

  const head = (
    <div className="ac-head">
      <div className="ac-title">
        <Titled page="account">
          <h1 className="adm-h1">{T.title}</h1>
        </Titled>
        <p className="ac-sub">{T.subtitle}</p>
      </div>
      {tab === "list" && mayInvite && (
        <AddLogin
          staff={staff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))}
          roles={ROLE_ORDER.filter((c) => c !== "OW" || user.role === "owner").map((c) => ({ code: c, name: PRESETS[c][A.lang], hint: T.presetHint[c] }))}
        />
      )}
    </div>
  );
  const tabs = owner && (
    <nav className="ac-tabs" aria-label={T.title}>
      <Link href="/admin/account" prefetch={false} aria-current={tab === "list" ? "page" : undefined}>
        {T.users} <span className="n">{users.length}</span>
      </Link>
      <Link href="/admin/account?tab=me" prefetch={false} aria-current={tab === "me" ? "page" : undefined}>
        {T.me}
      </Link>
    </nav>
  );

  if (tab === "list") {
    const when = new Intl.DateTimeFormat(A.intl, { timeZone: business.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const now = Date.now();
    const rows: AccessRow[] = users.map((u) => {
      const code = presets.find((x) => x.id === u.id)?.rights_preset ?? null;
      const at = u.lastLoginAt ? Date.parse(u.lastLoginAt) : null;
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        code,
        roleName: roleName(code, u.role),
        role: u.role,
        staffId: u.staffId,
        staffName: u.staffId ? (staff.find((s) => s.id === u.staffId)?.name ?? null) : null,
        hasPassword: u.hasPassword,
        last: at === null ? null : when.format(at),
        lastShort: at === null ? null : lastShort(at, business.timezone, now, T, (ms) => when.format(ms)),
        active: u.active,
        // the barbers a login can be: the working ones, and the one it already is
        linkable: staff.filter((s) => s.active || s.id === u.staffId).map((s) => ({ id: s.id, name: s.name })),
      };
    });
    const roles: RoleOption[] = ROLE_ORDER.map((c) => ({ code: c, name: PRESETS[c][A.lang], hint: T.presetHint[c] }));
    return (
      <>
        {head}
        {tabs}
        <AccessList rows={rows} me={user.id} ownerMe={user.role === "owner"} mayRights={mayRights} mayRemove={mayRemove} roles={roles} />
      </>
    );
  }

  return (
    <>
      {head}
      {tabs}
      <div className="ac-me-wrap">
        <section className="ac-card">
          <div className="ac-me-head">
            <span className="ac-av is-l" aria-hidden="true">
              {(user.name || user.email).slice(0, 1).toUpperCase()}
            </span>
            <div className="ac-id">
              <span className="ac-name">
                <b>{user.name || user.email.split("@")[0]}</b>
                <span className="ac-tag is-you">{myRole}</span>
              </span>
              <small>
                {user.email}
                {mine ? ` · ${T.meBarber(mine.display_name)}` : ""}
              </small>
            </div>
          </div>
          <div className="ac-me-row">
            <span className="ac-me-k">{A.langLabel}</span>
            <div className="ac-me-v">
              {/* each login has its own language; the names are in their own language so anyone finds theirs */}
              <MyLang />
              <p className="ac-hint">{T.langHint}</p>
            </div>
          </div>
          <div className="ac-me-row">
            <span className="ac-me-k">{T.password}</span>
            <div className="ac-me-v">
              <PasswordForm hasPassword={user.hasPassword} />
            </div>
          </div>
          <div className="ac-me-row">
            <span className="ac-me-k">{T.notify}</span>
            {/* this device's pushes live in the barber app's half (/b/more) */}
            <div className="ac-me-v ac-me-line">
              <span className="ac-mute">{T.notifyHint}</span>
              <a className="adm-btn adm-btn-line adm-btn-sm" href="/b/more">
                <BellIcon />
                {T.notifySet}
              </a>
            </div>
          </div>
        </section>
        <section className="ac-card ac-out">
          <div>
            <b>{T.logoutHere}</b>
            <p className="ac-hint">{T.logoutHint}</p>
          </div>
          <form action={logout}>
            <button className="adm-btn adm-btn-line adm-btn-sm">
              <OutIcon size={16} />
              {T.logout}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
