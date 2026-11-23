/**
 * /{locale}/privacy: the privacy policy for clients (docs/launch.md, B6), in
 * the look of the booking pages (globals.css). The text is
 * src/lib/privacy-content.ts; the salon's phone in the controller's card is
 * the live one from «Настройки → Контакты», streamed in, so the policy
 * itself is prerendered and still reads when the database does not.
 *
 * Opened in a new tab from the tick in the booking form and from the
 * salon's page (booking-flow.tsx). No cookie banner: the client pages set
 * no cookies (the policy's own section «device» says what they keep).
 * Indexing follows the one switch, src/lib/indexing.ts.
 */
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Fragment, Suspense, type ReactNode } from "react";
import { LogoMark } from "@/components/brand";
import { currentBusiness } from "@/lib/business";
import { loadCatalog } from "@/lib/catalog";
import { dbConfigured, query } from "@/lib/db";
import { COPY, isLocale, LOCALES, type Locale } from "@/lib/i18n";
import { robotsMeta } from "@/lib/indexing";
import { CONTROLLER, controllerAddress, PRIVACY, PRIVACY_SECTIONS, PRIVACY_TODO, PROCESSORS, type PrivacyBlock, type PrivacyCopy } from "@/lib/privacy-content";
import "./privacy.css";

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale: raw } = await params;
  const p = PRIVACY[isLocale(raw) ? raw : "ru"];
  return { title: p.metaTitle, description: p.metaDescription, robots: robotsMeta() };
}

export default async function PrivacyPage({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const p = PRIVACY[locale];
  const c = COPY[locale];
  return (
    <main className="app">
      <header className="hd plain">
        <span className="hd-gap" />
        <LogoMark />
        <a className="hd-co" href={`/${locale}`}>
          <b>REMPIRE</b>
          <span className="sub">{c.loc}</span>
        </a>
        <nav className="langs" aria-label={c.lang}>
          {LOCALES.map((l) => (
            <a key={l} className="rbtn" href={`/${l}/privacy`} hrefLang={l} lang={l} aria-current={l === locale ? "true" : undefined}>
              {l.toUpperCase()}
            </a>
          ))}
        </nav>
      </header>
      <article className="pp" aria-labelledby="pp-title">
        <h1 className="t1" id="pp-title">
          {p.title}
        </h1>
        <p className="lead">{p.lead}</p>
        <p className="pp-since">
          <Rich text={p.since} />
        </p>
        <nav className="pp-toc" aria-labelledby="pp-toc">
          <h2 id="pp-toc">{p.toc}</h2>
          <ol>
            {PRIVACY_SECTIONS.map((id) => (
              <li key={id}>
                <a href={`#${id}`}>{p.sections[id].title}</a>
              </li>
            ))}
          </ol>
        </nav>
        {PRIVACY_SECTIONS.map((id) => (
          <section key={id} id={id} className="pp-sec" aria-labelledby={`pp-${id}`}>
            <h2 className="pp-h" id={`pp-${id}`}>
              {p.sections[id].title}
            </h2>
            {p.sections[id].blocks.map((b, i) => (
              <Block key={i} b={b} p={p} locale={locale} />
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}

function Block({ b, p, locale }: { b: PrivacyBlock; p: PrivacyCopy; locale: Locale }) {
  if ("h" in b) return <h3 className="pp-h3">{b.h}</h3>;
  if ("p" in b)
    return (
      <p>
        <Rich text={b.p} />
      </p>
    );
  if ("list" in b)
    return (
      <ul>
        {b.list.map((t, i) => (
          <li key={i}>
            <Rich text={t} />
          </li>
        ))}
      </ul>
    );
  if (b.slot === "controller") return <Controller p={p} locale={locale} />;
  return (
    <ul className="pp-procs">
      {PROCESSORS.map((id) => {
        const x = p.processors[id];
        return (
          <li key={id}>
            <b>{x.name}</b>
            <span className="pp-where">
              <Rich text={x.where} />
            </span>
            <p>
              <Rich text={x.what} />
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** Rempire OÜ: name, code, address, the salon's phone, the e-mail. */
function Controller({ p, locale }: { p: PrivacyCopy; locale: Locale }) {
  const k = p.controller;
  return (
    <div className="pp-card" role="group" aria-label={k.label}>
      <dl>
        <div>
          <dt>{k.company}</dt>
          <dd>{CONTROLLER.name}</dd>
        </div>
        <div>
          <dt>{k.reg}</dt>
          <dd>{CONTROLLER.regCode}</dd>
        </div>
        <div>
          <dt>{k.address}</dt>
          <dd>{controllerAddress(locale)}</dd>
        </div>
        <div>
          <dt>{k.phone}</dt>
          <dd>
            <Suspense fallback={<span className="pp-wait">…</span>}>
              <SalonPhones todo={k.phoneTodo} />
            </Suspense>
          </dd>
        </div>
        <div>
          <dt>{k.email}</dt>
          <dd>
            <Rich text={k.emailTodo} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** The numbers «Контакты» on the salon's page shows, the main one first; the marker when there are none or no database. */
async function SalonPhones({ todo }: { todo: string }) {
  await connection();
  const phones = await salonPhones();
  if (!phones.length) return <Rich text={todo} />;
  return (
    <ul className="pp-phones">
      {phones.map((x) => (
        <li key={x.number}>
          <a href={`tel:${x.number.replace(/[^\d+]/g, "")}`}>{x.number}</a>
          {x.label && <span className="pp-where"> · {x.label}</span>}
        </li>
      ))}
    </ul>
  );
}

async function salonPhones(): Promise<{ number: string; label: string }[]> {
  if (!dbConfigured()) return [];
  try {
    const business = await currentBusiness();
    if (!business) return [];
    const { location: l } = await loadCatalog(query, business.id);
    return l.phones.length ? l.phones : /\d/.test(l.phone) ? [{ number: l.phone, label: "" }] : [];
  } catch {
    // the policy must read without the database: the card says «[to confirm]» instead
    return [];
  }
}

/** Plain text with its «[to confirm …]» markers highlighted and «www.…» addresses as links. */
const RICH = new RegExp(`(${PRIVACY_TODO.source}|\\bwww\\.[a-z0-9-]+(?:\\.[a-z0-9-]+)+)`, "i");

function Rich({ text }: { text: string }) {
  const parts = text.split(RICH);
  const out: ReactNode[] = parts.map((s, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{s}</Fragment>;
    if (s.startsWith("["))
      return (
        <mark key={i} className="pp-todo">
          {s}
        </mark>
      );
    return (
      <a key={i} href={`https://${s}`} target="_blank" rel="noreferrer">
        {s}
      </a>
    );
  });
  return <>{out}</>;
}
