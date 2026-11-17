"use server";

/**
 * What a barber does to his own visits. Every action asks requireStaff()
 * which column this login may touch and passes it down (onlyStaffId): a
 * visit id from another barber's column is refused under the row lock, as
 * if it did not exist.
 */
import { refresh } from "next/cache";
import { adminSetStatus } from "@/lib/admin/visits";
import { requireStaff } from "@/lib/auth/current";

export async function setVisitStatus(visitId: string, status: string): Promise<boolean> {
  const { user, business, staff } = await requireStaff();
  const ok = await adminSetStatus(business, String(visitId), String(status), user.id, { onlyStaffId: staff.id });
  if (ok) refresh();
  return ok;
}
