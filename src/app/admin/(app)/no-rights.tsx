"use client";

/**
 * What a page shows a login that has no right to it (src/lib/auth/rights.ts):
 * one plain line, and where rights are changed. The menu does not offer
 * such a page; this is for an address typed in or kept from before.
 */
import { useA } from "../lang";

export function NoRights() {
  const A = useA();
  return (
    <div className="adm-norights" data-no-rights="">
      <h1 className="adm-h1">{A.rights.none}</h1>
      <p className="adm-meta">{A.rights.noneLead}</p>
    </div>
  );
}
