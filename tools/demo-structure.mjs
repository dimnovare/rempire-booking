/**
 * The demo's structure, worked out from tools/altegio-structure.json (REMPIRE
 * as it stands in Altegio, read 19.11.2026): the eight services, each
 * barber's own time and price for them, his weekly hours and his dated
 * shifts. Data and pure functions only, nothing of Node's: the seed
 * (tools/seed-demo.mjs) writes it to the database, and the e2e tests
 * (e2e/helpers.ts) ask it which days a barber works.
 */
import ALTEGIO from "./altegio-structure.json" with { type: "json" };

export const T = (ru, et, en) => ({ ru, et, en });

export const DAY_MS = 86_400_000;
/** A local date `n` days on. */
export const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export const weekdayOf = (date) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
export const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toTime = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** The first day the shifts were read from: Monday 16.11.2026. */
const FIRST_DAY = ALTEGIO.staff.flatMap((s) => s.shifts.map((x) => x[0])).sort()[0];

/**
 * A barber's dated days: every day from the first day of the file to his
 * own last shift in it, with that day's hours. A day without a shift is a
 * day off ([]), as in Altegio's «График работы»: Valentin is away 17–23.11.
 * After his last shift nothing is known, so the weekly template goes on.
 */
export function datedDays(shifts, first = FIRST_DAY) {
  const last = shifts.map((x) => x[0]).sort().at(-1);
  const out = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    out.push({ day, spans: shifts.filter((x) => x[0] === day).map((x) => [x[1], x[2]]).sort() });
  }
  return out;
}

/**
 * The weekly template from the dated days: a weekday he works on more than
 * half of its dates, from the middle start to the middle end of those days
 * (the later of two). So a one-off (an hour on a Monday, a swapped shift)
 * does not become a rule, and neither does one long or short day.
 */
export function weeklyTemplate(days) {
  const middle = (list) => [...list].sort()[Math.floor(list.length / 2)];
  const out = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    const all = days.filter((d) => weekdayOf(d.day) === weekday);
    const worked = all.filter((d) => d.spans.length);
    if (worked.length * 2 <= all.length) continue;
    out.push({ weekday, starts: middle(worked.map((d) => d.spans[0][0])), ends: middle(worked.map((d) => d.spans.at(-1)[1])) });
  }
  return out;
}

/** The most common of the barbers' times for a service; of two, the shorter. */
function usual(list) {
  const n = new Map();
  for (const x of list) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

// The file's keys → the demo's slugs, kept as they were: the rows on
// staging, their ids and the links to them stay the same.
const SLUG = { cut: "clip", cut_beard: "cutbeard", father_son: "fs" };
const slugOf = (key) => SLUG[key] ?? key;
// The file has no Estonian names.
const ET = {
  clip: "Juukselõikus masina ja kääridega",
  long: "Pikad juuksed, kääridega",
  buzz: "Masinalõikus (buzzcut)",
  cutbeard: "Juukselõikus + habe",
  beard: "Habeme piiramine",
  grey: "Hallide juuste katmine",
  kid: "Lapse juukselõikus",
  fs: "Isa ja poeg",
};
// Photos: the portraits from rempire.ee/en/barbershop, 480 x 640, grey
// (public/barbers/, 17.11.2026). The order is the demo's own.
const NAMES = ["Renat", "Valentin", "Jevgeni", "Slava", "Milena"];

export const DEMO = {
  /** Which structure this is; a new one is written over the old once (seedDemo). */
  version: "altegio-2026-11-19",
  business: { slug: "rempire", name: "REMPIRE", timezone: "Europe/Tallinn", default_locale: "ru" },
  location: {
    slug: "mardi-1",
    name: "REMPIRE",
    address: "Mardi 1, Tallinn",
    // the salon's page («REMPIRE ▾»): REMPIRE's own public details, as its
    // booking widget shows them; db/migrations/028_location_profile.sql
    // writes the same into a database that has REMPIRE already
    profile: {
      phone: "+372 5623 7237",
      website: "www.rempire.ee",
      schedule: T("пн–сб 10:00–19:00", "E–L 10:00–19:00", "Mon–Sat 10:00–19:00"),
      about: T(
        "Барберы из Эстонии, работаем в столице, Таллине. Приходите к нам в REMPIRE, и вместе мы придадим вашей индивидуальности чёткости!",
        "Barberid Eestist, tegutseme pealinnas Tallinnas. Tule meile külla REMPIRE salongi ja koos lisame sinu isikupärale teravust!",
        "Barbers from Estonia, operating in the capital city Tallinn. Come and visit us at REMPIRE and together we will add some crisp to your individuality!",
      ),
      photos: ["/brand/rempire-photo.svg"],
      lat: 59.430883,
      lng: 24.761967,
    },
  },
  // d: the usual time among the barbers; cents: the base price, maxCents the top of «30–35 €»
  services: ALTEGIO.services.map((s) => {
    const slug = slugOf(s.key);
    if (!ET[slug]) throw new Error(`tools/demo-structure.mjs: no Estonian name for the service «${s.key}»`);
    return {
      slug,
      name: T(s.ru, ET[slug], s.en),
      d: usual(ALTEGIO.staff.map((st) => st.services[s.key]?.[0]).filter((x) => x != null)),
      cents: s.baseCents,
      maxCents: s.maxCents ?? null,
    };
  }),
  // lines: his own time and price per service; a missing service = he does not do it.
  // hours: the weekly template; days: the dated shifts, each an exact day.
  staff: NAMES.map((name) => {
    const slug = name.toLowerCase();
    const src = ALTEGIO.staff.find((s) => s.name.split(" ")[0].toLowerCase() === slug);
    if (!src) throw new Error(`tools/demo-structure.mjs: ${name} is not in altegio-structure.json`);
    const days = datedDays(src.shifts);
    return {
      slug,
      name,
      lines: Object.fromEntries(Object.entries(src.services).map(([key, [d, cents, maxCents]]) => [slugOf(key), { d, cents, maxCents: maxCents ?? null }])),
      hours: weeklyTemplate(days),
      days,
    };
  }),
};

/** A demo barber's hours on a local date, as seeded: the dated day if there is one, else the weekly template. */
export function demoHours(slug, date) {
  const st = DEMO.staff.find((s) => s.slug === slug);
  if (!st) return [];
  const dated = st.days.find((d) => d.day === date);
  if (dated) return dated.spans;
  return st.hours.filter((h) => h.weekday === weekdayOf(date)).map((h) => [h.starts, h.ends]);
}

/** The first day from `from` on that a demo barber works. */
export function demoWorkday(slug, from) {
  for (let i = 0, day = from; i < 90; i++, day = addDays(day, 1)) if (demoHours(slug, day).length) return day;
  throw new Error(`tools/demo-structure.mjs: ${slug} has no working day from ${from}`);
}

/**
 * Made-up reviews of the salon itself for a local run and e2e (seedDemoReviews
 * in tools/seed-demo.mjs), so its page («REMPIRE ▾») has some to show: fake
 * names and words, one hidden (never on the page). All dated more than a
 * year back, so the admin's «Отзывы», which opens on the last twelve
 * months, starts empty as e2e/reports.spec.ts expects; none is about a
 * barber, so no barber's stars change. Newest first.
 */
export const DEMO_REVIEWS = [
  { at: "2025-10-02", rating: 5, name: "Kalle Näidis", body: "Väga hea lõikus, tulen kindlasti tagasi." },
  { at: "2025-09-01", rating: 1, name: "Hidden Example", body: "Taken off the page by the salon.", hidden: true },
  { at: "2025-08-14", rating: 5, name: "Анна Пример", body: "" },
  { at: "2025-06-21", rating: 5, name: "Demo Client", body: "Great fade, friendly team." },
  { at: "2025-04-03", rating: 4, name: "Иван Пример", body: "Хорошо, но пришлось немного подождать." },
  { at: "2025-02-11", rating: 5, name: "Mari Näidis", body: "" },
  { at: "2024-12-08", rating: 5, name: "Test User", body: "" },
  { at: "2024-10-19", rating: 5, name: "Ольга Демо", body: "Лучший барбершоп в Таллине!" },
  { at: "2024-09-01", rating: 5, name: "Jaan Test", body: "" },
];
