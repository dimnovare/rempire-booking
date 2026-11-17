import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { safeAdminPath } from "@/lib/auth/cookie";
import { googleLoginConfigured } from "@/lib/auth/google";
import { Wait } from "../lang";
import { LoginForm, LoginLang, LoginTitle } from "./login-form";

/** Reasons other pages send here as ?e=… (requireAdmin, the Google callback). */
const LINK_ERRORS = ["role", "bad", "google", "googleUnknown", "googleOther"];

export default function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <main className="adm-login">
      <Logo />
      <LoginTitle />
      <Suspense fallback={<Wait />}>
        <Form searchParams={searchParams} />
      </Suspense>
      {/* each language under its own name: whoever cannot read this page still finds theirs */}
      <LoginLang />
    </main>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/admin/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeAdminPath(typeof sp.next === "string" ? sp.next : "");
  const e = typeof sp.e === "string" && LINK_ERRORS.includes(sp.e) ? sp.e : undefined;
  return <LoginForm next={next} initialError={e} google={googleLoginConfigured()} />;
}
