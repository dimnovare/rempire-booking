import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { LoginPanel } from "@/components/login/panel";
import { LINK_ERRORS } from "@/components/login/words";
import { TestBanner } from "@/components/test-banner";
import { safeAdminPath } from "@/lib/auth/cookie";
import { googleLoginConfigured } from "@/lib/auth/google";
import { adminLang } from "../lang-server";

/** The admin's login: the same page as the barber app's (src/components/login/panel.tsx). */
export default function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <>
      <TestBanner app="admin" />
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

async function Form({ searchParams }: { searchParams: PageProps<"/admin/login">["searchParams"] }) {
  const [sp, lang] = await Promise.all([searchParams, adminLang()]);
  const next = safeAdminPath(typeof sp.next === "string" ? sp.next : "");
  const e = typeof sp.e === "string" && (LINK_ERRORS as readonly string[]).includes(sp.e) ? sp.e : undefined;
  return <LoginPanel app="admin" lang={lang} next={next} initialError={e} google={googleLoginConfigured()} />;
}
