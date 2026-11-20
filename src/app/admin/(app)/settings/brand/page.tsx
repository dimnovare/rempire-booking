/**
 * /admin/settings/brand «Бренд», the first page of «Настройки → Локация»
 * (docs/altegio-pages.md, «Бренд»): the salon's name in online booking,
 * its words in three languages and its logo. The form is brand-view.tsx.
 */
import { Suspense } from "react";
import { Wait } from "../../../lang";
import { loadLocation } from "../load";
import { BrandView } from "./brand-view";

export default function BrandPage() {
  return (
    <main className="adm-page adm-wide adm-loc">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  return loadLocation((loc, view) => <BrandView initial={{ name: loc.name, about: loc.about }} logo={loc.logo} view={view} />);
}
