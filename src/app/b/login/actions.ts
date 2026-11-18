"use server";

/**
 * The barber app's login: the same logins, limits and sessions as the admin
 * (src/lib/auth/login.ts, 90 days on this device), landing on the page that
 * asked for the login, else on the app's start (/b/start).
 */
import { redirect } from "next/navigation";
import { afterLogin } from "@/lib/auth/cookie";
import { clientIp, startSession } from "@/lib/auth/current";
import { loginWithCode, loginWithPassword, sendLoginCode } from "@/lib/auth/login";
import { dbConfigured, query } from "@/lib/db";

export type LoginState = { error?: string; sent?: boolean; email?: string };

export async function passwordLogin(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").slice(0, 254);
  if (!dbConfigured()) return { error: "noDb", email };
  const r = await loginWithPassword(query, email, String(form.get("password") ?? "").slice(0, 400), await clientIp());
  if (!r.ok) return { error: r.code, email };
  await startSession(r.userId);
  redirect(afterLogin(form.get("next")));
}

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
  redirect(afterLogin(form.get("next")));
}
