import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { LoginPanel } from "@/components/login/panel";
import { LINK_ERRORS } from "@/components/login/words";
import { TestBanner } from "@/components/test-banner";
import { safeBarberPath } from "@/lib/auth/cookie";
import { googleLoginConfigured } from "@/lib/auth/google";
import { barberLang } from "../lang-server";

/** The barber app's login: the same page as the admin's (src/components/login/panel.tsx). */
export default function LoginPage({ searchParams }: PageProps<"/b/login">) {
  return (
    <>
      <TestBanner app="b" />
      <main className="lp">
        <div className="lp-card">
          <Logo />
          <Suspense fallback={<div className="lp-wait" />}>
            <Form searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/b/login">["searchParams"] }) {
  const [sp, lang] = await Promise.all([searchParams, barberLang()]);
  const next = safeBarberPath(typeof sp.next === "string" ? sp.next : "");
  const e = typeof sp.e === "string" && (LINK_ERRORS as readonly string[]).includes(sp.e) ? sp.e : undefined;
  return <LoginPanel app="b" lang={lang} next={next} initialError={e} google={googleLoginConfigured()} />;
}
