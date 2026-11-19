"use client";

/**
 * «Список услуг»: the services at a glance, read-only (docs/one-place.md:
 * the same list «Услуги» changes). Each row has the price and the time as a
 * range over the barbers who do it; opened, it shows every barber's own.
 * «Изменить» goes to «Услуги».
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ServiceListRow } from "@/lib/admin/services";
import { eur, type Copy } from "../copy";
import { CaretIcon } from "../icons";
import { useA } from "../lang";
import { Drawer } from "./drawer";
import { serviceListAction } from "./frame-actions";

/** «30–45 €», or «40 €» when it is one price. */
const priceRange = (from: number, to: number) => (to > from ? `${eur(from).replace(" €", "")}–${eur(to)}` : eur(from));
const timeRange = (A: Copy, from: number, to: number) => (to > from ? `${A.mins(from)} – ${A.mins(to)}` : A.mins(from));

export function ServicesDrawer({ onClose }: { onClose: () => void }) {
  const A = useA();
  const L = A.svcList;
  const [rows, setRows] = useState<ServiceListRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    serviceListAction().then(
      (list) => live && setRows(list),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <Drawer
      title={L.title}
      size="narrow"
      onClose={onClose}
      foot={
        <Link className="dw-btn dw-btn-main" href="/admin/services" prefetch={false} onClick={onClose}>
          {L.edit}
        </Link>
      }
    >
      <section className="dw-col dw-col-main" aria-label={L.title}>
        {!rows ? (
          <p className={failed ? "adm-err" : "adm-meta"} role="status">
            {failed ? A.error : A.loading}
          </p>
        ) : rows.length === 0 ? (
          <p className="adm-meta">{L.none}</p>
        ) : (
          <ul className="dw-svcs">
            {rows.map((s) => {
              const shown = open === s.id;
              return (
                <li key={s.id} className={shown ? "is-open" : undefined}>
                  <button type="button" aria-expanded={shown} onClick={() => setOpen(shown ? null : s.id)}>
                    <span className="txt">
                      <b>{A.pick(s.name)}</b>
                      <small>
                        {timeRange(A, s.minFrom, s.minTo)}
                        {s.online ? "" : ` · ${A.services.offline}`}
                      </small>
                    </span>
                    <span className="end">{priceRange(s.priceFromCents, s.priceToCents)}</span>
                    <CaretIcon size={12} />
                  </button>
                  {shown &&
                    (s.barbers.length === 0 ? (
                      <p className="adm-meta">{L.noBarbers}</p>
                    ) : (
                      <ul className="dw-svc-barbers">
                        {s.barbers.map((b) => (
                          <li key={b.id}>
                            <span className="n">{b.name}</span>
                            <span className="t">{A.mins(b.durationMin)}</span>
                            <span className="p">{priceRange(b.priceCents, b.priceMaxCents ?? b.priceCents)}</span>
                          </li>
                        ))}
                      </ul>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Drawer>
  );
}
