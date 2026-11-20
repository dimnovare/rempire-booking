"use server";

/**
 * «Изменения данных»: the log's question. The action checks the login
 * itself and copies its arguments by name; who may read the log is asked in
 * src/lib/admin/change-log.ts, which is handed the login.
 */
import { changeQuestion, cleanChanges, type ChangeQuery } from "@/lib/admin/change-filter";
import { listChanges, type ChangeList } from "@/lib/admin/change-log";
import { requireAdmin } from "@/lib/auth/current";
import { query } from "@/lib/db";
import { isLocale } from "@/lib/i18n";

/** One page of the log for this question, with the services named in the login's language. */
export async function listChangesAction(q: ChangeQuery): Promise<ChangeList> {
  const { user, business } = await requireAdmin();
  return listChanges(query, business, cleanChanges(changeQuestion(q)), user, isLocale(user.locale) ? user.locale : "ru");
}
