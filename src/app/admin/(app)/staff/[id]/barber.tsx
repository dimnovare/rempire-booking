"use client";

/**
 * The barber page, six parts. On a phone: a line per part with what is set
 * now («Пн–Пт 10–20 · Сб 10–18 · Вс выходной»); a tap opens that part alone
 * as a sheet. From 900px there is room, so every part is open as a card and
 * a change is made right where it is seen. Profile, prices and the week
 * save by themselves; the lists add a record with one «Добавить».
 */
import Link from "next/link";
import { useState } from "react";
import type { StaffDetail } from "@/lib/admin/staff";
import { A, eur, ru } from "../../../copy";
import { Ava, NextIcon, PlusIcon } from "../../../icons";
import { Pane } from "../../sheet";
import { DaysForm, HoursForm, OffersForm, ProfileForm, SpecialForm, TimeOffForm } from "./forms";

type Part = "profile" | "offers" | "hours" | "days" | "off" | "special";

const dOnly = (date: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "long" }).format(Date.parse(`${date}T12:00:00Z`));
const short = (t: string) => t.replace(/:00$/, "");
const spansText = (spans: [string, string][]) => (spans.length ? spans.map(([a, b]) => `${short(a)}–${short(b)}`).join(", ") : A.staff.dayOff);

/** «Пн–Пт 10–20 · Сб 10–18 · Вс выходной»: neighbouring days with the same hours run together. */
export function weekText(hours: StaffDetail["hours"]): string {
  const by = new Map(hours.map((h) => [h.weekday, spansText(h.spans)]));
  const day = (wd: number) => by.get(wd) ?? A.staff.dayOff;
  const out: string[] = [];
  let from = 1;
  for (let wd = 2; wd <= 8; wd++) {
    if (wd <= 7 && day(wd) === day(from)) continue;
    const to = wd - 1;
    const names = from === to ? A.staff.weekdays[from - 1] : `${A.staff.weekdays[from - 1]}–${A.staff.weekdays[to - 1]}`;
    out.push(`${names} ${day(from)}`);
    from = wd;
  }
  return out.join(" · ");
}

const more = (n: number) => (n > 1 ? ` · ${A.staff.more(n - 1)}` : "");

export function BarberPage({ d, tz, today, back }: { d: StaffDetail; tz: string; today: string; back: React.ReactNode }) {
  const [open, setOpen] = useState<Part | null>(null);
  const dt = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "numeric", month: "short" });
  const tm = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  const offered = d.offers.filter((o) => o.offered);
  const prices = offered.map((o) => o.priceCents ?? o.defaultCents);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const firstDay = d.overrides[0];
  const firstOff = d.timeOff[0];
  const firstSp = d.special[0];

  const rows: { k: Part; title: string; value: string }[] = [
    { k: "profile", title: A.staff.profile, value: [ru(d.role) || "—", d.active ? A.staff.active : A.staff.off].join(" · ") },
    { k: "offers", title: A.staff.offersRow, value: offered.length ? `${A.staff.servicesN(offered.length)} · ${lo === hi ? eur(lo) : `${eur(lo).replace(" €", "")}–${eur(hi)}`}` : A.staff.none },
    { k: "hours", title: A.staff.hours, value: weekText(d.hours) },
    { k: "days", title: A.staff.overrides, value: firstDay ? `${dOnly(firstDay.date)}: ${spansText(firstDay.spans)}${more(d.overrides.length)}` : A.staff.none },
    {
      k: "off",
      title: A.staff.timeOffRow,
      value: firstOff ? `${A.block.kinds[firstOff.kind] ?? firstOff.kind}: ${dt.format(firstOff.from)} – ${dt.format(firstOff.to - 1)}${more(d.timeOff.length)}` : A.staff.none,
    },
    { k: "special", title: A.staff.special, value: firstSp ? `${dt.format(firstSp.from)}, ${tm.format(firstSp.from)}–${tm.format(firstSp.to)}, +${eur(firstSp.extraCents)}${more(d.special.length)}` : A.staff.none },
  ];
  // the first three save by themselves; on a phone their sheet ends with «Готово»
  const done = () => setOpen(null);
  const form = (k: Part) => {
    if (k === "profile")
      return (
        <ProfileForm id={d.id} onDone={done} initial={{ name: d.name, role: { ru: d.role.ru ?? "", et: d.role.et ?? "", en: d.role.en ?? "" }, photoUrl: d.photoUrl ?? "", bookable: d.bookable, active: d.active }} />
      );
    if (k === "offers") return <OffersForm staffId={d.id} offers={d.offers} onDone={done} />;
    if (k === "hours") return <HoursForm staffId={d.id} hours={d.hours} onDone={done} />;
    if (k === "days") return <DaysForm staffId={d.id} overrides={d.overrides} today={today} />;
    if (k === "off") return <TimeOffForm staffId={d.id} rows={d.timeOff} tz={tz} today={today} />;
    return <SpecialForm staffId={d.id} rows={d.special} tz={tz} today={today} />;
  };

  return (
    <main className="adm-page adm-wide">
      {back}
      <div className="adm-hero">
        <Ava src={d.photoUrl} name={d.name} />
        <div className="txt">
          <h1 className="adm-h1">{d.name}</h1>
          <span>
            {ru(d.role) || A.visit.barber} · {d.active ? A.staff.active : A.staff.off} · {d.bookable ? A.staff.bookableOn : A.staff.bookableOff}
          </span>
        </div>
        <div className="adm-btns">
          <Link className="adm-btn adm-btn-ghost adm-btn-sm adm-btn-auto" href={`/admin?d=${today}&v=week&s=${d.id}`}>
            {A.staff.inCalendar}
          </Link>
          {/* a wide screen has the «Отпуск» card open already */}
          <button type="button" className="adm-btn adm-btn-line adm-btn-sm adm-btn-auto only-narrow" onClick={() => setOpen("off")}>
            <PlusIcon size={14} />
            {A.staff.vacation}
          </button>
        </div>
      </div>

      <div className="adm-cards adm-parts">
        {rows.map((r) => (
          <div className="adm-part" key={r.k}>
            <button type="button" className="adm-sumrow" aria-expanded={open === r.k} onClick={() => setOpen(r.k)}>
              <span className="tx">
                <b>{r.title}</b>
                <small>{r.value}</small>
              </span>
              <span className="adm-chev">
                <NextIcon />
              </span>
            </button>
            <Pane title={r.title} open={open === r.k} onClose={() => setOpen(null)}>
              {form(r.k)}
            </Pane>
          </div>
        ))}
      </div>
    </main>
  );
}
