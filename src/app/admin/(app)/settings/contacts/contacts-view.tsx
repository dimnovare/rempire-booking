"use client";

/**
 * «Контакты»: where the salon is, when it is open and how to reach it, in
 * the cards of the tool we follow (docs/altegio-pages.md, «Контакты») and
 * the board Dim confirmed (decision page round 11, Contacts-Map):
 *
 *   «Адрес»     the country and the postcode, the address with «Найти»,
 *               the map with the pin (src/components/osm-map.tsx), and the
 *               point the salon's page shows. «Найти» asks OpenStreetMap
 *               from the server (geocodeAction), only on that tap; the pin
 *               lands there and the country and the postcode come with it.
 *               The pin can be dragged, and a tap on the map puts it. A
 *               pasted map link or two numbers stay, folded, as before.
 *   «Телефоны»  every number with an optional label; «+ Добавить номер»;
 *               the first is the main one (letters, SMS, the booking site).
 *   «Расписание», «Сайт», «Социальные сети», «Мессенджеры» as before.
 *
 * Everything saves by itself (autosave.tsx), checked here with the
 * server's own functions (src/lib/admin/location-form.ts).
 */
import { useMemo, useState } from "react";
import { OsmMap } from "@/components/osm-map";
import { cleanContacts, COUNTRIES, LOC_MAX, MAX_PHONES, parsePin, pinLink, pinText, type PhoneEntry, type Text3 } from "@/lib/admin/location-form";
import { BinIcon, SearchIcon } from "../../../icons";
import { useA } from "../../../lang";
import { useAutoSave } from "../../autosave";
import { geocodeAction, saveContactsAction } from "../actions";
import { LocField, LocHead, LocSaveBar } from "../parts";
import "./contacts.css";

export type ContactsDraft = {
  address: string;
  country: string;
  postcode: string;
  pin: string;
  schedule: Text3;
  phones: PhoneEntry[];
  website: string;
  facebook: string;
  instagram: string;
  whatsapp: string;
  telegram: string;
  viber: string;
};
type Flat = "address" | "postcode" | "pin" | "website" | "facebook" | "instagram" | "whatsapp" | "telegram" | "viber";
type Geo = { st: "idle" } | { st: "busy" } | { st: "found"; place: string } | { st: "none" | "gate" | "failed" | "empty" };

const LANGS = ["ru", "et", "en"] as const;
const EMPTY: PhoneEntry = { number: "", label: "" };
/** Nothing a phone would «fix»: no capitals, no spelling, no autofill from the owner's own details. */
const RAW = { autoCapitalize: "off", autoCorrect: "off", spellCheck: false, autoComplete: "off" } as const;
/** What the server is sent: the main number is the list's first. */
const input = (v: ContactsDraft) => ({ ...v, phone: v.phones.find((p) => p.number.trim())?.number ?? "" });

export function ContactsView({ initial, view }: { initial: ContactsDraft; view: string }) {
  const A = useA();
  const C = A.loc.contacts;
  const [d, setD] = useState<ContactsDraft>(initial);
  const [geo, setGeo] = useState<Geo>({ st: "idle" });
  const [focus, setFocus] = useState(0);
  const [paste, setPaste] = useState(false);
  const pin = parsePin(d.pin);
  const pinWrong = !pin.ok ? (pin.why === "short" ? C.pinShort : pin.why === "range" ? C.pinRange : C.pinBad) : null;
  const check = (v: ContactsDraft) => {
    const p = parsePin(v.pin);
    if (!p.ok) return p.why === "short" ? C.pinShort : p.why === "range" ? C.pinRange : C.pinBad;
    const r = cleanContacts(input(v));
    return r.ok ? null : A.visit.invalid(r.field);
  };
  const auto = useAutoSave<ContactsDraft>(d, setD, (v) => saveContactsAction(input(v)), { check, label: A.nav.contacts });
  const set = (k: Flat) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  const shown = pinWrong != null && auto.phase === "bad";
  const pasteOpen = paste || !pin.ok;
  const here = pin.ok ? pin.pin : null;

  // «Страна»: the countries by their names in the admin's language, the salon's own kept even when it is not in the list
  const countries = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([A.intl], { type: "region" });
    } catch {
      names = null;
    }
    const codes: string[] = COUNTRIES.includes(d.country as (typeof COUNTRIES)[number]) ? [...COUNTRIES] : [...COUNTRIES, d.country];
    return codes.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, A.intl));
  }, [A.intl, d.country]);

  /* ---------- «Найти» ---------- */
  const find = async () => {
    if (!d.address.trim()) return setGeo({ st: "empty" });
    setGeo({ st: "busy" });
    try {
      const r = await geocodeAction(d.address, d.country);
      if (r.ok) {
        const { hit } = r;
        setD((cur) => ({ ...cur, pin: pinText({ lat: hit.lat, lng: hit.lng }), country: hit.country || cur.country, postcode: hit.postcode || cur.postcode }));
        setFocus((n) => n + 1);
        setGeo({ st: "found", place: hit.label });
      } else setGeo({ st: r.why === "busy" ? "gate" : r.why });
    } catch {
      setGeo({ st: "failed" });
    }
  };
  const geoText =
    geo.st === "found" ? C.found(geo.place) : geo.st === "none" ? C.findNone : geo.st === "gate" ? C.findBusy : geo.st === "failed" ? C.findFailed : geo.st === "empty" ? C.findEmpty : "";

  /* ---------- «Телефоны» ---------- */
  // always one row to type into, even with no number yet
  const rows = d.phones.length ? d.phones : [EMPTY];
  const setPhone = (i: number, patch: Partial<PhoneEntry>) => setD({ ...d, phones: rows.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const dropPhone = (i: number) => setD({ ...d, phones: rows.filter((_, j) => j !== i) });
  const addPhone = () => setD({ ...d, phones: [...rows, EMPTY] });

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
          <div className="lcx-cp">
            <div className="adm-field">
              <label htmlFor="loc-country">{C.country}</label>
              <select id="loc-country" autoComplete="country" value={d.country} onChange={(e) => setD({ ...d, country: e.target.value })}>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label htmlFor="loc-postcode">{C.postcode}</label>
              <input id="loc-postcode" {...RAW} autoComplete="postal-code" maxLength={LOC_MAX.postcode} value={d.postcode} onChange={set("postcode")} />
            </div>
          </div>
          <div className="adm-field">
            <label htmlFor="loc-address">{C.address}</label>
            <div className="lcx-find">
              <input
                id="loc-address"
                maxLength={LOC_MAX.address}
                autoComplete="street-address"
                value={d.address}
                onChange={set("address")}
                onKeyDown={(e) => {
                  // Enter finds it, as the button: the form's own submit only saves
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void find();
                  }
                }}
              />
              <button type="button" className="adm-btn adm-btn-line lcx-find-btn" title={C.findFor} disabled={geo.st === "busy"} onClick={() => void find()}>
                <SearchIcon />
                {geo.st === "busy" ? C.finding : C.find}
              </button>
            </div>
            <small className={`lcx-geo${geo.st === "found" ? " is-ok" : geo.st === "idle" || geo.st === "busy" ? "" : " is-bad"}`} role="status">
              {geoText}
            </small>
          </div>
          <OsmMap
            className="lcx-map"
            pin={here}
            zoom={here ? 17 : 13}
            focus={focus}
            label={C.map}
            words={{ zoomIn: C.zoomIn, zoomOut: C.zoomOut, pin: C.pinMove, hint: C.dragHint }}
            onPin={(p) => setD((cur) => ({ ...cur, pin: pinText(p) }))}
          />
          <p className="lcx-point" id="loc-point">
            {here ? C.pinLine(`${here.lat.toFixed(4)}, ${here.lng.toFixed(4)}`) : C.noPin}
          </p>
          <button type="button" className="adm-link lcx-paste" aria-expanded={pasteOpen} aria-controls="loc-paste" onClick={() => setPaste(!pasteOpen)}>
            {C.pinPaste}
          </button>
          {pasteOpen && (
            <div className="adm-field" id="loc-paste">
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
          )}
        </section>

        <section className="adm-card loc-card" aria-labelledby="loc-phones">
          <h2 className="loc-h" id="loc-phones">
            {C.phones}
          </h2>
          <ul className="lcx-phones">
            {rows.map((p, i) => (
              <li key={i}>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete={i === 0 ? "tel" : "off"}
                  maxLength={LOC_MAX.phone}
                  aria-label={C.phoneN(i + 1)}
                  placeholder={C.phoneHolder(i + 1)}
                  value={p.number}
                  onChange={(e) => setPhone(i, { number: e.target.value })}
                />
                <input
                  className="lcx-label"
                  {...RAW}
                  maxLength={LOC_MAX.phoneLabel}
                  aria-label={C.labelN(i + 1)}
                  placeholder={C.labelHolder}
                  value={p.label}
                  onChange={(e) => setPhone(i, { label: e.target.value })}
                />
                <button type="button" className="adm-ibtn lcx-bin" aria-label={C.phoneRemove(i + 1)} disabled={rows.length === 1 && !p.number && !p.label} onClick={() => dropPhone(i)}>
                  <BinIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
          {rows.length < MAX_PHONES ? (
            <button type="button" className="lcx-add" onClick={addPhone}>
              + {C.phoneAdd}
            </button>
          ) : (
            <small className="adm-meta">{C.phonesFull(MAX_PHONES)}</small>
          )}
          <small className="adm-meta">{C.phonesHint}</small>
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

        <section className="adm-card loc-card" aria-labelledby="loc-web">
          <h2 className="loc-h" id="loc-web">
            {C.site}
          </h2>
          <LocField id="loc-site" label={C.siteField} hint={C.siteHint}>
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
