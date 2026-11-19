/**
 * GET /b/start: the staff app's own address (docs/apps.md). The installed
 * app starts here, and so does a login that asked for no page:
 *   - a barber goes to his day;
 *   - an owner or the front desk linked to a barber, to what this device
 *     had open last of «Мой день» and «Журнал» (src/lib/auth/side.ts);
 *   - an owner or the front desk not linked to a barber, to the journal.
 * Opening the app anew is never «looking at a barber's app»: that is
 * forgotten here. Without a login the proxy has already sent the phone to
 * /b/login.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { VIEW_AS_COOKIE } from "@/lib/auth/cookie";
import { currentStaffUser } from "@/lib/auth/current";
import { SIDE_COOKIE, startPath } from "@/lib/auth/side";
import { dbConfigured } from "@/lib/db";

export async function GET() {
  // always at request time: the answer is this login's, never a built page
  await connection();
  const user = dbConfigured() ? await currentStaffUser() : null;
  if (!user) redirect("/b/login");
  const jar = await cookies();
  if (jar.has(VIEW_AS_COOKIE)) jar.delete(VIEW_AS_COOKIE);
  redirect(startPath(user, jar.get(SIDE_COOKIE)?.value));
}
