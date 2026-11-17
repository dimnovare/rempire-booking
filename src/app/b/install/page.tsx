/** /b/install: how to put the app on the home screen (B1). Open without a login, so it can be sent as a link. */
import { Logo } from "@/components/brand";
import { Suspense } from "react";
import { InstallGuide } from "./guide";

export default function InstallPage() {
  return (
    <main className="adm-login bx-install">
      <Logo />
      <Suspense fallback={null}>
        <InstallGuide />
      </Suspense>
    </main>
  );
}
