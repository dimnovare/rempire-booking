"use server";

/**
 * «Отзывы»: the list's question and «Скрыть» / «Показать». Each action
 * checks the login itself and copies its arguments by name; the rights are
 * asked in src/lib/reviews.ts, which is handed the login.
 */
import { cleanReviews, reviewQuestion, type ReviewQuery } from "@/lib/admin/review-filter";
import { requireAdmin } from "@/lib/auth/current";
import { query } from "@/lib/db";
import { listReviews, setReviewHidden, type ReviewHidden, type ReviewList } from "@/lib/reviews";

/** One page of the list for this question. */
export async function listReviewsAction(q: ReviewQuery): Promise<ReviewList> {
  const { user, business } = await requireAdmin();
  return listReviews(query, business, cleanReviews(reviewQuestion(q)), user);
}

/** Off the booking page (hidden) or back on it. */
export async function setReviewHiddenAction(id: string, hidden: boolean): Promise<ReviewHidden> {
  const { user, business } = await requireAdmin();
  // the page changes its own row; the booking page reads the reviews on every request
  return setReviewHidden(query, business.id, user, String(id ?? ""), hidden === true);
}
