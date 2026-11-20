"use client";

/**
 * The parts of an invoice's sheet, to the design board «Счёт, черновик»:
 * the sender with our mark, the receiver as a card, the field that finds a
 * receiver, the ruled table on the right and the totals. The draft, the
 * issued invoice and «Новый счёт» are all laid out of these.
 */
import Link from "next/link";
import { useState } from "react";
import { TowerMark } from "@/components/brand";
import { euroText } from "@/lib/money";
import { XIcon } from "../../icons";
import { useA } from "../../lang";
import { PartyIcon, SearchGlass } from "./common";
import { Field } from "./ui";

/** «Mardi 1, 10145 Tallinn» on two lines, as an address is printed. */
const lines = (address: string) =>
  address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function SenderBlock({ name, address }: { name: string; address: string }) {
  const A = useA();
  return (
    <div className="inv-party inv-from" aria-label={A.inv.from}>
      <span className="iv-logo" aria-hidden="true">
        <TowerMark />
      </span>
      <div>
        <div>{name}</div>
        {lines(address).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}

export type CardReceiver = { name: string; contact: string; address: string; email: string; person: boolean; href: string | null };

/** The receiver as a card; `onChange` puts a × on it. */
export function ReceiverCard({ r, onChange }: { r: CardReceiver; onChange?: () => void }) {
  const A = useA();
  return (
    <div className="inv-party inv-rcv" aria-label={A.inv.to}>
      <span className="iv-tile-ico" aria-hidden="true">
        <PartyIcon person={r.person} />
      </span>
      <div className="txt">
        <div>
          <b>{r.href ? <Link href={r.href}>{r.name}</Link> : r.name}</b>
          {r.contact && <small>{r.contact}</small>}
        </div>
        <span>{[r.address, r.email].filter(Boolean).join(" · ")}</span>
      </div>
      {onChange && (
        <button type="button" className="iv-ibtn" aria-label={A.inv.changeReceiver} title={A.inv.changeReceiver} onClick={onChange}>
          <XIcon />
        </button>
      )}
    </div>
  );
}

export type PickReceiver = { id: string; name: string; sub: string; person: boolean };

const has = (text: string, q: string) => text.toLocaleLowerCase().includes(q);

/** One field over «Получатели»; the list is open at once, and a name picks him. */
export function ReceiverPicker({ receivers, onPick, note, onCancel, err }: { receivers: PickReceiver[]; onPick: (id: string) => Promise<void>; note?: string; onCancel?: () => void; err?: string | null }) {
  const A = useA();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const needle = q.trim().toLocaleLowerCase();
  const shown = needle ? receivers.filter((r) => has(r.name, needle) || has(r.sub, needle)) : receivers;
  const pick = async (id: string) => {
    setBusy(true);
    await onPick(id);
    setBusy(false);
  };
  return (
    <div className="inv-party inv-rcv-pick" aria-label={A.inv.pickReceiver}>
      {note && <p className="iv-note">{note}</p>}
      {receivers.length === 0 ? (
        <p className="iv-mute">{A.inv.noReceivers}</p>
      ) : (
        <>
          <Field label={A.inv.searchReceiver} icon={<SearchGlass />}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input type="search" role="combobox" aria-expanded="true" aria-controls="inv-rcv-list" autoFocus autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          {err && (
            <p className="iv-err" role="alert">
              {err}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="iv-mute">{A.inv.nothingFound}</p>
          ) : (
            <ul className="inv-pick is-static" id="inv-rcv-list" role="listbox" aria-label={A.inv.pickReceiver}>
              {shown.map((r) => (
                <li key={r.id} role="option" aria-selected="false">
                  <button type="button" disabled={busy} onClick={() => void pick(r.id)}>
                    <span className="iv-tile-ico is-round" aria-hidden="true">
                      <PartyIcon person={r.person} size={20} />
                    </span>
                    <span className="n">
                      <b>{r.name}</b>
                      {r.sub && <small>{r.sub}</small>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {onCancel && (
        <button type="button" className="iv-btn is-sm" style={{ alignSelf: "flex-start", marginTop: 12 }} onClick={onCancel}>
          {A.inv.keepReceiver}
        </button>
      )}
    </div>
  );
}

/** The ruled table on the right: a row per thing that exists. */
export function MetaTable({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="inv-meta">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Totals({ netCents, vatCents, grossCents }: { netCents: number; vatCents: number; grossCents: number }) {
  const A = useA();
  return (
    <dl className="inv-totals">
      <div>
        <dt>{A.inv.net}</dt>
        <dd>{euroText(netCents)}</dd>
      </div>
      <div>
        <dt>{A.inv.vat}</dt>
        <dd>{euroText(vatCents)}</dd>
      </div>
      <div className="tot">
        <dt>{A.inv.gross}</dt>
        <dd>{euroText(grossCents)}</dd>
      </div>
    </dl>
  );
}

/** A line's unit, from what the line is: a month of rent, a piece of a product; a typed line has none. */
export function unitOf(A: ReturnType<typeof useA>, kind: string): string {
  return kind === "rent" ? A.inv.units.month : kind === "product" || kind === "self" ? A.inv.units.piece : "";
}
