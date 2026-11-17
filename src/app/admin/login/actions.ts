"use server";

import { redirect } from "next/navigation";
import { clientIp, startSession } from "@/lib/auth/current";
import { safeAdminPath } from "@/lib/auth/cookie";
import { loginWithCode, loginWithPassword, sendLoginCode } from "@/lib/auth/login";
import { dbConfigured, query } from "@/lib/db";

export type LoginState = { error?: string; sent?: boolean; email?: string };

/** E-mail + password → a session cookie → the admin (or where the login was asked from). */
export async function passwordLogin(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").slice(0, 254);
  if (!dbConfigured()) return { error: "noDb", email };
  const r = await loginWithPassword(query, email, String(form.get("password") ?? "").slice(0, 400), await clientIp());
  if (!r.ok) return { error: r.code, email };
  await startSession(r.userId);
  redirect(safeAdminPath(form.get("next")));
}

/** «Send me a code». The same answer for a known and an unknown address. */
export async function requestCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").slice(0, 254);
  if (!dbConfigured()) return { error: "noDb", email };
  const r = await sendLoginCode(query, email, await clientIp());
  if (r === "wait") return { error: "waitCode", email };
  if (r === "disabled") return { error: "noEmail", email };
  if (r === "failed") return { error: "mailFailed", email };
  return { sent: true, email };
}

export async function codeLogin(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").slice(0, 254);
  if (!dbConfigured()) return { error: "noDb", email, sent: true };
  const r = await loginWithCode(query, email, String(form.get("code") ?? "").slice(0, 20), await clientIp());
  if (!r.ok) return { error: r.code === "bad" ? "badCode" : r.code, email, sent: r.code !== "expired" };
  await startSession(r.userId);
  redirect(safeAdminPath(form.get("next")));
}
