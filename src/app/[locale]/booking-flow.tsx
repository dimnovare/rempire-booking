"use client";

/**
 * The client booking flow in the look and the order of the Altegio widget
 * REMPIRE's clients know (Renat, 19.11.2026; Dim: Altegio's visuals, our
 * texts): 1 barber, 2 services, 3 day and time, 4 details, then «booked»
 * and a goodbye. Every step ends on one «Continue» at the bottom, as there.
 *
 *   /ru?b=<barber's slug>   opens with that barber picked, as the «book
 *                           now» buttons on rempire.ee do today.
 *   /ru/visit/<token>/move  moves that visit (its own page renders this
 *                           flow with `moving`): the day and time step
 *                           alone, same barber and services, then back to
 *                           the visit's page, as Altegio lets a client do.
 *
 * Free times come from /api/slots, special time included; «Book» posts to
 * /api/bookings with an Idempotency-Key. Screens: docs/client-flow.md and
 * the canvas https://claude.ai/artifact/5F78oNUN8bRrPQzoBcFLyr.
 *
 * The salon's name («REMPIRE ▾») opens the salon's own page over any step,
 * as the widget opens its «about» page: contacts, its words, photos, the
 * map and the reviews about the salon, «Записаться» at the bottom. Its
 * address is /{locale}/about (pushed, so the phone's back closes it, and
 * that address opens it by itself too); the step under it stays as it was.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { InstallOffer } from "./install-offer";
import { RemindMe } from "./remind-me";
import { ReviewCard, ReviewSheet } from "./salon-review";
import "./salon-page.css";
import { OsmMap } from "@/components/osm-map";
import {
  AtIcon,
  ChatIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  CrossIcon,
  DayIcon,
  GlobeIcon,
  InfoIcon,
  LogoMark,
  PencilIcon,
  PeopleIcon,
  PhoneIcon,
  PinIcon,
  StarIcon,
} from "@/components/brand";
import type { Catalog, CatalogLocation, CatalogStaff } from "@/lib/catalog";
import { COPY, duration, eur, euroRange, INTL, LOCALES, pick, type Locale } from "@/lib/i18n";
import type { SalonReview } from "@/lib/reviews";
import { localParts } from "@/lib/tz";

type Props = {
  locale: Locale;
  catalog: Catalog;
  tz: string;
  horizonDays: number;
  /** 0 = a client moves or cancels at any time before the visit */
  cutoffHours: number;
  /** how long before the visit the SMS goes */
  reminderMin: number;
  demo: boolean;
  /** the key a phone subscribes with, when the salon offers the reminder as a notification; "" when not */
  pushKey: string;
  /** ?b=<slug>: the barber the link asked for */
  initialBarber: string | null;
  /** the visit being moved (/{locale}/visit/{token}/move); its barber and services stay */
  moving: Moving | null;
  /** /{locale}/about: the salon's page is open from the start, the first step under it */
  about?: boolean;
};

export type Moving = { token: string; staffId: string; services: string[]; start: number; url: string };

type Screen = "barber" | "services" | "time" | "details" | "done" | "bye";
/** [start ms, the barber «anyone» gets, his special-time extra in cents] */
type Tuple = [number, string, number?];
type Day = { d: string; open: boolean; s: Tuple[] };
type Avail = { key: string; offered: boolean; days: Day[] };
type Slot = { t: number; staffId: string; extra: number };
/** The visit this device booked, as remembered here and checked against the server (/api/visit/<token>). */
type NextVisit = { url: string; start: number; end: number; staffId: string; services: string[] };
type Done = { start: number; end: number; staffId: string; totalCents: number; extraCents: number; manageUrl: string | null };
type Sheet = { kind: "lang" } | { kind: "barber"; id: string } | null;
/** The salon's reviews as far as they are shown: the first six, then six more each time. */
type SalonReviews = { rows: SalonReview[]; more: boolean };

const STORE = "rempire-booking:client";
// the last barber + services booked on this device: that barber is picked when the page opens
const LAST = "rempire-booking:last";
// the latest visit booked on this device: «Your visit» on the first screen opens its link
const VISIT = "rempire-booking:visit";
/** After «Add to calendar»: the goodbye, then the start again by itself (Renat, 19.11.2026). */
const BYE_MS = 7000;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dateOf = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
};
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`);

/* ---------- the salon's page ---------- */
const ABOUT_PATH = /^\/(ru|et|en)\/about\/?$/;
/** How many reviews each «Ещё отзывы» adds, as the widget: six. */
const REVIEWS_STEP = 6;
const http = (s: string) => /^https?:\/\//i.test(s);
const digits = (s: string) => s.replace(/\D/g, "");
const handle = (s: string) => encodeURIComponent(s.replace(/^@/, ""));
/** «K.» → «K», «Anna Näidis» → «AN»: the grey circle of a review. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    // each word's first letter or digit: a dot or a quote is no initial
    .map((w) => [...w].find((ch) => ch.toLowerCase() !== ch.toUpperCase() || (ch >= "0" && ch <= "9")))
    .filter((ch): ch is string => !!ch)
    .slice(0, 2)
    .map((ch) => ch.toLocaleUpperCase())
    .join("") || "?";
/** The place in a maps app: the pin when there is one, else the address. */
const mapsHref = (l: CatalogLocation) =>
  `https://www.google.com/maps/search/?api=1&query=${l.pin ? `${l.pin.lat},${l.pin.lng}` : encodeURIComponent(l.address)}`;
/** The country's name in the page's language («Эстония», «Eesti»); the code itself where the browser has no names. */
const countryName = (code: string, lang: Locale) => {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([INTL[lang]], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};
type ContactRow = { key: string; href: string; text: string; icon: React.ReactNode; out?: boolean; sub?: string };
/** The rows under «Контакты»: what is set, each a link. Every phone, the main one first, its label under it. Socials and messengers by name, never their marks. */
function contactRows(l: CatalogLocation): ContactRow[] {
  const rows: ContactRow[] = [];
  const phones = l.phones.length ? l.phones : digits(l.phone) ? [{ number: l.phone, label: "" }] : [];
  phones.forEach((p, i) => {
    if (digits(p.number)) rows.push({ key: `phone-${i}`, href: `tel:${p.number.replace(/[^\d+]/g, "")}`, text: p.number, icon: <PhoneIcon />, sub: p.label || undefined });
  });
  if (l.website) rows.push({ key: "web", href: http(l.website) ? l.website : `https://${l.website}`, text: l.website.replace(/^https?:\/\//i, "").replace(/\/$/, ""), icon: <GlobeIcon />, out: true });
  if (l.instagram) rows.push({ key: "instagram", href: http(l.instagram) ? l.instagram : `https://www.instagram.com/${handle(l.instagram)}`, text: "Instagram", icon: <AtIcon />, out: true });
  if (l.facebook) rows.push({ key: "facebook", href: http(l.facebook) ? l.facebook : `https://www.facebook.com/${handle(l.facebook)}`, text: "Facebook", icon: <AtIcon />, out: true });
  if (digits(l.whatsapp)) rows.push({ key: "whatsapp", href: `https://wa.me/${digits(l.whatsapp)}`, text: "WhatsApp", icon: <ChatIcon />, out: true });
  if (l.telegram) rows.push({ key: "telegram", href: http(l.telegram) ? l.telegram : `https://t.me/${handle(l.telegram)}`, text: "Telegram", icon: <ChatIcon />, out: true });
  if (digits(l.viber)) rows.push({ key: "viber", href: `viber://chat?number=%2B${digits(l.viber)}`, text: "Viber", icon: <ChatIcon /> });
  return rows;
}

export function BookingFlow({ locale, catalog, tz, horizonDays, cutoffHours, reminderMin, demo, pushKey, initialBarber, moving, about: aboutFirst = false }: Props) {
  const [lang, setLang] = useState<Locale>(locale);
  const c = COPY[lang];
  const asked = useMemo(() => catalog.staff.find((s) => s.slug === initialBarber)?.id ?? null, [catalog.staff, initialBarber]);
  const [screen, setScreen] = useState<Screen>(moving ? "time" : "barber");
  const [barber, setBarber] = useState<string | null>(moving ? moving.staffId : asked); // staff id, "any", or null
  const [services, setServices] = useState<string[]>(moving ? moving.services : []);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [avail, setAvail] = useState<Avail | null>(null);
  const [availError, setAvailError] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({ name: "", phone: "+372 ", email: "", comment: "" });
  const [sms, setSms] = useState(true);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [taken, setTaken] = useState<Tuple[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [remembered, setRemembered] = useState(false);
  const [mine, setMine] = useState<string | null>(null); // the latest visit's own link
  const [next, setNext] = useState<NextVisit | null>(null); // that visit itself: «Ваш визит» on the first screen
  const [calMonth, setCalMonth] = useState<string | null>(null); // "YYYY-MM" the calendar shows
  const [monthOpen, setMonthOpen] = useState(true); // the whole month, or the chosen day's week alone
  const [closed, setClosed] = useState<Record<string, boolean>>({}); // «Morning» and the like, folded
  const [sheet, setSheet] = useState<Sheet>(null);
  // the salon's page, over whatever step is open
  const [about, setAbout] = useState(aboutFirst);
  const [bar, setBar] = useState<0 | 1 | 2>(0); // its top bar: clear, white, white with the salon's name
  const [reviews, setReviews] = useState<SalonReviews | null>(null);
  const [reviewsBusy, setReviewsBusy] = useState(false);
  const [reviewsError, setReviewsError] = useState(false);
  // «Оцените и напишите отзыв»: the stars tapped (0: the sheet is closed), and whether one went from here
  const [rateWith, setRateWith] = useState(0);
  const [reviewSent, setReviewSent] = useState(false);
  const closeReview = useCallback(() => setRateWith(0), []);
  const onReviewSent = useCallback(() => setReviewSent(true), []);
  // the salon's page closed under an open sheet: the sheet goes with it
  if (!about && rateWith > 0) setRateWith(0);
  const aboutPushed = useRef(false); // the page has its own history entry: back closes it
  const aboutFrom = useRef<{ y: number; el: HTMLElement | null }>({ y: 0, el: null }); // where the step was, and what opened the page
  const reviewsAsked = useRef(false);
  const barRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLHeadingElement | null>(null);
  const reviewsRef = useRef<HTMLElement | null>(null);
  const key = useRef("");
  const byeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const staffById = useMemo(() => new Map(catalog.staff.map((s) => [s.id, s])), [catalog.staff]);
  // «Название локации при онлайн-записи» and «Логотип» («Настройки → Бренд»); the business's name and REMPIRE's mark until they are set
  const salonName = catalog.location.name.trim() || catalog.business.name;
  const salonLogo = catalog.location.logo;
  const svcById = useMemo(() => new Map(catalog.services.map((s) => [s.id, s])), [catalog.services]);
  const can = useCallback((b: CatalogStaff, ids: string[]) => ids.every((id) => b.offers[id]), []);
  const priceOf = (b: CatalogStaff, ids: string[]) => ids.reduce((a, id) => a + (b.offers[id]?.[0] ?? 0), 0);
  const durOf = (b: CatalogStaff | null, ids: string[]) =>
    ids.reduce((a, id) => a + (b?.offers[id]?.[1] ?? svcById.get(id)?.durationMin ?? 0), 0);
  const capable = (ids: string[]) => catalog.staff.filter((b) => can(b, ids));

  // a returning client on this device
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved && typeof saved.name === "string" && typeof saved.phone === "string") {
        setForm((f) => ({ ...f, name: saved.name, phone: saved.phone, email: typeof saved.email === "string" ? saved.email : "" }));
        setRemembered(true);
      }
      // the barber of last time, unless the link asked for one
      const l = JSON.parse(localStorage.getItem(LAST) || "null");
      if (!asked && !moving && l && typeof l.barber === "string" && (l.barber === "any" || staffById.has(l.barber))) setBarber((b) => b ?? l.barber);
      // until the visit is over
      const v = JSON.parse(localStorage.getItem(VISIT) || "null");
      if (v && typeof v.url === "string" && /^\/(ru|et|en)\/visit\/[A-Za-z0-9_-]+$/.test(v.url) && typeof v.end === "number" && v.end > Date.now()) {
        setMine(v.url);
        if (typeof v.start === "number" && typeof v.staffId === "string" && Array.isArray(v.services)) {
          setNext({ url: v.url, start: v.start, end: v.end, staffId: v.staffId, services: v.services.filter((id: unknown): id is string => typeof id === "string") });
        }
        // as it stands now: moved or cancelled since, maybe on another device
        const url: string = v.url;
        fetch(`/api/visit/${url.split("/").pop()}`, { cache: "no-store" })
          .then((r) => (r.status === 404 ? { status: "cancelled" } : r.ok ? r.json() : null))
          .then((j) => {
            if (!j) return;
            const end = Date.parse(j.endsAt);
            if (["cancelled", "no_show", "done"].includes(j.status) || !(end > Date.now())) {
              setMine(null);
              setNext(null);
              localStorage.removeItem(VISIT);
              return;
            }
            const now: NextVisit = { url, start: Date.parse(j.startsAt), end, staffId: String(j.staffId), services: Array.isArray(j.serviceIds) ? j.serviceIds.map(String) : [] };
            setNext(now);
            localStorage.setItem(VISIT, JSON.stringify(now));
          })
          .catch(() => {
            /* offline: what the device remembers stays */
          });
      }
    } catch {
      /* private mode: nothing remembered */
    }
    // once, on arrival: the catalog does not change under the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  useEffect(() => () => void (byeTimer.current && clearTimeout(byeTimer.current)), []);

  // an open sheet: the page under it stays put, Escape closes it
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(null);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = was;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheet]);

  /* ---------- the salon's page ---------- */
  const openAbout = () => {
    aboutFrom.current = { y: window.scrollY, el: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    setSheet(null);
    setAbout(true);
    if (!ABOUT_PATH.test(window.location.pathname)) {
      window.history.pushState(null, "", `/${lang}/about`);
      aboutPushed.current = true;
    }
  };

  // back: the entry it pushed goes, and the step is as it was; opened by its
  // own address, the booking start is under it
  const closeAbout = useCallback(() => {
    if (aboutPushed.current) {
      window.history.back(); // popstate below closes it
      return;
    }
    window.history.replaceState(null, "", `/${lang}${window.location.search}`);
    setAbout(false);
  }, [lang]);

  // the phone's back and forward: the address says whether the page is open
  useEffect(() => {
    const onPop = () => {
      const open = ABOUT_PATH.test(window.location.pathname);
      aboutPushed.current = open;
      setAbout(open);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // open: from the top; closed: the step where it was, and the button that opened it
  const aboutSeen = useRef(aboutFirst);
  useLayoutEffect(() => {
    if (about === aboutSeen.current) return;
    aboutSeen.current = about;
    if (about) {
      window.scrollTo(0, 0);
      return;
    }
    window.scrollTo(0, aboutFrom.current.y);
    aboutFrom.current.el?.focus({ preventScroll: true });
    aboutFrom.current.el = null;
  }, [about]);

  // Escape closes it; the top bar turns white under the panel, and names the salon once its name is gone under it
  useEffect(() => {
    if (!about) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAbout();
    const onScroll = () => {
      const h = barRef.current?.offsetHeight ?? 64;
      const name = nameRef.current?.getBoundingClientRect().bottom ?? Infinity;
      const panel = panelRef.current?.getBoundingClientRect().top ?? Infinity;
      setBar(name <= h ? 2 : panel <= h ? 1 : 0);
    };
    onScroll();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      setBar(0);
    };
  }, [about, closeAbout]);

  // the salon's reviews: the first six when the page opens, six more on «Ещё отзывы»
  const loadReviews = useCallback(async (before?: string) => {
    setReviewsBusy(true);
    setReviewsError(false);
    try {
      const r = await fetch(`/api/salon/reviews?limit=${REVIEWS_STEP}${before ? `&before=${before}` : ""}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as SalonReviews;
      setReviews((was) => (before && was ? { rows: [...was.rows, ...j.rows.filter((x) => !was.rows.some((y) => y.id === x.id))], more: j.more } : j));
    } catch {
      setReviewsError(true);
    } finally {
      setReviewsBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!about || reviewsAsked.current || catalog.location.reviewCount === 0) return;
    reviewsAsked.current = true;
    void loadReviews();
  }, [about, catalog.location.reviewCount, loadReviews]);

  // free times for the current choice, the whole horizon at once
  const availKey = barber && services.length ? `${barber}|${services.join(",")}` : "";
  const wantsTimes = screen === "time" || screen === "details";
  useEffect(() => {
    if (!availKey || !wantsTimes || avail?.key === availKey) return;
    const ctl = new AbortController();
    setAvailError(false);
    const [staff, ids] = availKey.split("|");
    // a visit being moved asks by its own link: it does not stand in its own way
    fetch(moving ? `/api/visit/${moving.token}/slots?days=${horizonDays}` : `/api/slots?services=${ids}&staff=${staff}&days=${horizonDays}`, { signal: ctl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { offered: boolean; days: Day[] }) => setAvail({ key: availKey, offered: j.offered, days: j.days }))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setAvailError(true);
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availKey, wantsTimes, avail?.key, horizonDays]);

  const ready = avail && avail.key === availKey ? avail : null;
  const earliest = useMemo(() => ready?.days.find((d) => d.s.length)?.d ?? null, [ready]);
  const shownDay = day ?? earliest ?? ready?.days[0]?.d ?? null;

  /* ---------- formatting ---------- */
  const fmtTime = (ms: number) =>
    new Intl.DateTimeFormat(INTL[lang], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(ms);
  const wd = (d: string) => new Intl.DateTimeFormat(INTL[lang], { weekday: "short", timeZone: "UTC" }).format(dateOf(d)).replace(".", "");
  const dLong = (d: string) =>
    new Intl.DateTimeFormat(INTL[lang], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(dateOf(d));

  /* ---------- who and how much ---------- */
  // a picked time names the barber only from the details on
  const late = screen === "details" || screen === "done" || screen === "bye";
  const slotStaff = slot && late ? staffById.get(slot.staffId) ?? null : null;
  const assigned = slotStaff ?? (barber && barber !== "any" ? staffById.get(barber) ?? null : null);
  const extra = slotStaff ? slot?.extra ?? 0 : 0;
  const base = assigned ? priceOf(assigned, services) : 0;
  const who = () => {
    if (slotStaff && barber === "any") return `${slotStaff.name} (${c.firstFree})`;
    if (barber === "any") return c.anyBarber;
    return assigned?.name ?? "";
  };
  const priceNow = () => (assigned ? eur(base + extra) : euroRange(capable(services).map((b) => priceOf(b, services))));
  const names = (ids: string[]) => ids.map((id) => pick(svcById.get(id)?.name, lang)).join(" + ");

  /* ---------- actions ---------- */
  const resetTime = () => {
    setDay(null);
    setSlot(null);
    setTaken(null);
    setCalMonth(null);
  };

  const switchLang = (l: Locale) => {
    setLang(l);
    setSheet(null);
    document.documentElement.lang = l;
    const rest = window.location.pathname.split("/").slice(2).join("/");
    window.history.replaceState(null, "", `/${l}${rest ? `/${rest}` : ""}${window.location.search}`);
  };

  // another barber: the services he does not do drop out, and the times start over
  const pickBarber = (v: string) => {
    if (v === barber) return;
    resetTime();
    setBarber(v);
    if (v !== "any") {
      const b = staffById.get(v);
      setServices((s) => s.filter((id) => b?.offers[id]));
    }
  };

  const toggleService = (id: string) => {
    resetTime();
    setServices((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const pickDay = (d: string) => {
    setDay(d);
    setSlot(null);
    setTaken(null);
    setMoveError(""); // «just taken» was about the time before
    setCalMonth(d.slice(0, 7));
  };

  const pickSlot = (d: string, [t, staffId, x = 0]: Tuple) => {
    setDay(d);
    setSlot({ t, staffId, extra: x });
    setTaken(null);
    setMoveError("");
    setFormError("");
    key.current = newKey();
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting || !slot || taken) return;
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = c.errName;
    if (form.phone.replace(/\D/g, "").length < 7) errs.phone = c.errPhone;
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = c.errEmail;
    if (!consent) errs.consent = c.errConsent;
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length) {
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key.current },
        body: JSON.stringify({
          serviceIds: services,
          staffId: barber === "any" ? null : barber,
          startsAt: new Date(slot.t).toISOString(),
          // the price the client saw: the server books it or says the time is gone
          extraCents: slot.extra,
          name: form.name,
          phone: form.phone,
          email: form.email || null,
          comment: form.comment || null,
          locale: lang,
          smsReminder: sms,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.visit) {
        const start = Date.parse(j.visit.startsAt);
        const end = Date.parse(j.visit.endsAt);
        try {
          localStorage.setItem(STORE, JSON.stringify({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() }));
          if (barber) localStorage.setItem(LAST, JSON.stringify({ barber, services }));
          if (j.manageUrl) localStorage.setItem(VISIT, JSON.stringify({ url: j.manageUrl, start, end, staffId: j.visit.staffId, services }));
        } catch {
          /* not remembered: fine */
        }
        if (j.manageUrl) {
          setMine(j.manageUrl);
          setNext({ url: j.manageUrl, start, end, staffId: j.visit.staffId, services });
        }
        setDone({ start, end, staffId: j.visit.staffId, totalCents: j.visit.totalCents, extraCents: j.visit.extraCents ?? 0, manageUrl: j.manageUrl });
        setSlot({ t: start, staffId: j.visit.staffId, extra: j.visit.extraCents ?? 0 });
        setAvail(null); // the chair is taken now
        setScreen("done");
      } else if (res.status === 409 && j.error === "slot_taken") {
        setTaken(j.alternatives ?? []);
        setAvail(null);
      } else if (res.status === 422 && j.field && ["name", "phone", "email"].includes(j.field)) {
        setErrors({ [j.field]: j.field === "name" ? c.errName : j.field === "phone" ? c.errPhone : c.errEmail });
      } else {
        setFormError(c.errGeneric);
      }
    } catch {
      setFormError(c.errGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  // the visit moves to the picked time; then its own page says so
  const moveVisit = async () => {
    if (!moving || !slot || moveBusy) return;
    setMoveBusy(true);
    setMoveError("");
    try {
      const res = await fetch(`/api/visit/${moving.token}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startsAt: new Date(slot.t).toISOString(), extraCents: slot.extra }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        try {
          const v = JSON.parse(localStorage.getItem(VISIT) || "null");
          if (v && typeof v.url === "string" && j.startsAt && j.endsAt) localStorage.setItem(VISIT, JSON.stringify({ ...v, start: Date.parse(j.startsAt), end: Date.parse(j.endsAt) }));
        } catch {
          /* not remembered: the visit's page knows */
        }
        window.location.assign(`${moving.url.replace(/^\/(ru|et|en)\//, `/${lang}/`)}?moved=1`);
        return;
      }
      if (res.status === 409 && j.error === "slot_taken") {
        setSlot(null);
        setAvail(null);
        setMoveError(c.taken);
      } else if (res.status === 409 || res.status === 404) {
        setMoveError(c.moveGone);
      } else {
        setMoveError(c.errGeneric);
      }
    } catch {
      setMoveError(c.errGeneric);
    }
    setMoveBusy(false);
  };

  // «Book again»: the same barber and services, another time
  const again = () => {
    resetTime();
    setDone(null);
    setRemembered(true);
    setScreen("time");
  };

  // the start, as a client who just arrived: the visit just booked is on it
  const home = () => {
    if (byeTimer.current) clearTimeout(byeTimer.current);
    byeTimer.current = null;
    resetTime();
    setDone(null);
    setServices([]);
    setRemembered(true);
    setScreen("barber");
  };

  // the calendar file opens or downloads; then the goodbye, and the start again by itself
  const addedToCalendar = () => {
    if (byeTimer.current) clearTimeout(byeTimer.current);
    byeTimer.current = setTimeout(() => {
      setScreen("bye");
      byeTimer.current = setTimeout(home, BYE_MS);
    }, 700);
  };

  /* ---------- pieces ---------- */
  const face = (s: CatalogStaff) =>
    // eslint-disable-next-line @next/next/no-img-element
    s.photoUrl ? <img src={s.photoUrl} alt="" width={96} height={96} decoding="async" /> : s.name.slice(0, 2).toUpperCase();
  const myLink = mine ? mine.replace(/^\/(ru|et|en)\//, `/${lang}/`) : null;
  const roleOf = (s: CatalogStaff) => pick(s.role, lang) || c.barberK;

  // the average of the barber's reviews on show (src/lib/reviews.ts): whole stars, as the widget draws
  // them, and the count; a barber with no review shows nothing. A screen reader hears «4,9 из 5».
  const ratedOf = (s: CatalogStaff) =>
    c.rated(new Intl.NumberFormat(INTL[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(s.rating ?? 0));
  const stars = (s: CatalogStaff) =>
    s.rating == null || s.reviewCount === 0 ? null : (
      <span className="stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon key={n} on={n <= Math.round(s.rating ?? 0)} />
        ))}
        <span className="tiny">{c.nReviews(s.reviewCount)}</span>
      </span>
    );

  const langBtn = (
    <button type="button" className="rbtn" aria-label={`${c.lang}: ${lang.toUpperCase()}`} onClick={() => setSheet({ kind: "lang" })}>
      {lang.toUpperCase()}
    </button>
  );

  const header = (back?: () => void) => (
    <header className="hd">
      {back ? (
        <button type="button" className="rbtn" aria-label={c.back} onClick={back}>
          <ChevronIcon dir="left" />
        </button>
      ) : (
        <span className="hd-gap" />
      )}
      <LogoMark src={salonLogo} alt={salonName} />
      <button type="button" className="hd-co" onClick={openAbout}>
        <b>
          {salonName}
          <ChevronIcon size={20} />
        </b>
        <span className="sub">{catalog.location.address}</span>
      </button>
      {langBtn}
    </header>
  );

  const cta = (label: React.ReactNode, onClick: () => void, disabled = false) => (
    <div className="cta">
      <div className="cta-in">
        {/* a new button per screen: reusing one would let a tap on «Continue» land on the next screen's button */}
        <button key={`go-${screen}`} type="button" className="btn btn-primary" disabled={disabled} onClick={onClick}>
          {label}
        </button>
      </div>
    </div>
  );

  /** The visit as chosen or as booked: who, when, what, how much. Pencils only while it can still change. */
  const summary = (edit: boolean) => {
    if (!slot) return null;
    const start = done?.start ?? slot.t;
    const mins = done ? Math.round((done.end - done.start) / 60_000) : durOf(assigned, services);
    const end = done?.end ?? start + mins * 60_000;
    const x = done?.extraCents ?? extra;
    return (
      <>
        <div className="sum-row">
          <span className="ava">{assigned ? face(assigned) : <PeopleIcon />}</span>
          <span className="cell-txt">
            <span>{who()}</span>
            <span className="sub">{assigned ? roleOf(assigned) : c.anyRole}</span>
          </span>
          {edit && (
            <button type="button" className="pencil" aria-label={c.editBarber} onClick={() => setScreen("barber")}>
              <PencilIcon />
            </button>
          )}
        </div>
        <div className="sum-row">
          <span className="sum-ico">
            <DayIcon />
          </span>
          <span className="cell-txt">
            <span className="sub">{cap(dLong(localParts(start, tz).date))}</span>
            <span>
              {fmtTime(start)} — {fmtTime(end)}
            </span>
          </span>
          {edit && (
            <button type="button" className="pencil" aria-label={c.editTime} onClick={() => setScreen("time")}>
              <PencilIcon />
            </button>
          )}
        </div>
        <div className="sum-h">
          <h2 className="t2">{c.services}</h2>
          <span className="sub">{duration(mins, c)}</span>
          {edit && (
            <button type="button" className="pencil" aria-label={c.editServices} onClick={() => setScreen("services")}>
              <PencilIcon />
            </button>
          )}
        </div>
        {services.map((id) => (
          <div className="sum-svc" key={id}>
            <span>
              <span>{pick(svcById.get(id)?.name, lang)}</span>
              <span className="sub">{duration(assigned?.offers[id]?.[1] ?? svcById.get(id)?.durationMin ?? 0, c)}</span>
            </span>
            <b>{assigned ? eur(assigned.offers[id]?.[0] ?? 0) : ""}</b>
          </div>
        ))}
        {x > 0 && (
          <div className="sum-svc">
            <span>{c.special}</span>
            <b>+{eur(x)}</b>
          </div>
        )}
        <div className="sum-total">
          <span>{c.total}</span>
          <span>{eur(done?.totalCents ?? base + x)}</span>
        </div>
      </>
    );
  };

  // one free time; on special time its extra is on the chip
  const slotBtn = (d: string, x: Tuple) => {
    const [t, , add = 0] = x;
    return (
      <button
        key={t}
        type="button"
        className="slot"
        // the time the visit has now is no move
        disabled={moving?.start === t}
        aria-pressed={slot?.t === t}
        aria-label={add > 0 ? `${fmtTime(t)}, ${c.special}, +${eur(add)}` : undefined}
        onClick={() => pickSlot(d, x)}
      >
        <span>{fmtTime(t)}</span>
        {add > 0 && <small>+{eur(add)}</small>}
      </button>
    );
  };

  /* ---------- screens ---------- */
  /** The visit this device booked and still has ahead: when, with whom, and the way to change it. */
  const nextVisit = () => {
    if (!next || !myLink) return null;
    const what = [staffById.get(next.staffId)?.name, names(next.services.filter((id) => svcById.has(id)))].filter(Boolean).join(", ");
    return (
      <a className="next" href={myLink}>
        <span className="tiny">{c.yourVisit}</span>
        <b>
          {cap(dLong(localParts(next.start, tz).date))}, {fmtTime(next.start)}
        </b>
        {what && <span className="sub">{what}</span>}
        <span className="lk">{c.changeCancel}</span>
      </a>
    );
  };

  const barberScreen = () => (
    <>
      <div className="hero">
        {langBtn}
        <div className="hero-panel">
          <LogoMark size={80} src={salonLogo} alt={salonName} />
          <h1 className="t1">
            <button type="button" className="hero-co" onClick={openAbout}>
              {salonName}
              <ChevronIcon width={2.4} />
            </button>
          </h1>
          <p className="sub">{catalog.location.address}</p>
        </div>
      </div>
      {nextVisit()}
      <div className="cells" role="radiogroup" aria-label={c.barber}>
        <div className="cell">
          <button type="button" className="cell-main mid" role="radio" aria-checked={barber === "any"} onClick={() => pickBarber("any")}>
            <span className="ava">
              <PeopleIcon />
            </span>
            <span>{c.anyBarber}</span>
            <span className="radio" />
          </button>
        </div>
        {catalog.staff.map((s) => {
          const bio = pick(s.bio, lang);
          return (
            <div key={s.id} className={`cell${bio ? " has-info" : ""}`}>
              <button
                type="button"
                className="cell-main"
                role="radio"
                aria-checked={barber === s.id}
                aria-label={s.rating != null && s.reviewCount > 0 ? `${s.name}, ${roleOf(s)}, ${ratedOf(s)}, ${c.nReviews(s.reviewCount)}` : `${s.name}, ${roleOf(s)}`}
                onClick={() => pickBarber(s.id)}
              >
                <span className="ava">{face(s)}</span>
                <span className="cell-txt">
                  <span>{s.name}</span>
                  <span className="sub">{roleOf(s)}</span>
                  {stars(s)}
                </span>
                <span className="radio" />
              </button>
              {bio && (
                <button type="button" className="info-btn" aria-label={c.about(s.name)} onClick={() => setSheet({ kind: "barber", id: s.id })}>
                  <span>
                    <InfoIcon />
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  const servicesScreen = () => {
    const b = barber && barber !== "any" ? staffById.get(barber) ?? null : null;
    const list = b ? catalog.services.filter((s) => b.offers[s.id]) : catalog.services.filter((s) => catalog.staff.some((x) => x.offers[s.id]));
    return (
      <>
        <h1 className="t1 pg-title">{c.chooseServices}</h1>
        <div className="svcs">
          {list.map((s) => {
            const on = services.includes(s.id);
            // «anyone»: a service nobody does together with the ones picked cannot be added
            const possible = on || !!b || capable([...services, s.id]).length > 0;
            const price = b ? eur(b.offers[s.id][0]) : euroRange(catalog.staff.filter((x) => x.offers[s.id]).map((x) => x.offers[s.id][0]));
            return (
              <button key={s.id} type="button" className="svc" role="checkbox" aria-checked={on} disabled={!possible} onClick={() => toggleService(s.id)}>
                <span className="svc-txt">
                  <span>{pick(s.name, lang)}</span>
                  <span className="sub">{duration(b ? b.offers[s.id][1] : s.durationMin, c)}</span>
                  <span className="svc-price">{price}</span>
                </span>
                <span className="check">
                  <CheckIcon size={14} width={3.2} />
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  };

  const basket = () => (
    <div className="basket">
      <div className="basket-in">
        <div className="basket-row">
          <span>{c.nServices(services.length)}</span>
          <span className="tiny">{duration(durOf(assigned, services), c)}</span>
          <span className="pr">{priceNow()}</span>
        </div>
        <button key="go-services" type="button" className="btn btn-primary" onClick={() => setScreen("time")}>
          {c.cont}
          <span className="badge">{services.length}</span>
        </button>
      </div>
    </div>
  );

  const timeScreen = () => {
    if (availError) return <p className="alert stack">{c.errGeneric}</p>;
    if (!ready) {
      return (
        <p className="wait" role="status">
          {c.loading}
        </p>
      );
    }
    if (!earliest) {
      const name = barber && barber !== "any" ? staffById.get(barber)?.name ?? "" : salonName;
      return (
        <div className="empty">
          <p className="t2">{c.noneAhead(name, horizonDays)}</p>
          {barber !== "any" && (
            <button type="button" className="btn btn-primary" onClick={() => pickBarber("any")}>
              {c.anyoneInstead}
            </button>
          )}
          {catalog.location.phone && (
            <a className="btn btn-soft" href={`tel:${catalog.location.phone.replace(/\s/g, "")}`}>
              {c.callSalon}
            </a>
          )}
        </div>
      );
    }
    const byDate = new Map(ready.days.map((d) => [d.d, d]));
    const current = byDate.get(shownDay ?? "") ?? ready.days[0];
    const today = localParts(Date.now(), tz).date;

    // the month, Monday first, with the days around it that fill its weeks
    const months = [...new Set(ready.days.map((d) => d.d.slice(0, 7)))];
    const month = calMonth && months.includes(calMonth) ? calMonth : current.d.slice(0, 7);
    const mi = months.indexOf(month);
    const [cy, cm] = month.split("-").map(Number);
    const first = Date.UTC(cy, cm - 1, 1);
    const lead = (new Date(first).getUTCDay() + 6) % 7;
    const inMonth = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
    const rows = Math.ceil((lead + inMonth) / 7);
    const cells = Array.from({ length: rows * 7 }, (_, i) => ymd(first + (i - lead) * 86_400_000));
    const at = cells.indexOf(current.d);
    const shown = monthOpen ? cells : cells.slice(at < 0 ? 0 : at - (at % 7), (at < 0 ? 0 : at - (at % 7)) + 7);
    const wdNames = Array.from({ length: 7 }, (_, i) => wd(`2024-01-0${i + 1}`)); // 01.01.2024 was a Monday

    let body: React.ReactNode;
    if (!current.s.length) {
      const nextDay = ready.days.find((d) => d.d > current.d && d.s.length) ?? byDate.get(earliest);
      body = (
        <div className="empty">
          <p className="t2">{current.open ? c.noTimeDay : c.closedDay}</p>
          {nextDay && nextDay.d !== current.d && (
            <>
              <p>
                {c.nextDate}
                <br />
                {cap(dLong(nextDay.d))}
              </p>
              <button type="button" className="btn btn-primary btn-auto" onClick={() => pickDay(nextDay.d)}>
                {c.toNearest}
              </button>
            </>
          )}
        </div>
      );
    } else {
      const groups: [string, string, (m: number) => boolean][] = [
        ["am", c.morning, (m) => m < 720],
        ["day", c.day, (m) => m >= 720 && m < 1020],
        ["pm", c.evening, (m) => m >= 1020],
      ];
      body = (
        <div className="groups">
          {groups.map(([id, name, f]) => {
            const xs = current.s.filter(([t]) => f(localParts(t, tz).minutes));
            if (!xs.length) return null;
            const open = !closed[id];
            return (
              <section className="grp" key={id}>
                <button type="button" className="grp-h" aria-expanded={open} onClick={() => setClosed((v) => ({ ...v, [id]: open }))}>
                  <span>{name}</span>
                  <ChevronIcon dir={open ? "up" : "down"} />
                </button>
                {open && <div className="slots">{xs.map((x) => slotBtn(current.d, x))}</div>}
              </section>
            );
          })}
          {current.s.some((x) => (x[2] ?? 0) > 0) && <p className="tiny legend">{c.specialNote}</p>}
        </div>
      );
    }

    return (
      <>
        {moving && (
          <div className="moving">
            <h1 className="t2">{c.movingTitle}</h1>
            <p className="sub">{c.movingNow(dLong(localParts(moving.start, tz).date), fmtTime(moving.start))}</p>
            {moveError && (
              <p className="alert" role="alert">
                {moveError}
              </p>
            )}
          </div>
        )}
        <div className="cal">
          <div className="cal-top">
            <button type="button" className="cal-month" aria-expanded={monthOpen} onClick={() => setMonthOpen((v) => !v)}>
              <span>
                {cap(new Intl.DateTimeFormat(INTL[lang], { month: "long", timeZone: "UTC" }).format(first))}
                <ChevronIcon dir={monthOpen ? "up" : "down"} size={16} width={2.4} />
              </span>
            </button>
            <button type="button" className="cal-nav" disabled={mi <= 0} aria-label={c.prevMonth} onClick={() => setCalMonth(months[mi - 1])}>
              <ChevronIcon dir="left" size={16} width={2.4} />
            </button>
            <button type="button" className="cal-nav" disabled={mi >= months.length - 1} aria-label={c.nextMonth} onClick={() => setCalMonth(months[mi + 1])}>
              <ChevronIcon dir="right" size={16} width={2.4} />
            </button>
          </div>
          <div className="cal-wd" aria-hidden="true">
            {wdNames.map((n) => (
              <span key={n}>{cap(n)}</span>
            ))}
          </div>
          <div className="cal-grid">
            {shown.map((d) => {
              const known = byDate.get(d);
              const free = !!known?.s.length;
              return (
                <button
                  key={d}
                  type="button"
                  className={`cal-d${free ? "" : " off"}${d === today ? " today" : ""}`}
                  disabled={!known}
                  aria-pressed={d === current.d}
                  aria-label={dLong(d)}
                  onClick={() => pickDay(d)}
                >
                  <span>{Number(d.slice(8, 10))}</span>
                </button>
              );
            })}
          </div>
        </div>
        {body}
      </>
    );
  };

  const field = (id: "name" | "phone" | "email" | "comment", label: string, input: React.ReactNode, hint?: string) => (
    <div className={`field${errors[id] ? " err" : ""}`}>
      <label className="flabel" htmlFor={`f-${id}`}>
        {label}
      </label>
      {input}
      {errors[id] ? <span className="ferr">{errors[id]}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
  const onField = (id: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [id]: v }));
    if (errors[id]) setErrors(({ [id]: _drop, ...rest }) => rest);
  };

  const detailsScreen = () => {
    if (!slot) return null;
    const tickConsent = () => {
      setConsent((v) => !v);
      if (errors.consent) setErrors(({ consent: _drop, ...rest }) => rest);
    };
    return (
      <form id="bf" noValidate onSubmit={submit}>
        <div className="blk top">
          <h1 className="t1">{c.visitDetails}</h1>
          {summary(true)}
        </div>
        <div className="blk form">
          <h2 className="t2">{c.details}</h2>
          <div className="fields">
            {taken && (
              <div className="taken" role="alert">
                <h3>{c.taken}</h3>
                <p>{c.takenSub}</p>
                {taken.length > 0 && <div className="slots">{taken.map((x) => slotBtn(localParts(x[0], tz).date, x))}</div>}
              </div>
            )}
            {remembered && <p className="welcome">{c.welcome}</p>}
            {field(
              "name",
              `${c.name} *`,
              <input className="input" id="f-name" name="name" autoComplete="name" placeholder={c.enterName} value={form.name} onChange={onField("name")} maxLength={120} required />,
            )}
            {field(
              "phone",
              `${c.phone} *`,
              <input className="input" id="f-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={onField("phone")} maxLength={30} required />,
            )}
            {field(
              "email",
              c.email,
              <input className="input" id="f-email" name="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={onField("email")} maxLength={254} />,
              c.emailHint,
            )}
            {field(
              "comment",
              c.commentLong,
              <input className="input" id="f-comment" name="comment" placeholder={c.commentHint} value={form.comment} onChange={onField("comment")} maxLength={1000} />,
            )}
            <label className="selrow">
              <span className="flabel">{c.reminder}</span>
              <select id="f-remind" value={sms ? "on" : "off"} onChange={(e) => setSms(e.target.value === "on")}>
                <option value="on">{c.remindAt(reminderMin)}</option>
                <option value="off">{c.remindNone}</option>
              </select>
              <ChevronIcon dir="right" />
            </label>
            {/* the tick is the button, named by its words; a tap on the words ticks it too, as before, but the
                policy's link only opens the policy, in a new tab, so the form stays as filled in */}
            <div className={`field${errors.consent ? " err" : ""}`}>
              <div className="consent">
                <button type="button" id="f-consent" role="checkbox" aria-checked={consent} aria-labelledby="f-consent-words" onClick={tickConsent}>
                  <span className="check">
                    <CheckIcon size={14} width={3.2} />
                  </span>
                </button>
                <span id="f-consent-words" onClick={(e) => !(e.target as Element).closest("a") && tickConsent()}>
                  {c.consent[0]}
                  <a className="link" href={`/${lang}/privacy`} target="_blank" rel="noopener">
                    {c.consent[1]}
                  </a>
                  {c.consent[2]}
                </span>
              </div>
              {errors.consent && <span className="ferr">{errors.consent}</span>}
            </div>
            {formError && (
              <p className="alert" role="alert">
                {formError}
              </p>
            )}
          </div>
        </div>
        <div className="blk total-blk">
          <span>{c.total}</span>
          <span>{eur(base + extra)}</span>
        </div>
        <div className="foot">
          <button type="submit" className="btn btn-primary" disabled={submitting || !!taken}>
            {submitting ? c.booking : c.book}
          </button>
        </div>
      </form>
    );
  };

  const doneScreen = () => {
    if (!done) return null;
    const token = done.manageUrl?.split("/").pop();
    return (
      <>
        <div className="blk top">
          <div className="mark">
            <CheckIcon size={24} width={2.6} />
          </div>
          <h1 className="t1">{c.booked}</h1>
          <p className="lead">
            {c.seeYou(dLong(localParts(done.start, tz).date), fmtTime(done.start))} {sms ? c.smsAt(reminderMin) : ""}
          </p>
          {summary(false)}
        </div>
        <div className="blk btns">
          {token && (
            <a className="btn btn-primary" href={`/api/ics/${token}?lang=${lang}`} onClick={addedToCalendar}>
              {c.addCal}
            </a>
          )}
          {done.manageUrl && (
            <a className="btn btn-soft" href={done.manageUrl.replace(/^\/(ru|et|en)\//, `/${lang}/`)}>
              {c.changeCancel}
            </a>
          )}
          <button type="button" className="btn btn-text" onClick={again}>
            {c.again}
          </button>
          <p className="note">{cutoffHours > 0 ? c.cutoff(cutoffHours) : c.anyTime}</p>
        </div>
        {pushKey && token && <RemindMe token={token} publicKey={pushKey} c={c.remind} />}
        <InstallOffer c={c.install} />
        <div className="tail" />
      </>
    );
  };

  const byeScreen = () => (
    <div className="bye">
      <LogoMark size={80} src={salonLogo} alt={salonName} />
      <h1 className="t1">{c.byeTitle(form.name.trim().split(/\s+/)[0] ?? "")}</h1>
      {done && <p>{c.seeYou(dLong(localParts(done.start, tz).date), fmtTime(done.start))}</p>}
      <p className="day">{c.goodDay}</p>
      <button type="button" className="btn btn-primary" onClick={home}>
        {c.home}
      </button>
      <p className="sub">{c.homeSoon}</p>
    </div>
  );

  const sheetView = () => {
    if (!sheet) return null;
    const b = sheet.kind === "barber" ? staffById.get(sheet.id) ?? null : null;
    const close = () => setSheet(null);
    return (
      <div className="sheet-wrap">
        <button type="button" className="sheet-scrim" aria-label={c.close} tabIndex={-1} onClick={close} />
        <div className="sheet" role="dialog" aria-modal="true" aria-label={sheet.kind === "lang" ? c.lang : b?.name}>
          <button type="button" className="sheet-x" aria-label={c.close} autoFocus onClick={close}>
            <span>
              <CrossIcon size={16} />
            </span>
          </button>
          {sheet.kind === "lang" && (
            <>
              <h2 className="t2">{c.lang}</h2>
              <div className="opts">
                {LOCALES.map((l) => (
                  <button key={l} type="button" className="opt" lang={l} aria-pressed={lang === l} onClick={() => switchLang(l)}>
                    {l === "ru" ? "Русский" : l === "et" ? "Eesti" : "English"}
                    {lang === l && <CheckIcon size={20} width={2.6} />}
                  </button>
                ))}
              </div>
            </>
          )}
          {b && (
            <>
              <div className="sheet-head">
                <span className="ava big">{face(b)}</span>
                <span className="cell-txt">
                  <h2 className="t2">{b.name}</h2>
                  <span className="sub">{roleOf(b)}</span>
                  {stars(b)}
                </span>
              </div>
              <p>{pick(b.bio, lang)}</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  pickBarber(b.id);
                  close();
                }}
              >
                {c.pickThis}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  /* ---------- the salon's page ---------- */
  // «Записаться»: the booking start (a visit being moved goes back to its times)
  const bookFromAbout = () => {
    aboutFrom.current = { y: 0, el: null };
    if (!moving) {
      if (screen === "done" || screen === "bye") home();
      else setScreen("barber");
    }
    closeAbout();
  };

  const fmtDay = (ms: number) => {
    const s = new Intl.DateTimeFormat(INTL[lang], { day: "numeric", month: "long", year: "numeric", timeZone: tz }).format(ms);
    return lang === "ru" ? s.replace(/\s*г\.$/, "") : s; // «18 мая 2026», as the widget
  };

  const aboutScreen = () => {
    const L = catalog.location;
    const s = c.salon;
    const name = salonName;
    const words = L.about[lang] || L.about.en || pick(L.about, lang);
    const hours = pick(L.schedule, lang);
    const contacts = contactRows(L);
    // «Как нас найти»: the postcode and the country under the address
    const region = [L.postcode, countryName(L.country, lang)].filter(Boolean).join(", ");
    const place = (more = "") => (
      <a className="ab-row" href={mapsHref(L)} target="_blank" rel="noreferrer">
        <PinIcon />
        <span>
          {L.address}
          {more && <small className="ab-sub">{more}</small>}
        </span>
      </a>
    );
    const last = reviews?.rows[reviews.rows.length - 1]?.id;
    const avg = L.rating == null ? "" : new Intl.NumberFormat(INTL[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(L.rating);
    return (
      <main className="app ab-app" aria-labelledby="ab-name">
        {demo && <p className="demo">{c.demo}</p>}
        <header ref={barRef} className={`ab-bar${bar ? " solid" : ""}${bar === 2 ? " named" : ""}`}>
          <button type="button" className="rbtn" aria-label={c.back} onClick={closeAbout}>
            <ChevronIcon dir="left" />
          </button>
          <span className="ab-bar-co" aria-hidden="true">
            <LogoMark size={36} src={salonLogo} alt="" />
            <b>{name}</b>
          </span>
        </header>
        <div className="ab-panel" ref={panelRef}>
          <LogoMark size={96} src={salonLogo} alt={salonName} />
          <h1 className="ab-name" id="ab-name" ref={nameRef}>
            {name}
          </h1>
          {L.reviewCount > 0 && (
            <button
              type="button"
              className="ab-rating"
              aria-label={`${c.nReviews(L.reviewCount)}${avg ? `, ${c.rated(avg)}` : ""}. ${s.toReviews}`}
              onClick={() => reviewsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <StarIcon size={20} />
              {/* «4,9 · 7 отзывов»: the average of the salon's own reviews on show, then how many */}
              <span>
                {avg && (
                  <>
                    <b className="ab-avg">{avg}</b>
                    {" · "}
                  </>
                )}
                {c.nReviews(L.reviewCount)}
              </span>
            </button>
          )}
          {(L.address || hours) && (
            <ul className="ab-rows">
              {L.address && <li>{place()}</li>}
              {hours && (
                <li className="ab-row">
                  <ClockIcon />
                  <span>{hours}</span>
                </li>
              )}
            </ul>
          )}
          {contacts.length > 0 && (
            <section aria-labelledby="ab-contacts">
              <h2 className="ab-label" id="ab-contacts">
                {s.contacts}
              </h2>
              <ul className="ab-rows">
                {contacts.map((r) => (
                  <li key={r.key}>
                    <a className="ab-row" href={r.href} {...(r.out ? { target: "_blank", rel: "noreferrer" } : {})}>
                      {r.icon}
                      <span>
                        {r.text}
                        {r.sub && <small className="ab-sub">{r.sub}</small>}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {words && (
            <section aria-labelledby="ab-about">
              <h2 className="ab-h" id="ab-about">
                {s.about}
              </h2>
              <p className="ab-text">{words}</p>
            </section>
          )}
          {L.photos.length > 0 && (
            <section aria-labelledby="ab-photos">
              <h2 className="ab-label" id="ab-photos">
                {s.photos}
              </h2>
              <div className="ab-photos">
                {L.photos.map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={`${i}-${u}`} src={u} alt={L.photos.length > 1 ? `${name} ${i + 1}` : name} width={240} height={200} loading="lazy" decoding="async" />
                ))}
              </div>
            </section>
          )}
          {L.pin && (
            <section aria-labelledby="ab-where">
              <h2 className="ab-h" id="ab-where">
                {s.where}
              </h2>
              {L.address && <div className="ab-rows">{place(region)}</div>}
              <div className="ab-map">
                {/* our own picture of OpenStreetMap's tiles with the pin (src/components/osm-map.tsx), loaded only when near */}
                <OsmMap pin={L.pin} zoom={16} lazy label={s.map} />
                {/* the whole map is one tap into the phone's maps app; the picture takes no touch, so the page scrolls over it; «© OpenStreetMap» stays above */}
                <a className="ab-map-open" href={mapsHref(L)} target="_blank" rel="noreferrer" aria-label={`${s.openMap}: ${L.address || name}`}>
                  <span>{s.openMap}</span>
                </a>
              </div>
            </section>
          )}
          {/* always there: the card to write one, then the reviews on show */}
          <section className="ab-reviews" ref={reviewsRef} aria-labelledby="ab-reviews">
            <h2 className="ab-h" id="ab-reviews">
              {s.reviews}
            </h2>
            <p className="sub">{L.reviewCount > 0 ? c.nReviews(L.reviewCount) : s.noneYet}</p>
            <ReviewCard c={c} sent={reviewSent} onRate={setRateWith} />
            {L.reviewCount > 0 && (
              <>
                {reviews && reviews.rows.length > 0 && (
                  <ul className="rvs">
                    {reviews.rows.map((r) => (
                      <li key={r.id} className="rv">
                        <span className="rv-ava" aria-hidden="true">
                          {initials(r.name)}
                        </span>
                        <span className="rv-head">
                          <b>{r.name}</b>
                          <span className="rv-meta">
                            <span className="rv-stars" role="img" aria-label={c.rated(String(r.rating))}>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <StarIcon key={n} size={14} on={n <= r.rating} />
                              ))}
                            </span>
                            <time dateTime={new Date(r.at).toISOString()}>{fmtDay(r.at)}</time>
                          </span>
                        </span>
                        {r.body && <p className="rv-body">{r.body}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                {!reviews && !reviewsError && (
                  <p className="wait" role="status">
                    {c.loading}
                  </p>
                )}
                {reviewsError && (
                  <p className="alert" role="alert">
                    {s.noMore}
                  </p>
                )}
                {(reviews?.more || reviewsError) && (
                  <button type="button" className="btn ab-more" disabled={reviewsBusy} onClick={() => void loadReviews(reviews ? last : undefined)}>
                    {s.more}
                  </button>
                )}
              </>
            )}
          </section>
          {/* the page's foot: the privacy policy, in a new tab, so this page stays where it was */}
          <p className="ab-label">
            <a className="link" href={`/${lang}/privacy`} target="_blank" rel="noopener">
              {c.policy}
            </a>
          </p>
        </div>
        {rateWith > 0 && (
          <ReviewSheet
            c={c}
            stars={rateWith}
            // the first name this device booked with, if any: what a review is signed with
            name={(form.name.trim().split(/\s+/)[0] ?? "").slice(0, 60)}
            staff={catalog.staff.map((x) => ({ id: x.id, name: x.name }))}
            onSent={onReviewSent}
            onClose={closeReview}
          />
        )}
      </main>
    );
  };

  const ground = screen === "details" || screen === "done";
  const timePicked = !!slot && !!ready && localParts(slot.t, tz).date === (shownDay ?? "");
  const hasCta = !about && (screen === "barber" || (screen === "time" && timePicked));
  const hasBasket = !about && screen === "services" && services.length > 0;
  return (
    <>
      {about && aboutScreen()}
      {about && (
        <div className="cta">
          <div className="cta-in">
            <button key="go-about" type="button" className="btn btn-primary" onClick={bookFromAbout}>
              {c.book}
            </button>
          </div>
        </div>
      )}
      {/* the step under the salon's page stays as it was, out of sight */}
      <main hidden={about} className={`app${ground ? " ground" : ""}${hasCta ? " has-cta" : ""}${hasBasket ? " has-basket" : ""}`} aria-live="polite">
        {demo && screen !== "bye" && <p className="demo">{c.demo}</p>}
        {screen === "barber" && barberScreen()}
        {screen === "services" && (
          <>
            {header(() => setScreen("barber"))}
            {servicesScreen()}
          </>
        )}
        {screen === "time" && (
          <>
            {header(moving ? () => window.location.assign(moving.url.replace(/^\/(ru|et|en)\//, `/${lang}/`)) : () => setScreen("services"))}
            {timeScreen()}
          </>
        )}
        {screen === "details" && (
          <>
            {header(() => setScreen("time"))}
            {detailsScreen()}
          </>
        )}
        {screen === "done" && (
          <>
            {header()}
            {doneScreen()}
          </>
        )}
        {screen === "bye" && byeScreen()}
      </main>
      {!about && screen === "barber" && cta(c.cont, () => setScreen("services"), !barber)}
      {hasBasket && basket()}
      {!about && screen === "time" && timePicked && (moving ? cta(moveBusy ? c.movingBusy : c.moveHere, moveVisit, moveBusy) : cta(c.cont, () => setScreen("details")))}
      {sheetView()}
    </>
  );
}
