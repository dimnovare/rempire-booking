"use server";

/**
 * «Настройки → Локация»: the changes of «Бренд», «Контакты» and «Галерея».
 * Each action checks the login and «Доступ к настройкам локации»
 * (settings.location) itself and copies its arguments by name;
 * src/lib/admin/location.ts, which is handed the login, asks the same.
 */
import { refresh } from "next/cache";
import { addPhoto, orderPhotos, removeLogo, removePhoto, saveBrand, saveContacts, saveLogo, type LocResult, type PhotosResult } from "@/lib/admin/location";
import { cleanCountry, HOME_COUNTRY, LOC_MAX, MAX_PHONES, MAX_PHOTOS } from "@/lib/admin/location-form";
import { PHOTO_MAX_BYTES } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import { query } from "@/lib/db";
import { geocode, type GeoResult } from "@/lib/geocode";

const NO = { ok: false as const, field: "forbidden" };

const str = (v: unknown) => (v == null ? "" : String(v));
const text3 = (v: unknown) => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { ru: str(o.ru), et: str(o.et), en: str(o.en) };
};

async function allowed() {
  const { user, business } = await requireAdmin();
  return { user, business, may: can(user, "settings.location") };
}

/** The image in the form's «image» field, already shrunk by the browser; null when there is none or it is too big. */
async function imageOf(form: FormData): Promise<Uint8Array | null> {
  const file = form?.get?.("image");
  if (!(file instanceof Blob) || file.size < 1 || file.size > PHOTO_MAX_BYTES) return null;
  return new Uint8Array(await file.arrayBuffer());
}

/** «Бренд»: the name and the words; saved by themselves (autosave.tsx). */
export async function saveBrandAction(input: { name: string; about: { ru: string; et: string; en: string } }): Promise<LocResult> {
  const { user, business, may } = await allowed();
  if (!may) return NO;
  const r = await saveBrand(business, { name: str(input?.name), about: text3(input?.about) }, user);
  if (r.ok) refresh();
  return r;
}

/** The phones as the page sends them, copied by name: five rows and a few empty ones at most. */
const phones = (v: unknown) =>
  Array.isArray(v)
    ? v.slice(0, MAX_PHONES * 2).map((p) => {
        const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
        return { number: str(o.number), label: str(o.label) };
      })
    : undefined;

/** «Контакты»: every field at once; saved by themselves (autosave.tsx). */
export async function saveContactsAction(input: Record<string, unknown>): Promise<LocResult> {
  const { user, business, may } = await allowed();
  if (!may) return NO;
  const o = input && typeof input === "object" ? input : {};
  const r = await saveContacts(
    business,
    {
      address: str(o.address),
      country: str(o.country),
      postcode: str(o.postcode),
      pin: str(o.pin),
      schedule: text3(o.schedule),
      phone: str(o.phone),
      phones: phones(o.phones),
      website: str(o.website),
      facebook: str(o.facebook),
      instagram: str(o.instagram),
      whatsapp: str(o.whatsapp),
      telegram: str(o.telegram),
      viber: str(o.viber),
    },
    user,
  );
  if (r.ok) refresh();
  return r;
}

/**
 * «Найти»: the typed address on OpenStreetMap (src/lib/geocode.ts), only on
 * that tap, only for a login that may change the contacts. Nothing is saved
 * here: the page puts the pin, the country and the postcode into its form,
 * and the form saves itself.
 */
export async function geocodeAction(address: string, country: string): Promise<GeoResult> {
  const { user, may } = await allowed();
  if (!may) return { ok: false, why: "failed" };
  const lang = /^(ru|et|en)$/.test(String(user.locale ?? "")) ? String(user.locale) : "ru";
  return geocode(query, str(address).slice(0, LOC_MAX.address), cleanCountry(str(country)) ?? HOME_COUNTRY, lang);
}

/** A new logo. Returns its address. */
export async function uploadLogoAction(form: FormData): Promise<{ ok: true; url: string } | { ok: false; field: string }> {
  const { user, business, may } = await allowed();
  if (!may) return NO;
  const bytes = await imageOf(form);
  if (!bytes) return { ok: false, field: "logo" };
  const r = await saveLogo(business, bytes, user);
  if (r.ok) refresh();
  return r;
}

export async function removeLogoAction(): Promise<LocResult> {
  const { user, business, may } = await allowed();
  if (!may) return NO;
  const r = await removeLogo(business, user);
  if (r.ok) refresh();
  return r;
}

/** One photo more at the gallery's end. Returns the gallery after it. */
export async function addPhotoAction(form: FormData): Promise<PhotosResult> {
  const { user, business, may } = await allowed();
  if (!may) return NO;
  const bytes = await imageOf(form);
  if (!bytes) return { ok: false, field: "photo" };
  const r = await addPhoto(business, bytes, user);
  if (r.ok) refresh();
  return r;
}

export async function removePhotoAction(url: string): Promise<PhotosResult> {
  const { user, business, may } = await allowed();
  if (!may) return NO;
  const r = await removePhoto(business, str(url), user);
  if (r.ok) refresh();
  return r;
}

export async function orderPhotosAction(urls: string[]): Promise<PhotosResult> {
  const { user, business, may } = await allowed();
  if (!may) return NO;
  const list = (Array.isArray(urls) ? urls : []).slice(0, MAX_PHOTOS + 1).map(str);
  const r = await orderPhotos(business, list, user);
  if (r.ok) refresh();
  return r;
}
