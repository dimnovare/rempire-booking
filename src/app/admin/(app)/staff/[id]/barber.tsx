"use client";

/**
 * The barber page, six parts. On a phone: a line per part with what is set
 * now («Пн–Пт 10–20 · Сб 10–18 · Вс выходной»); a tap opens that part alone
 * as a sheet. From 900px there is room, so every part is open as a card and
 * a change is made right where it is seen. Profile and the week save by
 * themselves; the lists add a record with one «Добавить». His services and
 * prices are shown only, each linking to its window in «Услуги».
 */
import Link from "next/link";
import { useState } from "react";
// «Открыть его приложение»: the barber app's own action (it sets whose app is looked at and opens /b)
import { viewAs } from "@/app/b/(app)/actions";
import type { StaffDetail } from "@/lib/admin/staff";
import { extraText } from "@/lib/slots";
import { eur, type Copy } from "../../../copy";
import { useA } from "../../../lang";
import { Ava, NextIcon, PlusIcon } from "../../../icons";
import { Pane } from "../../sheet";
import { DaysForm, HoursForm, offerEff, OffersList, ProfileForm, SpecialForm, TimeOffForm } from "./forms";

type Part = "profile" | "offers" | "hours" | "days" | "off" | "special";

const dOnly = (A: Copy, date: string) => new Intl.DateTimeFormat(A.intl, { timeZone: "UTC", day: "numeric", month: "long" }).format(Date.parse(`${date}T12:00:00Z`));
const short = (t: string) => t.replace(/:00$/, "");
const spansText = (A: Copy, spans: [string, string][]) => (spans.length ? spans.map(([a, b]) => `${short(a)}–${short(b)}`).join(", ") : A.staff.dayOff);

/** «Пн–Пт 10–20 · Сб 10–18 · Вс выходной»: neighbouring days with the same hours run together. */
export function weekText(A: Copy, hours: StaffDetail["hours"]): string {
  const by = new Map(hours.map((h) => [h.weekday, spansText(A, h.spans)]));
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

const more = (A: Copy, n: number) => (n > 1 ? ` · ${A.staff.more(n - 1)}` : "");

export function BarberPage({
  d,
  tz,
  today,
  back,
  app = false,
  services = false,
}: {
  d: StaffDetail;
  tz: string;
  today: string;
  back: React.ReactNode;
  /** «Открыть его приложение»: the login may see this barber's column, and the barber is not the login itself */
  app?: boolean;
  /** the login may open «Услуги»: each of his services links to its window, where his price and time are set */
  services?: boolean;
}) {
  const A = useA();
  const [open, setOpen] = useState<Part | null>(null);
  const dt = new Intl.DateTimeFormat(A.intl, { timeZone: tz, day: "numeric", month: "short" });
  const tm = new Intl.DateTimeFormat(A.intl, { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  const offered = d.offers.filter((o) => o.offered);
  const prices = offered.map((o) => offerEff(o).e.priceCents);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const firstDay = d.overrides[0];
  const firstOff = d.timeOff[0];
  const firstSp = d.special[0];

  const rows: { k: Part; title: string; value: string }[] = [
    {
      k: "profile",
      title: A.staff.profile,
      value: [A.pick(d.role) || "—", d.active ? A.staff.active : A.staff.off, ...(d.scheduleUntil ? [`${A.staffTable.untilField} ${dOnly(A, d.scheduleUntil)}`] : [])].join(" · "),
    },
    { k: "offers", title: A.staff.offersRow, value: offered.length ? `${A.staff.servicesN(offered.length)} · ${lo === hi ? eur(lo) : `${eur(lo).replace(" €", "")}–${eur(hi)}`}` : A.staff.none },
    { k: "hours", title: A.staff.hours, value: weekText(A, d.hours) },
    { k: "days", title: A.staff.overrides, value: firstDay ? `${dOnly(A, firstDay.date)}: ${spansText(A, firstDay.spans)}${more(A, d.overrides.length)}` : A.staff.none },
    {
      k: "off",
      title: A.staff.timeOffRow,
      value: firstOff ? `${A.block.kinds[firstOff.kind] ?? firstOff.kind}: ${dt.format(firstOff.from)} – ${dt.format(firstOff.to - 1)}${more(A, d.timeOff.length)}` : A.staff.none,
    },
    { k: "special", title: A.staff.special, value: firstSp ? `${dt.format(firstSp.from)}, ${tm.format(firstSp.from)}–${tm.format(firstSp.to)}, ${extraText(firstSp)}${more(A, d.special.length)}` : A.staff.none },
  ];
  // profile and the week save by themselves; on a phone their sheet ends with «Готово»
  const done = () => setOpen(null);
  const form = (k: Part) => {
    if (k === "profile")
      return (
        <ProfileForm
          id={d.id}
          onDone={done}
          initial={{ name: d.name, role: { ru: d.role.ru ?? "", et: d.role.et ?? "", en: d.role.en ?? "" }, photoUrl: d.photoUrl ?? "", bookable: d.bookable, active: d.active, scheduleUntil: d.scheduleUntil ?? "" }}
        />
      );
    if (k === "offers") return <OffersList offers={d.offers} link={services} />;
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
            {A.pick(d.role) || A.visit.barber} · {d.active ? A.staff.active : A.staff.off} · {d.bookable ? A.staff.bookableOn : A.staff.bookableOff}
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
        {app && (
          // support: his own app, as he sees it (docs/apps.md, «One app for Renat»); a salon page ends it
          <div className="adm-part adm-part-app">
            <form action={viewAs.bind(null, d.id)}>
              <button className="adm-sumrow">
                <span className="tx">
                  <b>{A.app.openApp}</b>
                  <small>{A.app.openAppHint}</small>
                </span>
                <span className="adm-chev">
                  <NextIcon />
                </span>
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
