/**
 * The client's own link from the confirmation: see the visit, add it to the
 * calendar, cancel it (until the cutoff), or book another time.
 */
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckIcon, CrossIcon, Logo } from "@/components/brand";
import { currentBusiness } from "@/lib/business";
import { dbConfigured, dbKind, query } from "@/lib/db";
import { COPY, duration, eur, INTL, isLocale, LOCALES, pick, type Locale } from "@/lib/i18n";
import { canChange, findVisit } from "@/lib/visits";
import { cancelVisit } from "./actions";
import { CancelButton } from "./cancel-button";

export const metadata = { title: "REMPIRE · Visit", referrer: "no-referrer" as const };

// The token is known only at request time, so nothing here awaits params
// outside the Suspense boundary.
export default function VisitPage({ params }: PageProps<"/[locale]/visit/[token]">) {
  return (
    <main className="app gut narrow">
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
      <header className="top">
        <Logo />
        <nav className="langs" aria-label="Language">
          {LOCALES.map((l) => (
            <a key={l} href={`/${l}/visit/${token}`} aria-current={l === locale ? "true" : undefined}>
              {l.toUpperCase()}
            </a>
          ))}
        </nav>
      </header>
      {dbKind() === "pglite" && <p className="demo">{c.demo}</p>}
    </>
  );

  if (!v || !business) {
    return (
      <>
        {header}
        <div className="stack">
          <p className="lead">{c.notFound}</p>
          <a className="btn btn-lime" href={`/${locale}`}>
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
      <div className="stack">
        <div className={`mark${cancelled ? " off" : ""}`}>{cancelled ? <CrossIcon /> : <CheckIcon size={30} width={2.6} />}</div>
        <h1 className="h1">{cancelled ? c.cancelled : c.yourVisit}</h1>
        <p className="lead">{cancelled ? c.cancelledLead : past ? c.past : c.seeYou(longDate, time(start))}</p>
        <div className="card">
          <div className="kv">
            <span className="k">{c.barberK}</span>
            <span className="v">{v.staffName}</span>
          </div>
          <div className="kv">
            <span className="k">{c.dateK}</span>
            <span className="v">{cap(longDate)}</span>
          </div>
          <div className="kv">
            <span className="k">{c.timeK}</span>
            <span className="v">
              {time(start)}–{time(end)}
            </span>
          </div>
          {v.services.map((s, i) => (
            <div className="kv" key={i}>
              <span className="k">{pick(s.name, locale)}</span>
              <span className="v">{eur(s.priceCents)}</span>
            </div>
          ))}
          <div className="kv">
            <span className="k">{c.whereK}</span>
            <span className="v">{v.location.address}</span>
          </div>
          <div className="kv tot">
            <span className="k">
              {c.total} · {duration(Math.round((end - start) / 60_000), c)}
            </span>
            <span className="v">{eur(v.totalCents)}</span>
          </div>
        </div>

        <div className="btns">
          {!cancelled && !past && (
            <a className="btn btn-lime" href={`/api/ics/${token}?lang=${locale}`}>
              {c.addCal}
            </a>
          )}
          {changeable && (
            <>
              <a className="btn btn-line" href={`/${locale}`}>
                {c.move}
              </a>
              <p className="cut">{c.moveHint}</p>
              <CancelButton action={cancelVisit.bind(null, locale, token)} label={c.cancel} sure={c.cancelSure} yes={c.cancelYes} keep={c.keep} />
              <p className="cut">{c.cutoff(hours)}</p>
            </>
          )}
          {!changeable && !cancelled && !past && (
            <>
              <p className="note">{c.tooLate(hours)}</p>
              {phone && (
                <a className="btn btn-ghost" href={`tel:${phone}`}>
                  {c.callSalon}
                </a>
              )}
            </>
          )}
          {(cancelled || past) && (
            <a className="btn btn-lime" href={`/${locale}`}>
              {c.again}
            </a>
          )}
        </div>
      </div>
    </>
  );
}
