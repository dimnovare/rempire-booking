import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { Nav, NavLinks } from "./nav";

/** The logged-in admin: logo and sections on top (wide screens) or at the bottom (phones). Each page checks the login itself. */
export default function AdminApp({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-app">
      <header className="adm-top">
        <a href="/admin" className="adm-brand" aria-label="REMPIRE">
          <Logo />
        </a>
        <Suspense fallback={<NavLinks path="" />}>
          <Nav />
        </Suspense>
      </header>
      <div className="adm-main">{children}</div>
    </div>
  );
}
