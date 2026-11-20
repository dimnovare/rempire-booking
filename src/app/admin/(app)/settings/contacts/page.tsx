/**
 * /admin/settings/contacts «Контакты», the second page of «Настройки →
 * Локация» (docs/altegio-pages.md, «Контакты»): the address with its
 * country, postcode and pin on the map, the phones, the opening hours, the
 * site, the social pages and the messengers. The form is contacts-view.tsx.
 */
import { Suspense } from "react";
import { pinText } from "@/lib/admin/location-form";
import { Wait } from "../../../lang";
import { loadLocation } from "../load";
import { ContactsView } from "./contacts-view";

export default function ContactsPage() {
  return (
    <main className="adm-page adm-wide adm-loc">
      <Suspense fallback={<Wait />}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  return loadLocation((loc, view) => (
    <ContactsView
      initial={{
        address: loc.address,
        country: loc.country,
        postcode: loc.postcode,
        pin: pinText(loc.pin),
        schedule: loc.schedule,
        phones: loc.phones,
        website: loc.website,
        facebook: loc.facebook,
        instagram: loc.instagram,
        whatsapp: loc.whatsapp,
        telegram: loc.telegram,
        viber: loc.viber,
      }}
      view={view}
    />
  ));
}
