/**
 * GET /b/mine: «Мой день» in the side switch. Renat may have been looking
 * at another barber's app (/b/pick); this forgets that and opens his own
 * day. For anyone else it is simply /b.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { VIEW_AS_COOKIE } from "@/lib/auth/cookie";

export async function GET() {
  await connection();
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/b");
}
