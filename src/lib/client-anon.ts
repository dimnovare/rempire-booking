/**
 * An anonymised client (040_client_anonymise.sql; anonymiseClient in
 * src/lib/admin/clients.ts): his row stays for his visits and sales, and
 * its name is this one fixed mark. A page shows the mark as its own word
 * for «Обезличенный клиент», in the reader's language; where a page does
 * not, the mark itself still names nobody.
 *
 * Nobody may be called by the mark: adding or renaming a client, a visit
 * for a new client and an online booking all refuse it as a name, so the
 * mark means «anonymised» and nothing else.
 *
 * No imports: the browser's pages read it too.
 */
export const ANON_NAME = "—";

export const isAnonName = (name: unknown): boolean => name === ANON_NAME;

/** The name as a page shows it: `anonymised` (the reader's word) in place of the mark. */
export const shownName = (name: string, anonymised: string): string => (name === ANON_NAME ? anonymised : name);
