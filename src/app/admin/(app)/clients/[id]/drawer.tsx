"use client";

/**
 * One client's card (the owner, 19.11.2026; the design board «Карточка
 * клиента», docs/reference-looks.md): from 900px a 900px drawer on the
 * right, over the list, which stays in view and marks the open row; on a
 * phone the card is the page. The client's name is its title, then a row
 * of chip tabs that scrolls sideways, then the open tab.
 *
 * A tab has its own address (?tab=history), set without asking the server
 * again: everything the tabs show came with the page. The address is what
 * says which tab is open, so a card opened anew starts on its first tab
 * even when Next has kept it from the last time. A tab is drawn the first
 * time it is opened and then kept, so what was typed in one is still there
 * after a look at another.
 *
 * «Карточка клиента» and «Уведомления» save with their own «Сохранить».
 * While either has changes that are not saved, leaving the card asks
 * first: the cross, Escape, the way back on a phone, and any link of the
 * page (another client's row, the sidebar, a visit's day in the calendar);
 * closing or reloading the browser tab gets the browser's own question.
 *
 * An anonymised client's card is named «Обезличенный клиент» and keeps only
 * the tabs that show what stays: the card with his numbers, his history,
 * the statistics and the messages that went.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ClientComment, ClientFile, ClientMessage, ClientReach, ClientStats } from "@/lib/admin/client-card";
import type { CardMay } from "@/lib/admin/client-scope";
import type { ClientVisit } from "@/lib/admin/clients";
import { PrevIcon, XIcon } from "../../../icons";
import { useA } from "../../../lang";
import { isTab, TABS, type CardFields, type NotifyFields, type TabKey } from "../card-fields";
import { Ask, CardProvider, type Card } from "./parts";
import { CardTab, type CardLimits, type CardNumbers } from "./tab-card";
import { FilesTab, type FileRules } from "./tab-files";
import { HistoryTab } from "./tab-history";
import { MessagesTab, SendTab } from "./tab-messages";
import { NotifyTab } from "./tab-notify";
import { StatsTab } from "./tab-stats";

export type DrawerProps = {
  id: string;
  name: string;
  tz: string;
  /** the salon's today, YYYY-MM-DD */
  today: string;
  card: CardFields;
  /** the categories in use, to pick from */
  used: string[];
  limits: CardLimits;
  photoV: string | null;
  comments: ClientComment[];
  /** what the login may do on this card (its rights); a tab it has no right to is not drawn */
  may: CardMay;
  numbers: CardNumbers;
  history: ClientVisit[];
  /** the history is cut at this many visits; 0: it is whole */
  capped: number;
  stats: ClientStats;
  messages: ClientMessage[];
  reach: ClientReach;
  smsReady: boolean;
  notify: NotifyFields;
  files: ClientFile[];
  fileRules: FileRules;
  /** when he was anonymised, ms; null: he was not. Then the card has nothing to change and his name is the placeholder */
  anonymisedAt: number | null;
};

/** What an anonymised client's card still has: nothing to send, to switch or to keep (src/lib/admin/clients.ts, anonymiseClient). */
const ANON_TABS: readonly TabKey[] = ["card", "history", "stats", "messages"];

const LIST = "/admin/clients";

export function ClientDrawer(p: DrawerProps) {
  const A = useA();
  const K = A.clients.card;
  const router = useRouter();
  const box = useRef<HTMLElement>(null);
  // the open tab is the address's (?tab=…): go() below changes it there
  const asked = useSearchParams().get("tab");
  // the tabs this login has: history and statistics, files, a message and the notification settings each need a right
  const anonymised = p.anonymisedAt != null;
  const tabs = useMemo(
    () =>
      TABS.filter((t) => (!anonymised || ANON_TABS.includes(t)) && ((t === "history" || t === "stats") ? p.may.history : t === "files" ? p.may.files : t === "send" ? p.may.send : t === "notify" ? p.may.edit : true)),
    [p.may, anonymised],
  );
  const tab: TabKey = isTab(asked) && tabs.includes(asked) ? asked : "card";
  // the tabs drawn so far: each stays once it has been opened
  const [seen, setSeen] = useState<readonly TabKey[]>([tab]);
  if (!seen.includes(tab)) setSeen([...seen, tab]);
  // the forms with changes that are not saved, each with its way back to what is saved
  const dirty = useRef(new Map<string, () => void>());
  const [unsaved, setUnsaved] = useState(false);
  const [ask, setAsk] = useState<{ go: () => void } | null>(null);
  // the name on top follows what «Сохранить» kept, before the page is asked for again
  const [kept, setName] = useState(p.name);
  const [sent, setSent] = useState(p.name);
  if (sent !== p.name) {
    setSent(p.name);
    setName(p.name);
  }
  const name = anonymised ? A.clients.anonName : kept;

  const guard = useCallback((key: string, on: boolean, reset?: () => void) => {
    if (on) dirty.current.set(key, reset ?? (() => {}));
    else dirty.current.delete(key);
    setUnsaved(dirty.current.size > 0);
  }, []);

  /** Do it now, or ask first when something is not saved. */
  const leave = useCallback((go: () => void) => {
    if (dirty.current.size) setAsk({ go });
    else go();
  }, []);
  const toList = useCallback(() => router.push(LIST), [router]);
  const close = useCallback(() => leave(toList), [leave, toList]);
  const gone = useCallback(() => {
    dirty.current.clear();
    setUnsaved(false);
    toList();
  }, [toList]);

  const go = useCallback(
    (t: TabKey) => {
      // its own address, with no trip to the server: the tab's content is here already.
      // Next hears of it and hands the new address to useSearchParams above
      window.history.replaceState(null, "", t === "card" ? `${LIST}/${p.id}` : `${LIST}/${p.id}?tab=${t}`);
    },
    [p.id],
  );

  const card = useMemo<Card>(() => ({ id: p.id, tz: p.tz, guard, go, close, gone, may: p.may }), [p.id, p.tz, guard, go, close, gone, p.may]);

  // the keyboard starts inside the card (before the first paint, so it takes no focus from a field in use)
  useLayoutEffect(() => {
    const el = box.current;
    if (el && !el.contains(document.activeElement) && window.matchMedia("(min-width: 900px)").matches) el.focus({ preventScroll: true });
  }, []);

  // Escape closes the card, unless a question or another sheet is open over it
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".cc-ask-wrap, .adm-sheet-wrap:not(.adm-pane-wrap), .dw-wrap")) return;
      close();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [close]);

  // with changes that are not saved: every way out of the card asks first
  useEffect(() => {
    if (!unsaved) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      // a download and a new browser tab leave the card where it is
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return;
      e.preventDefault();
      e.stopPropagation();
      setAsk({ go: () => router.push(url.pathname + url.search + url.hash) });
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // before the link's own handler: the whole page listens, the card too
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [unsaved, router]);

  const leaveNow = () => {
    const next = ask?.go;
    // back as it is saved, so nothing half-typed is found here later
    for (const reset of dirty.current.values()) reset();
    dirty.current.clear();
    setUnsaved(false);
    next?.();
  };

  const panel = (key: TabKey, body: React.ReactNode) =>
    seen.includes(key) && (
      <div key={key} className="cc-panel" role="tabpanel" id={`cc-panel-${key}`} aria-labelledby={`cc-tab-${key}`} hidden={tab !== key}>
        {body}
      </div>
    );

  return (
    <CardProvider value={card}>
      <section ref={box} className="cc" role="dialog" aria-label={name} tabIndex={-1}>
        <header className="cc-head">
          <button type="button" className="cc-back" onClick={close}>
            <PrevIcon />
            {K.toList}
          </button>
          <div className="cc-title">
            <h1>{name}</h1>
            <button type="button" className="cc-x" aria-label={A.close} title={A.close} onClick={close}>
              <XIcon size={18} />
            </button>
          </div>
          <div className="cc-tabs" role="tablist" aria-label={K.tabsLabel}>
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`cc-tab-${t}`}
                className="cc-tab"
                aria-selected={tab === t}
                aria-controls={`cc-panel-${t}`}
                onClick={(e) => {
                  go(t);
                  e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                }}
              >
                {K.tabs[t]}
              </button>
            ))}
          </div>
        </header>

        {panel("card", <CardTab initial={p.card} used={p.used} limits={p.limits} photoV={p.photoV} comments={p.comments} numbers={p.numbers} today={p.today} onSaved={setName} anonymisedAt={p.anonymisedAt} />)}
        {panel("history", <HistoryTab visits={p.history} capped={p.capped} />)}
        {panel("stats", <StatsTab initial={p.stats} today={p.today} />)}
        {panel("messages", <MessagesTab messages={p.messages} />)}
        {panel("send", <SendTab reach={p.reach} smsReady={p.smsReady} adsOff={p.notify.adsOff} max={p.limits.message} />)}
        {panel("notify", <NotifyTab initial={p.notify} />)}
        {panel("files", <FilesTab files={p.files} rules={p.fileRules} />)}
      </section>
      {ask && <Ask title={K.unsavedTitle} text={K.unsaved} yes={K.leave} no={K.stay} onYes={leaveNow} onClose={() => setAsk(null)} />}
    </CardProvider>
  );
}
