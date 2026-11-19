/**
 * The client's own link from the confirmation: see the visit, add it to the
 * calendar, cancel it, or book another time. In the look of the booking
 * pages (globals.css). A client moves or cancels at any time before the
 * visit, as in Altegio (Renat, 19.11.2026); a salon that sets a cutoff
 * still gets «call the salon» inside it.
 */
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckIcon, CrossIcon, DayIcon, LogoMark } from "@/components/brand";
import { currentBusiness } from "@/lib/business";
import { clientPushOffered } from "@/lib/client-push";
import { dbConfigured, dbKind, query } from "@/lib/db";
import { COPY, duration, eur, INTL, isLocale, LOCALES, pick, type Locale } from "@/lib/i18n";
import { pushPublicKey } from "@/lib/push";
import { canChange, findVisit } from "@/lib/visits";
import { cancelVisit } from "./actions";
import { CancelButton } from "./cancel-button";
import { RemindMe } from "../../remind-me";

export const metadata = { title: "REMPIRE · Visit", referrer: "no-referrer" as const };

// The token is known only at request time, so nothing here awaits params
// outside the Suspense boundary.
export default function VisitPage({ params }: PageProps<"/[locale]/visit/[token]">) {
  return (
    <main className="app ground">
      <Suspense fallback={<p className="wait" />}>
        <Visit params={params} />
      </Suspense>
    </main>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function Visit({ params }: { params: PageProps<"/[locale]/visit/[token]">["params"] }) {
  await connection();
  const { locale: raw, token } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const c = COPY[locale];
  const business = dbConfigured() ? await currentBusiness() : null;
  const v = business ? await findVisit(query, business.id, token) : null;

  const header = (
    <>
      {dbKind() === "pglite" && <p className="demo">{c.demo}</p>}
      <header className="hd plain">
        <span className="hd-gap" />
        <LogoMark />
        <a className="hd-co" href={`/${locale}`}>
          <b>{business?.name ?? "REMPIRE"}</b>
          {v?.location.address && <span className="sub">{v.location.address}</span>}
        </a>
        <nav className="langs" aria-label={c.lang}>
          {LOCALES.map((l) => (
            <a key={l} className="rbtn" href={`/${l}/visit/${token}`} aria-current={l === locale ? "true" : undefined}>
              {l.toUpperCase()}
            </a>
          ))}
        </nav>
      </header>
    </>
  );

  if (!v || !business) {
    return (
      <>
        {header}
        <div className="blk top">
          <p className="lead">{c.notFound}</p>
          <a className="btn btn-primary" href={`/${locale}`}>
            {c.again}
          </a>
        </div>
      </>
    );
  }

  const tz = business.timezone;
  const start = Date.parse(v.startsAt);
  const end = Date.parse(v.endsAt);
  const time = (ms: number) => new Intl.DateTimeFormat(INTL[locale], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(ms);
  const longDate = new Intl.DateTimeFormat(INTL[locale], { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(start);
  const cancelled = v.status === "cancelled";
  const past = end < Date.now();
  const changeable = canChange(v, business);
  const hours = Math.round(business.settings.cancel_cutoff_min / 60);
  const phone = v.location.phone.replace(/\s/g, "");

  return (
    <>
      {header}
      <div className="blk top">
        <div className={`mark${cancelled ? " off" : ""}`}>{cancelled ? <CrossIcon size={24} /> : <CheckIcon size={24} width={2.6} />}</div>
        <h1 className="t1">{cancelled ? c.cancelled : c.yourVisit}</h1>
        <p className="lead">{cancelled ? c.cancelledLead : past ? c.past : c.seeYou(longDate, time(start))}</p>
        <div className="sum-row">
          <span className="ava" aria-hidden="true">
            {v.staffName.slice(0, 2).toUpperCase()}
          </span>
          <span className="cell-txt">
            <span>{v.staffName}</span>
            <span className="sub">{c.barberK}</span>
          </span>
        </div>
        <div className="sum-row">
          <span className="sum-ico">
            <DayIcon />
          </span>
          <span className="cell-txt">
            <span className="sub">{cap(longDate)}</span>
            <span>
              {time(start)} — {time(end)}
            </span>
          </span>
        </div>
        <div className="sum-h">
          <h2 className="t2">{c.services}</h2>
          <span className="sub">{duration(Math.round((end - start) / 60_000), c)}</span>
        </div>
        {v.services.map((s, i) => (
          <div className="sum-svc" key={i}>
            <span>{pick(s.name, locale)}</span>
            <b>{eur(s.priceCents)}</b>
          </div>
        ))}
        {v.extraCents > 0 && (
          <div className="sum-svc">
            <span>{c.special}</span>
            <b>+{eur(v.extraCents)}</b>
          </div>
        )}
        <div className="sum-total">
          <span>{c.total}</span>
          <span>{eur(v.totalCents)}</span>
        </div>
      </div>

      <div className="blk btns">
        {!cancelled && !past && (
          <a className="btn btn-primary" href={`/api/ics/${token}?lang=${locale}`}>
            {c.addCal}
          </a>
        )}
        {changeable && (
          <>
            <a className="btn btn-soft" href={`/${locale}`}>
              {c.move}
            </a>
            <p className="note">{c.moveHint}</p>
            <CancelButton action={cancelVisit.bind(null, locale, token)} label={c.cancel} sure={c.cancelSure} yes={c.cancelYes} keep={c.keep} />
            <p className="note">{hours > 0 ? c.cutoff(hours) : c.anyTime}</p>
          </>
        )}
        {!changeable && !cancelled && !past && (
          <>
            <p className="note">{c.tooLate(hours)}</p>
            {phone && (
              <a className="btn btn-soft" href={`tel:${phone}`}>
                {c.callSalon}
              </a>
            )}
          </>
        )}
        {(cancelled || past) && (
          <a className="btn btn-primary" href={`/${locale}`}>
            {c.again}
          </a>
        )}
      </div>
      {/* the reminder as a notification on this device: on or off, while the visit is ahead */}
      {!cancelled && !past && clientPushOffered(business.settings) && <RemindMe token={token} publicKey={pushPublicKey()} c={c.remind} />}
      <div className="tail" />
    </>
  );
}
