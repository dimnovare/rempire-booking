"use server";

/**
 * «Настройки → Локация»: the changes of «Бренд», «Контакты» and «Галерея».
 * Each action checks the login and «Доступ к настройкам локации»
 * (settings.location) itself and copies its arguments by name;
 * src/lib/admin/location.ts, which is handed the login, asks the same.
 */
import { refresh } from "next/cache";
import { addPhoto, orderPhotos, removeLogo, removePhoto, saveBrand, saveContacts, saveLogo, type LocResult, type PhotosResult } from "@/lib/admin/location";
import { MAX_PHOTOS } from "@/lib/admin/location-form";
import { PHOTO_MAX_BYTES } from "@/lib/admin/staff";
import { requireAdmin } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";

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

/** «Контакты»: every field at once; saved by themselves (autosave.tsx). */
export async function saveContactsAction(input: Record<string, unknown>): Promise<LocResult> {
  const { user, business, may } = await allowed();
  if (!may) return NO;
  const o = input && typeof input === "object" ? input : {};
  const r = await saveContacts(
    business,
    {
      address: str(o.address),
      pin: str(o.pin),
      schedule: text3(o.schedule),
      phone: str(o.phone),
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
