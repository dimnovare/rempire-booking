"use server";

/**
 * «Сообщения»: the log's question. The action checks the login itself and
 * copies its arguments by name; the rights are asked in
 * src/lib/admin/message-log.ts, which is handed the login.
 */
import { cleanMessages, messageQuestion, type MessageQuery } from "@/lib/admin/message-filter";
import { listMessageLog, type MessageList } from "@/lib/admin/message-log";
import { requireAdmin } from "@/lib/auth/current";
import { query } from "@/lib/db";

/** One page of the log for this question. */
export async function listMessagesAction(q: MessageQuery): Promise<MessageList> {
  const { user, business } = await requireAdmin();
  return listMessageLog(query, business, cleanMessages(messageQuestion(q)), user);
}
