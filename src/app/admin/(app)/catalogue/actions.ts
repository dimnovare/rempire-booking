"use server";

/**
 * What «Каталог товаров» asks for after its first page: another page or
 * filter of the list, a search, and one product's sales this month. Read
 * only. Each checks the login itself, as the page does (the admin: rights
 * unchanged), and copies its arguments by name.
 */
import { catalogueFound, catalogueList, soldThisMonth, type BarberSold, type CatalogueFound, type CatalogueList, type CatAnswer } from "@/lib/admin/catalogue";
import { requireAdmin } from "@/lib/auth/current";
import { query } from "@/lib/db";
import { adminLang } from "../../lang-server";

export async function catalogueListAction(page: number, filter: { brand: string; stock: string }): Promise<CatAnswer<CatalogueList>> {
  const { business } = await requireAdmin();
  return catalogueList(business, Number(page), filter, await adminLang());
}

export async function catalogueFindAction(text: string, filter: { brand: string; stock: string }): Promise<CatAnswer<CatalogueFound>> {
  const { business } = await requireAdmin();
  return catalogueFound(business, String(text ?? ""), filter, await adminLang());
}

export async function productMonthAction(productId: string, variant: string): Promise<{ ok: true; month: string; rows: BarberSold[] } | { ok: false }> {
  const { business } = await requireAdmin();
  const id = String(productId ?? "").trim().slice(0, 120);
  if (!id) return { ok: false };
  try {
    return { ok: true, ...(await soldThisMonth(query, business, id, String(variant ?? "").trim().slice(0, 120))) };
  } catch {
    return { ok: false };
  }
}
