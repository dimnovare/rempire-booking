/**
 * /admin/settings/gallery «Галерея», the last page of «Настройки →
 * Локация» (docs/altegio-pages.md, «Галерея»): up to eight photos on the
 * salon's page, in order. The page is gallery-view.tsx.
 */
import { Suspense } from "react";
import { Wait } from "../../../lang";
import { loadLocation } from "../load";
import { GalleryView } from "./gallery-view";

export default function GalleryPage() {
  return (
    <main className="adm-page adm-wide adm-loc">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  return loadLocation((loc, view) => <GalleryView initial={loc.photos} view={view} />);
}
