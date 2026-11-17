import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { safeAdminPath } from "@/lib/auth/cookie";
import { googleLoginConfigured } from "@/lib/auth/google";
import { A } from "../copy";
import { LoginForm } from "./login-form";

export const metadata = { title: A.login.title };

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
  return <LoginForm next={next} initialError={sp.e === "role" ? "role" : undefined} google={googleLoginConfigured()} />;
}
