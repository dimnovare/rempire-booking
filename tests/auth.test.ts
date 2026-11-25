import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { changePassword, createUser, deleteUser, LIMITS, listUsers, loginWithCode, loginWithPassword, RESTORE_MINUTES, restoreUser, sendLoginCode, setUserActive, setUserStaff } from "@/lib/auth/login";
import { canUseAdmin, createSession, readSession, revokeSession, SESSION_IDLE_DAYS } from "@/lib/auth/sessions";
import { closeDb, query } from "@/lib/db";
import { EmailDisabled, emailTransport, sendEmail, sentToConsole } from "@/lib/email";
import { bootstrapEmails, bootstrapOwner } from "../tools/bootstrap-owner.mjs";
import { hashPassword, verifyPassword } from "../tools/password.mjs";
import { freshDemo, type Demo } from "./helpers";

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

// test values generated for these tests only
const PW = `test-pass-${Math.random().toString(36).slice(2)}`;
const IP = "203.0.113.7";
const db = { query: async (sql: string, params?: unknown[]) => ({ rows: await query(sql, params) }) };

async function owner(email = "owner@example.test", password: string | null = PW) {
  const r = await createUser(query, demo.business.id, { email, name: "Owner", role: "owner", staffId: null, password });
  if (!r.ok) throw new Error(r.field);
  return r.id;
}

describe("passwords", () => {
  it("scrypt: the right one matches, a wrong one or a broken hash does not", async () => {
    const h = await hashPassword(PW);
    expect(h).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword(PW, h)).toBe(true);
    expect(await verifyPassword(PW + "x", h)).toBe(false);
    expect(await verifyPassword(PW, "scrypt$1$1$1$a$b")).toBe(false);
    expect(await verifyPassword(PW, null)).toBe(false);
    await expect(hashPassword("short")).rejects.toThrow();
  });
});

describe("owners from env", () => {
  it("is created once and never overwritten", async () => {
    const env = { ADMIN_BOOTSTRAP_EMAIL: " Owner@Example.test ", ADMIN_BOOTSTRAP_PASSWORD: PW };
    expect(await bootstrapOwner(db, env)).toBe("created");
    expect(await bootstrapOwner(db, { ...env, ADMIN_BOOTSTRAP_PASSWORD: PW + "-new" })).toBe("kept");
    expect((await loginWithPassword(query, "owner@example.test", PW, IP)).ok).toBe(true);
    const [u] = await query<{ role: string }>("select role from users where email = 'owner@example.test'");
    expect(u.role).toBe("owner");
    expect(await bootstrapOwner(db, { ADMIN_BOOTSTRAP_EMAIL: "a@b.test", ADMIN_BOOTSTRAP_PASSWORD: "short" })).toBe("skipped");
    expect(await bootstrapOwner(db, {})).toBe("skipped");
  });

  it("takes a list: every address gets the password, one already set is kept", async () => {
    await owner("second@example.test", "their-own-password");
    await owner("fourth@example.test", null);
    const env = {
      ADMIN_BOOTSTRAP_EMAIL: "First@Example.test; second@example.test,third@example.test not-an-email ; fourth@example.test",
      ADMIN_BOOTSTRAP_PASSWORD: PW,
    };
    expect(bootstrapEmails(env.ADMIN_BOOTSTRAP_EMAIL)).toEqual([
      "first@example.test", "second@example.test", "third@example.test", "not-an-email", "fourth@example.test",
    ]);
    const log: string[] = [];
    expect(await bootstrapOwner(db, env, (m) => log.push(m))).toBe("created");
    const rows = await query<{ email: string; role: string; has_pw: boolean }>(
      "select email, role, password_hash is not null as has_pw from users order by email",
    );
    expect(rows).toEqual([
      { email: "first@example.test", role: "owner", has_pw: true },
      { email: "fourth@example.test", role: "owner", has_pw: true },
      { email: "second@example.test", role: "owner", has_pw: true },
      { email: "third@example.test", role: "owner", has_pw: true },
    ]);
    // the shared password opens every listed login that had none
    for (const e of ["first@example.test", "third@example.test", "fourth@example.test"]) {
      expect((await loginWithPassword(query, e, PW, IP)).ok).toBe(true);
    }
    // a password already set stays: the shared one does not open it
    expect((await loginWithPassword(query, "second@example.test", "their-own-password", IP)).ok).toBe(true);
    expect((await loginWithPassword(query, "second@example.test", PW, IP)).ok).toBe(false);
    // each login has its own salt, so the rows don't show the password is shared
    const hashes = await query<{ h: string }>("select password_hash as h from users where email <> 'second@example.test'");
    expect(new Set(hashes.map((r) => r.h)).size).toBe(3);
    // counts only, never an address
    expect(log.join("\n")).toContain("2 created, 1 got the password, 1 kept");
    expect(log.join("\n")).not.toContain("@");
    // a second deploy changes nothing
    expect(await bootstrapOwner(db, env)).toBe("kept");
    expect((await query("select 1 from users")).length).toBe(4);
    // an owner added later without a password gets it on the next deploy
    await owner("late@example.test", null);
    const later = { ...env, ADMIN_BOOTSTRAP_EMAIL: env.ADMIN_BOOTSTRAP_EMAIL + " late@example.test" };
    expect(await bootstrapOwner(db, later)).toBe("password_set");
    expect((await loginWithPassword(query, "late@example.test", PW, IP)).ok).toBe(true);
  });
});

describe("password login", () => {
  it("lets the right password in and says the same for a wrong e-mail or password", async () => {
    const id = await owner();
    expect(await loginWithPassword(query, "OWNER@example.test", PW, IP)).toEqual({ ok: true, userId: id });
    expect(await loginWithPassword(query, "owner@example.test", "wrong-password", IP)).toEqual({ ok: false, code: "bad" });
    expect(await loginWithPassword(query, "nobody@example.test", PW, IP)).toEqual({ ok: false, code: "bad" });
  });

  it("waits after too many failures, even with the right password", async () => {
    await owner();
    const now = Date.now();
    for (let i = 0; i < LIMITS.passwordPerEmail; i++) await loginWithPassword(query, "owner@example.test", `wrong-${i}-password`, `198.51.100.${i}`, now);
    expect(await loginWithPassword(query, "owner@example.test", PW, IP, now)).toEqual({ ok: false, code: "wait" });
    // 15 minutes later it is open again
    expect((await loginWithPassword(query, "owner@example.test", PW, IP, now + 16 * 60_000)).ok).toBe(true);
  });

  it("a switched-off login cannot log in, and its sessions end", async () => {
    const id = await owner();
    const token = await createSession(query, id);
    // another business cannot touch it, not even its sessions
    expect(await setUserActive(query, "00000000-0000-4000-8000-000000000000", id, false)).toBe(false);
    expect(await readSession(query, token)).not.toBeNull();
    expect(await setUserActive(query, demo.business.id, id, false)).toBe(true);
    expect(await readSession(query, token)).toBeNull();
    expect(await loginWithPassword(query, "owner@example.test", PW, IP)).toEqual({ ok: false, code: "bad" });
  });
});

describe("«Удалить вход»", () => {
  const MAIL = "front@example.test";

  it("a deleted login leaves the list, cannot log in, frees its e-mail, keeps its row and its name in the history", async () => {
    const actor = await owner();
    const r = await createUser(query, demo.business.id, { email: MAIL, name: "Front", role: "admin", staffId: null, password: PW });
    if (!r.ok) throw new Error(r.field);
    const token = await createSession(query, r.id);
    // another business cannot touch it
    expect(await deleteUser(query, "00000000-0000-4000-8000-000000000000", r.id, actor)).toBe(false);
    expect(await deleteUser(query, demo.business.id, r.id, actor)).toBe(true);
    expect(await deleteUser(query, demo.business.id, r.id, actor)).toBe(false);
    expect(await readSession(query, token)).toBeNull();
    expect((await listUsers(query, demo.business.id)).map((u) => u.id)).not.toContain(r.id);
    expect(await loginWithPassword(query, MAIL, PW, IP)).toEqual({ ok: false, code: "bad" });
    // nothing switches it on again, nor links it to a barber
    expect(await setUserActive(query, demo.business.id, r.id, true)).toBe(false);
    expect(await setUserStaff(query, demo.business.id, r.id, null)).toBe(false);
    // the row stays, what it was is kept, the history says who deleted it
    const [row] = await query<{ email: string; active: boolean; was: { email: string; active: boolean } }>("select email, active, deleted_was as was from users where id = $1", [r.id]);
    expect(row).toMatchObject({ email: `deleted-${r.id}@deleted.invalid`, active: false, was: { email: MAIL, active: true } });
    expect(await query("select actor, action from audit where entity = 'user' and entity_id = $1", [r.id])).toEqual([{ actor: actor, action: "delete" }]);
    // the e-mail is free for a new login
    const again = await createUser(query, demo.business.id, { email: MAIL, name: "Front 2", role: "admin", staffId: null, password: null });
    expect(again.ok).toBe(true);
  });

  it("«Вернуть» brings it back as it was, within ten minutes, unless its e-mail is taken", async () => {
    const actor = await owner();
    const r = await createUser(query, demo.business.id, { email: MAIL, name: "Front", role: "admin", staffId: null, password: PW });
    if (!r.ok) throw new Error(r.field);
    expect(await restoreUser(query, demo.business.id, r.id, actor)).toBe("gone");
    await deleteUser(query, demo.business.id, r.id, actor);
    expect(await restoreUser(query, demo.business.id, r.id, actor, Date.now() + (RESTORE_MINUTES + 1) * 60_000)).toBe("gone");
    expect(await restoreUser(query, demo.business.id, r.id, actor)).toBe("ok");
    expect((await listUsers(query, demo.business.id)).find((u) => u.id === r.id)).toMatchObject({ email: MAIL, active: true });
    expect((await loginWithPassword(query, MAIL, PW, IP)).ok).toBe(true);
    expect((await query<{ action: string }>("select action from audit where entity = 'user' and entity_id = $1 order by id", [r.id])).map((a) => a.action)).toEqual(["delete", "restore"]);
    // deleted again, and a new login takes the e-mail: no way back
    await deleteUser(query, demo.business.id, r.id, actor);
    expect((await createUser(query, demo.business.id, { email: MAIL, name: "New", role: "admin", staffId: null, password: null })).ok).toBe(true);
    expect(await restoreUser(query, demo.business.id, r.id, actor)).toBe("taken");
    expect((await listUsers(query, demo.business.id)).map((u) => u.id)).not.toContain(r.id);
  });
});

describe("sessions", () => {
  it("a cookie token reads back as the user; the database keeps only its hash", async () => {
    const id = await owner();
    const token = await createSession(query, id, { userAgent: "test", ip: IP });
    const u = await readSession(query, token);
    expect(u).toMatchObject({ id, role: "owner", email: "owner@example.test", hasPassword: true });
    expect(canUseAdmin(u)).toBe(true);
    const rows = await query<{ token_hash: string }>("select token_hash from sessions");
    expect(rows[0].token_hash).not.toContain(token);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await readSession(query, token + "x")).toBeNull();
    expect(await readSession(query, "../../etc")).toBeNull();
  });

  it("ends on log out, and after the idle days", async () => {
    const id = await owner();
    const now = Date.now();
    const token = await createSession(query, id, {}, now);
    expect(await readSession(query, token, now + (SESSION_IDLE_DAYS - 1) * 86_400_000)).not.toBeNull();
    // that use slid it forward
    expect(await readSession(query, token, now + (SESSION_IDLE_DAYS + 10) * 86_400_000)).not.toBeNull();
    // and that one again: idle from day IDLE + 10 on, it ends IDLE days later
    expect(await readSession(query, token, now + (2 * SESSION_IDLE_DAYS + 11) * 86_400_000)).toBeNull();
    const t2 = await createSession(query, id);
    await revokeSession(query, t2);
    expect(await readSession(query, t2)).toBeNull();
  });

  it("a barber is not let into the admin", async () => {
    const r = await createUser(query, demo.business.id, { email: "barber@example.test", name: "B", role: "staff", staffId: demo.staff.slava });
    if (!r.ok) throw new Error(r.field);
    const u = await readSession(query, await createSession(query, r.id));
    expect(u).toMatchObject({ role: "staff", staffId: demo.staff.slava, hasPassword: false });
    expect(canUseAdmin(u)).toBe(false);
  });
});

describe("the 6-digit e-mail code", () => {
  const lastCode = () => /(\d{6})/.exec(sentToConsole[sentToConsole.length - 1]?.text ?? "")?.[1] ?? "";

  it("goes only to a known address; the answer is the same either way", async () => {
    await owner();
    const before = sentToConsole.length;
    expect(await sendLoginCode(query, "nobody@example.test", IP)).toBe("sent");
    expect(sentToConsole.length).toBe(before);
    expect(await sendLoginCode(query, "owner@example.test", IP)).toBe("sent");
    expect(sentToConsole.length).toBe(before + 1);
    expect(sentToConsole[sentToConsole.length - 1].to).toBe("owner@example.test");
    const [row] = await query<{ code_hash: string }>("select code_hash from login_codes");
    expect(row.code_hash).not.toContain(lastCode());
  });

  it("the code form answers a stranger's address as it answers a known one", async () => {
    await owner();
    const now = Date.now();
    await sendLoginCode(query, "owner@example.test", IP, now);
    const wrong = lastCode() === "000000" ? "111111" : "000000";
    await sendLoginCode(query, "nobody@example.test", IP, now);
    const tries = async (email: string) => {
      const out: string[] = [];
      for (let i = 0; i < LIMITS.codeTries; i++) {
        const r = await loginWithCode(query, email, wrong, IP, now);
        out.push(r.ok ? "ok" : r.code);
      }
      return out;
    };
    // «bad» four times, then «expired»: nothing tells which address has a login
    expect(await tries("nobody@example.test")).toEqual(await tries("owner@example.test"));
    // and a stranger's code is never one that can be typed
    const [row] = await query<{ attempts: number }>("select attempts from login_codes where email = 'nobody@example.test'");
    expect(row.attempts).toBe(LIMITS.codeTries);
  });

  it("logs in once, and is gone after use", async () => {
    const id = await owner("coded@example.test", null);
    await sendLoginCode(query, "coded@example.test", IP);
    const code = lastCode();
    expect(await loginWithCode(query, "coded@example.test", code, IP)).toEqual({ ok: true, userId: id });
    expect(await loginWithCode(query, "coded@example.test", code, IP)).toEqual({ ok: false, code: "expired" });
  });

  it("five wrong tries or ten minutes end a code", async () => {
    await owner();
    const now = Date.now();
    await sendLoginCode(query, "owner@example.test", IP, now);
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < LIMITS.codeTries - 1; i++) expect(await loginWithCode(query, "owner@example.test", wrong, IP, now)).toEqual({ ok: false, code: "bad" });
    expect(await loginWithCode(query, "owner@example.test", wrong, IP, now)).toEqual({ ok: false, code: "expired" });
    expect(await loginWithCode(query, "owner@example.test", code, IP, now)).toEqual({ ok: false, code: "expired" });

    await sendLoginCode(query, "owner@example.test", IP, now);
    expect(await loginWithCode(query, "owner@example.test", lastCode(), IP, now + 11 * 60_000)).toEqual({ ok: false, code: "expired" });
  });

  it("parallel tries each use up a try", async () => {
    await owner();
    await sendLoginCode(query, "owner@example.test", IP);
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    await Promise.all(Array.from({ length: LIMITS.codeTries + 1 }, () => loginWithCode(query, "owner@example.test", wrong, IP)));
    const [row] = await query<{ attempts: number }>("select attempts from login_codes order by created_at desc limit 1");
    expect(row.attempts).toBe(LIMITS.codeTries);
    expect(await loginWithCode(query, "owner@example.test", code, IP)).toEqual({ ok: false, code: "expired" });
  });

  it("three letters an hour per address", async () => {
    await owner();
    const now = Date.now();
    for (let i = 0; i < LIMITS.codeSendsPerEmail; i++) expect(await sendLoginCode(query, "owner@example.test", IP, now)).toBe("sent");
    expect(await sendLoginCode(query, "owner@example.test", IP, now)).toBe("wait");
  });

  it("says «not set up» when e-mail is off in production", async () => {
    await owner();
    const off = async () => {
      throw new EmailDisabled();
    };
    expect(await sendLoginCode(query, "owner@example.test", IP, Date.now(), off)).toBe("disabled");
    const refused = async () => {
      throw new Error("Resend answered 403");
    };
    expect(await sendLoginCode(query, "owner@example.test", "198.51.100.77", Date.now(), refused)).toBe("failed");
  });
});

describe("password change and logins", () => {
  it("needs the current password, then logs the other devices out", async () => {
    const id = await owner();
    const here = await createSession(query, id);
    const there = await createSession(query, id);
    const me = await readSession(query, here);
    expect(await changePassword(query, id, me!.sessionId, "wrong-password", PW + "-2")).toBe("wrong");
    expect(await changePassword(query, id, me!.sessionId, PW, "short")).toBe("short");
    expect(await changePassword(query, id, me!.sessionId, PW, PW + "-2")).toBe("ok");
    expect(await readSession(query, here)).not.toBeNull();
    expect(await readSession(query, there)).toBeNull();
    expect((await loginWithPassword(query, "owner@example.test", PW + "-2", IP)).ok).toBe(true);
  });

  it("a code-only user sets a first password without an old one", async () => {
    const id = await owner("new@example.test", null);
    expect(await changePassword(query, id, null, null, PW)).toBe("ok");
    expect((await loginWithPassword(query, "new@example.test", PW, IP)).ok).toBe(true);
  });

  it("one login per e-mail", async () => {
    await owner();
    expect(await createUser(query, demo.business.id, { email: "Owner@example.test", name: "", role: "admin", staffId: null })).toEqual({ ok: false, field: "email_taken" });
    expect(await createUser(query, demo.business.id, { email: "not-an-email", name: "", role: "admin", staffId: null })).toEqual({ ok: false, field: "email" });
    expect((await listUsers(query, demo.business.id)).map((u) => u.email)).toEqual(["owner@example.test"]);
  });
});

describe("an owner who cuts too (docs/apps.md)", () => {
  const staffOf = async (id: string) => (await listUsers(query, demo.business.id)).find((u) => u.id === id)?.staffId;

  it("a new owner or admin login may be linked to its barber", async () => {
    const r = await createUser(query, demo.business.id, { email: "renat@example.test", name: "Renat", role: "owner", staffId: demo.staff.slava });
    if (!r.ok) throw new Error(r.field);
    expect(await staffOf(r.id)).toBe(demo.staff.slava);
  });

  it("an existing owner or admin login is linked and unlinked; a barber's login keeps its barber", async () => {
    const id = await owner();
    expect(await staffOf(id)).toBeNull();
    expect(await setUserStaff(query, demo.business.id, id, demo.staff.slava)).toBe(true);
    expect(await staffOf(id)).toBe(demo.staff.slava);
    // a barber that is not this business's, and a login that is not
    expect(await setUserStaff(query, demo.business.id, id, "00000000-0000-4000-8000-000000000000")).toBe(false);
    expect(await setUserStaff(query, "00000000-0000-4000-8000-000000000000", id, null)).toBe(false);
    expect(await staffOf(id)).toBe(demo.staff.slava);
    expect(await setUserStaff(query, demo.business.id, id, null)).toBe(true);
    expect(await staffOf(id)).toBeNull();

    const b = await createUser(query, demo.business.id, { email: "barber@example.test", name: "B", role: "staff", staffId: demo.staff.slava });
    if (!b.ok) throw new Error(b.field);
    expect(await setUserStaff(query, demo.business.id, b.id, null)).toBe(false);
    expect(await staffOf(b.id)).toBe(demo.staff.slava);
  });
});

describe("e-mail transport", () => {
  it("Resend with a key, console in development, off in production", async () => {
    expect(emailTransport({ RESEND_API_KEY: "x", EMAIL_FROM: "REMPIRE <noreply@example.test>", NODE_ENV: "production" })).toBe("resend");
    // a key alone is not enough: Resend refuses an unverified sender
    expect(emailTransport({ RESEND_API_KEY: "x", NODE_ENV: "production" })).toBe("disabled");
    expect(emailTransport({ NODE_ENV: "development" })).toBe("console");
    expect(emailTransport({ NODE_ENV: "production" })).toBe("disabled");
    expect(emailTransport({ NODE_ENV: "production", EMAIL_TRANSPORT: "console" })).toBe("console");
    // console wins over a key: a test server never sends because a local .env holds one
    expect(emailTransport({ RESEND_API_KEY: "x", EMAIL_FROM: "REMPIRE <noreply@example.test>", NODE_ENV: "production", EMAIL_TRANSPORT: "console" })).toBe("console");
    await expect(sendEmail("a@b.test", "s", "t", { NODE_ENV: "production" })).rejects.toBeInstanceOf(EmailDisabled);
  });
});
