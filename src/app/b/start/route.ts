/**
 * GET /b/start: the staff app's own address (docs/apps.md). The installed
 * app starts here, and so does a login that asked for no page. A barber
 * goes to his day; Renat and the front desk to the side this device had
 * open last (src/lib/auth/side.ts). Without a login the proxy has already
 * sent the phone to /b/login.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { currentStaffUser } from "@/lib/auth/current";
import { SIDE_COOKIE, startPath } from "@/lib/auth/side";
import { dbConfigured } from "@/lib/db";

export async function GET() {
  // always at request time: the answer is this login's, never a built page
  await connection();
  const user = dbConfigured() ? await currentStaffUser() : null;
  if (!user) redirect("/b/login");
  redirect(startPath(user, (await cookies()).get(SIDE_COOKIE)?.value));
}
