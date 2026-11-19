/**
 * How the barber app's half (/b) is framed for this request (docs/apps.md,
 * «One app for Renat»). The pages are the same for everyone; the bars
 * around them are not:
 *
 *   - "barber": a barber's own login. His app: his bar, his name on top;
 *   - "support": an owner or the front desk looking at a barber's own app,
 *     opened from «Барберы». The barber's bar, with a line that says whose
 *     app it is and the way back;
 *   - "own": an owner or the front desk linked to a barber, on his own
 *     pages. The one app's frame: the same top bar and bottom bar as in the
 *     salon's half, with «Мой день» as a tab;
 *   - "salon": an owner or the front desk not linked to a barber, on a page
 *     of this half that is his own (this device's notifications). The one
 *     app's frame too.
 *
 * Whose column the pages show is decided the same way by requireStaff()
 * (src/lib/auth/current.ts); this only reads it for the bars.
 */
import { cache } from "react";
import { barberAppStaffId, currentStaffUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rights";
import type { StaffUser } from "@/lib/auth/sessions";
import { dbConfigured, query } from "@/lib/db";

export type BStaff = { id: string; name: string; photoUrl: string | null };
export type BFrame = { user: StaffUser; kind: "barber" | "support" | "own" | "salon"; staff: BStaff | null };

async function staffOf(id: string | null, businessId: string): Promise<BStaff | null> {
  if (!id) return null;
  const [s] = await query<{ id: string; display_name: string; photo_url: string | null }>("select id, display_name, photo_url from staff where id = $1 and business_id = $2", [id, businessId]);
  return s ? { id: s.id, name: s.display_name, photoUrl: s.photo_url } : null;
}

/** Once per request, however many parts of the frame ask. */
export const barberFrame = cache(async (): Promise<BFrame | null> => {
  if (!dbConfigured()) return null;
  const user = await currentStaffUser();
  if (!user) return null;
  if (user.role === "staff") return { user, kind: "barber", staff: await staffOf(user.staffId, user.businessId) };
  const picked = await barberAppStaffId(user);
  // a barber's app is looked at only with the right to see his column, as requireStaff() has it
  if (picked && picked !== user.staffId && can(user, "journal.staff", { staffId: picked })) {
    const staff = await staffOf(picked, user.businessId);
    if (staff) return { user, kind: "support", staff };
  }
  return { user, kind: user.staffId ? "own" : "salon", staff: await staffOf(user.staffId, user.businessId) };
});
