import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { safeAdminPath } from "@/lib/auth/cookie";
import { googleLoginConfigured } from "@/lib/auth/google";
import { A } from "../copy";
import { LoginForm } from "./login-form";

export const metadata = { title: A.login.title };

/** Reasons other pages send here as ?e=… (requireAdmin, the Google callback). */
const LINK_ERRORS = ["role", "bad", "google", "googleUnknown", "googleOther"];

export default function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <main className="adm-login">
      <Logo />
      <h1 className="adm-h1">{A.login.title}</h1>
      <Suspense fallback={<p className="adm-wait">{A.loading}</p>}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/admin/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeAdminPath(typeof sp.next === "string" ? sp.next : "");
  const e = typeof sp.e === "string" && LINK_ERRORS.includes(sp.e) ? sp.e : undefined;
  return <LoginForm next={next} initialError={e} google={googleLoginConfigured()} />;
}
