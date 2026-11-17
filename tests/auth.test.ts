import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { changePassword, createUser, LIMITS, listUsers, loginWithCode, loginWithPassword, sendLoginCode, setUserActive } from "@/lib/auth/login";
import { canUseAdmin, createSession, readSession, revokeSession, SESSION_IDLE_DAYS } from "@/lib/auth/sessions";
import { closeDb, query } from "@/lib/db";
import { EmailDisabled, emailTransport, sendEmail, sentToConsole } from "@/lib/email";
import { bootstrapOwner } from "../tools/bootstrap-owner.mjs";
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

describe("the first owner from env", () => {
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
    await setUserActive(query, demo.business.id, id, false);
    expect(await readSession(query, token)).toBeNull();
    expect(await loginWithPassword(query, "owner@example.test", PW, IP)).toEqual({ ok: false, code: "bad" });
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

describe("e-mail transport", () => {
  it("Resend with a key, console in development, off in production", async () => {
    expect(emailTransport({ RESEND_API_KEY: "x", NODE_ENV: "production" })).toBe("resend");
    expect(emailTransport({ NODE_ENV: "development" })).toBe("console");
    expect(emailTransport({ NODE_ENV: "production" })).toBe("disabled");
    expect(emailTransport({ NODE_ENV: "production", EMAIL_TRANSPORT: "console" })).toBe("console");
    await expect(sendEmail("a@b.test", "s", "t", { NODE_ENV: "production" })).rejects.toBeInstanceOf(EmailDisabled);
  });
});
