/**
 * What each page of «Настройки → Локация» starts from: the salon's page as
 * it is now (src/lib/admin/location.ts) and the address of that page on the
 * booking site, in the admin's language. Only a login with «Доступ к
 * настройкам локации» (settings.location); anyone else gets NoRights.
 */
import { connection } from "next/server";
import { loadLocationSettings, locationMay, type LocationSettings } from "@/lib/admin/location";
import { requireAdmin } from "@/lib/auth/current";
import { dbConfigured, query } from "@/lib/db";
import { adminLang, getA } from "../../lang-server";
import { NoRights } from "../no-rights";

export async function loadLocation(view: (loc: LocationSettings, salonPage: string) => React.ReactNode): Promise<React.ReactNode> {
  // a login and the salon's details as they are now: always at request time
  await connection();
  const A = await getA();
  if (!dbConfigured()) return <p className="adm-wait">{A.noDb}</p>;
  const { user, business } = await requireAdmin();
  if (!locationMay(user)) return <NoRights />;
  const loc = await loadLocationSettings(query, business.id, user);
  if (!loc) return <p className="adm-wait">{A.loc.noLocation}</p>;
  return view(loc, `/${await adminLang()}/about`);
}
