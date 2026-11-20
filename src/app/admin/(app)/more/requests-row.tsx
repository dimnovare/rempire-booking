"use client";

/**
 * «Запросы» on a phone's «Ещё» (Dim, decision round 11: the tab gave its
 * place to «Отчёты»). While requests wait for an answer the row says how
 * many, in red, as the dot on «Ещё» does (src/components/app-bar.tsx); the
 * count is the frame's, read once per page by the layout.
 */
import Link from "next/link";
import { useA } from "../../lang";
import { useFrame } from "../frame";
import "./requests-row.css";

export function RequestsRow() {
  const A = useA();
  const { waiting } = useFrame();
  return (
    <Link className="adm-item mo-row" href="/admin/requests" prefetch={false}>
      <b>{A.nav.requests}</b>
      {waiting > 0 && (
        <span className="mo-count" role="img" aria-label={A.app.waiting(waiting)} title={A.app.waiting(waiting)}>
          {waiting}
        </span>
      )}
    </Link>
  );
}
