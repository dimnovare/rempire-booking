/** /b/install: how to put the app on the home screen (B1). Open without a login, so it can be sent as a link. */
import { Logo } from "@/components/brand";
import { Suspense } from "react";
import { InstallGuide } from "./guide";

export default function InstallPage() {
  return (
    <div className="bx-inst-page">
      <main className="adm-login bx-install">
        <Suspense fallback={<Logo />}>
          <InstallGuide logo={<Logo />} />
        </Suspense>
      </main>
    </div>
  );
}
