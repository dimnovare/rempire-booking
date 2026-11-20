"use client";

/**
 * «Контакты»: where the salon is, when it is open and how to reach it, in
 * the cards of the tool we follow (docs/altegio-pages.md, «Контакты»):
 * «Адрес», «Расписание», «Телефон и сайт», «Социальные сети»,
 * «Мессенджеры». Everything saves by itself (autosave.tsx), checked here
 * with the server's own functions (src/lib/admin/location-form.ts).
 *
 * The pin is typed or pasted as text: two numbers, or a link from a map.
 * What was found in it is shown under the field, with a link to see it on
 * the map, so a wrong paste shows before a client sees it.
 */
import { useState } from "react";
import { cleanContacts, LOC_MAX, parsePin, pinLink, pinText, type Text3 } from "@/lib/admin/location-form";
import { useA } from "../../../lang";
import { useAutoSave } from "../../autosave";
import { saveContactsAction } from "../actions";
import { LocField, LocHead, LocSaveBar } from "../parts";

type Draft = {
  address: string;
  pin: string;
  schedule: Text3;
  phone: string;
  website: string;
  facebook: string;
  instagram: string;
  whatsapp: string;
  telegram: string;
  viber: string;
};
type Flat = Exclude<keyof Draft, "schedule">;

const LANGS = ["ru", "et", "en"] as const;
/** Nothing a phone would «fix»: no capitals, no spelling, no autofill from the owner's own details. */
const RAW = { autoCapitalize: "off", autoCorrect: "off", spellCheck: false, autoComplete: "off" } as const;

export function ContactsView({ initial, view }: { initial: Draft; view: string }) {
  const A = useA();
  const C = A.loc.contacts;
  const [d, setD] = useState<Draft>(initial);
  const pin = parsePin(d.pin);
  const pinWrong = !pin.ok ? (pin.why === "short" ? C.pinShort : pin.why === "range" ? C.pinRange : C.pinBad) : null;
  const check = (v: Draft) => {
    const p = parsePin(v.pin);
    if (!p.ok) return p.why === "short" ? C.pinShort : p.why === "range" ? C.pinRange : C.pinBad;
    const r = cleanContacts(v);
    return r.ok ? null : A.visit.invalid(r.field);
  };
  const auto = useAutoSave<Draft>(d, setD, (v) => saveContactsAction(v), { check, label: A.nav.contacts });
  const set = (k: Flat) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  const shown = pinWrong != null && auto.phase === "bad";

  return (
    <div className="loc">
      <LocHead page="contacts" view={view} />
      <form
        className="loc-form"
        onBlur={auto.flush}
        onSubmit={(e) => {
          e.preventDefault();
          auto.flush();
        }}
      >
        <section className="adm-card loc-card" aria-labelledby="loc-where">
          <h2 className="loc-h" id="loc-where">
            {C.where}
          </h2>
          <LocField id="loc-address" label={C.address} hint={C.addressHint}>
            <input id="loc-address" aria-describedby="loc-address-hint" maxLength={LOC_MAX.address} autoComplete="street-address" value={d.address} onChange={set("address")} />
          </LocField>
          <div className="adm-field">
            <label htmlFor="loc-pin">{C.pin}</label>
            <input id="loc-pin" {...RAW} inputMode="url" maxLength={2000} value={d.pin} onChange={set("pin")} aria-invalid={shown ? true : undefined} aria-describedby="loc-pin-note" />
            {/* what was found in the text: the numbers and a look at them on the map; what is wrong once typing stops */}
            {pin.ok && pin.pin ? (
              <span className="loc-pin" id="loc-pin-note">
                <span>{C.pinIs(pinText(pin.pin))}</span>
                <a className="adm-link" href={pinLink(pin.pin)} target="_blank" rel="noreferrer">
                  {C.pinOpen}
                </a>
              </span>
            ) : shown ? (
              <small className="adm-err" id="loc-pin-note">
                {pinWrong}
              </small>
            ) : (
              <small className="adm-meta" id="loc-pin-note">
                {C.pinHint}
              </small>
            )}
          </div>
        </section>

        <section className="adm-card loc-card" aria-labelledby="loc-hours">
          <h2 className="loc-h" id="loc-hours">
            {C.hours}
          </h2>
          <div className="loc-langs">
            {LANGS.map((l) => (
              <label key={l} className="adm-field">
                <span>{l.toUpperCase()}</span>
                <input
                  lang={l}
                  maxLength={LOC_MAX.schedule}
                  aria-label={`${C.hours} (${l.toUpperCase()})`}
                  aria-describedby="loc-hours-hint"
                  value={d.schedule[l]}
                  onChange={(e) => setD({ ...d, schedule: { ...d.schedule, [l]: e.target.value } })}
                />
              </label>
            ))}
          </div>
          <small className="adm-meta" id="loc-hours-hint">
            {C.hoursHint}
          </small>
        </section>

        <section className="adm-card loc-card" aria-labelledby="loc-phone">
          <h2 className="loc-h" id="loc-phone">
            {C.phoneSite}
          </h2>
          <LocField id="loc-phone" label={C.phone} hint={C.phoneHint}>
            <input id="loc-phone" aria-describedby="loc-phone-hint" type="tel" inputMode="tel" maxLength={LOC_MAX.phone} autoComplete="tel" value={d.phone} onChange={set("phone")} />
          </LocField>
          <LocField id="loc-site" label={C.site} hint={C.siteHint}>
            {/* not type="url": a bare www.… is fine here, and the browser would refuse it */}
            <input id="loc-site" aria-describedby="loc-site-hint" {...RAW} inputMode="url" maxLength={LOC_MAX.website} value={d.website} onChange={set("website")} />
          </LocField>
        </section>

        <section className="adm-card loc-card" aria-labelledby="loc-socials">
          <h2 className="loc-h" id="loc-socials">
            {C.socials}
          </h2>
          <LocField id="loc-facebook" label="Facebook">
            <input id="loc-facebook" aria-describedby="loc-socials-hint" {...RAW} inputMode="url" maxLength={LOC_MAX.social} value={d.facebook} onChange={set("facebook")} />
          </LocField>
          <LocField id="loc-instagram" label="Instagram">
            <input id="loc-instagram" aria-describedby="loc-socials-hint" {...RAW} inputMode="url" maxLength={LOC_MAX.social} value={d.instagram} onChange={set("instagram")} />
          </LocField>
          <small className="adm-meta" id="loc-socials-hint">
            {C.socialHint}
          </small>
        </section>

        <section className="adm-card loc-card" aria-labelledby="loc-chats">
          <h2 className="loc-h" id="loc-chats">
            {C.messengers}
          </h2>
          <LocField id="loc-whatsapp" label="WhatsApp" hint={C.numberHint}>
            <input id="loc-whatsapp" aria-describedby="loc-whatsapp-hint" type="tel" inputMode="tel" {...RAW} maxLength={LOC_MAX.social} value={d.whatsapp} onChange={set("whatsapp")} />
          </LocField>
          <LocField id="loc-telegram" label="Telegram" hint={C.telegramHint}>
            <input id="loc-telegram" aria-describedby="loc-telegram-hint" {...RAW} inputMode="url" maxLength={LOC_MAX.social} value={d.telegram} onChange={set("telegram")} />
          </LocField>
          <LocField id="loc-viber" label="Viber" hint={C.numberHint}>
            <input id="loc-viber" aria-describedby="loc-viber-hint" type="tel" inputMode="tel" {...RAW} maxLength={LOC_MAX.social} value={d.viber} onChange={set("viber")} />
          </LocField>
        </section>
      </form>
      <LocSaveBar auto={auto} />
    </div>
  );
}
