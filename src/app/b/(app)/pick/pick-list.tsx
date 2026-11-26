"use client";

/**
 * The rows of «Чей день смотреть»: a search by name on the phone itself
 * (the list is the salon's few barbers), grouped by today (26.11.2026):
 * «Сегодня работают · N», «Сегодня выходной · N», and those who left folded
 * under «Ушли из салона · N». A tap opens his app (viewAs).
 */
import { useState } from "react";
import { Ava } from "../../../admin/icons";
import { useB } from "../../lang";
import { viewAs } from "../actions";
import { Ic } from "../sell/icons";

export type PickRow = { id: string; name: string; photoUrl: string | null; active: boolean; today: boolean; mine: boolean; sub: string };

const norm = (s: string) => s.toLocaleLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

export function PickList({ rows }: { rows: PickRow[] }) {
  const P = useB().pick;
  const [q, setQ] = useState("");
  const [gone, setGone] = useState(false);
  const needle = norm(q.trim());
  const hit = rows.filter((r) => !needle || norm(r.name).includes(needle));
  const working = hit.filter((r) => r.active && r.today);
  const off = hit.filter((r) => r.active && !r.today);
  const left = hit.filter((r) => !r.active);
  // a search finds those who left too: no need to unfold for a name
  const showLeft = gone || (needle !== "" && left.length > 0);
  return (
    <>
      <label className="bx-srch">
        <span className="sr">{P.find}</span>
        <Ic name="search" size={16} />
        <input type="search" value={q} placeholder={P.find} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
      </label>
      {hit.length === 0 && <p className="adm-meta">{P.nobody}</p>}
      {working.length > 0 && (
        <>
          <p className="bx-gh">{P.working(working.length)}</p>
          <Rows rows={working} />
        </>
      )}
      {off.length > 0 && (
        <>
          <p className="bx-gh">{P.offToday(off.length)}</p>
          <Rows rows={off} />
        </>
      )}
      {rows.some((r) => !r.active) && !needle && (
        <button type="button" className="bx-lnk bx-fold" aria-expanded={gone} onClick={() => setGone((g) => !g)}>
          <Ic name="down" size={16} className={gone ? "is-up" : undefined} />
          {P.gone(rows.filter((r) => !r.active).length)}
        </button>
      )}
      {showLeft && left.length > 0 && <Rows rows={left} />}
    </>
  );
}

function Rows({ rows }: { rows: PickRow[] }) {
  const P = useB().pick;
  return (
    <ul className="bx-box bx-picker">
      {rows.map((s) => (
        <li key={s.id} className={s.active ? undefined : "is-gone"}>
          <form action={viewAs.bind(null, s.id)}>
            <button className="bx-row">
              <Ava src={s.photoUrl} name={s.name} />
              <span className="bx-row-main">
                <span>
                  <b>{s.name}</b>
                  {s.mine && <span className="bx-tag y">{P.mine}</span>}
                </span>
                <small>{s.sub}</small>
              </span>
              <span className="bx-chev">
                <Ic name="right" size={18} />
              </span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
