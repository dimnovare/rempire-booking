import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { safeBarberPath } from "@/lib/auth/cookie";
import { googleLoginConfigured } from "@/lib/auth/google";
import { getB } from "../lang-server";
import { LoginForm } from "./login-form";

/** Reasons other pages send here as ?e=… (requireStaff, the Google callback). */
const LINK_ERRORS = ["role", "nostaff", "bad", "google", "googleUnknown", "googleOther"];

export default function LoginPage({ searchParams }: PageProps<"/b/login">) {
  return (
    <main className="adm-login">
      <Logo />
      <Suspense fallback={null}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/b/login">["searchParams"] }) {
  const B = await getB();
  const sp = await searchParams;
  const next = safeBarberPath(typeof sp.next === "string" ? sp.next : "");
  const e = typeof sp.e === "string" && LINK_ERRORS.includes(sp.e) ? sp.e : undefined;
  return (
    <>
      <title>{`${B.login.title} · REMPIRE`}</title>
      <div className="bx-login-head">
        <h1 className="adm-h1">{B.login.title}</h1>
        <p className="adm-meta">{B.login.lead}</p>
      </div>
      <LoginForm next={next} initialError={e} google={googleLoginConfigured()} />
      <Link href="/b/install" className="adm-link" prefetch={false}>
        {B.login.install}
      </Link>
    </>
  );
}
