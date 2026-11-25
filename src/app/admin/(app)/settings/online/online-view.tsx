"use client";

/**
 * «Онлайн-запись»: how clients book online, in three cards as the admin we
 * follow lays them out (docs/altegio-pages.md, Part 4 C): the time a client
 * is offered («Шаг», «Время до начала визита», how far ahead), until when a
 * client moves or cancels online, and whether «Любой специалист» is offered.
 * Everything saves by itself (autosave.tsx), as «Бренд» and «Контакты».
 *
 * The slot type is a line, not a choice: it stays «Оптимальный»
 * (src/lib/slots.ts). Every select offers only what the server saves
 * (online-form.ts), plus a value saved before that is not among them, so
 * opening the page changes nothing.
 */
import { useState } from "react";
import { CUTOFF_OPTIONS, HORIZON_OPTIONS, NOTICE_OPTIONS, STEP_OPTIONS, withValue, type OnlineSettings } from "@/lib/admin/online-form";
import { useA } from "../../../lang";
import { useAutoSave } from "../../autosave";
import { LocField, LocHead, LocSaveBar } from "../parts";
import { saveOnlineAction } from "./actions";

type NumKey = "slot_step_min" | "min_notice_min" | "horizon_days" | "cancel_cutoff_min";

export function OnlineView({ initial, view, link, test }: { initial: OnlineSettings; view: string; link: string; test: boolean }) {
  const A = useA();
  const O = A.online;
  const [d, setD] = useState<OnlineSettings>(initial);
  const auto = useAutoSave<OnlineSettings>(d, setD, (v) => saveOnlineAction(v), { label: A.nav.online });
  const pick = (key: NumKey, id: string, options: readonly number[], text: (n: number) => string) => (
    <select id={id} aria-describedby={`${id}-hint`} value={d[key]} onChange={(e) => setD({ ...d, [key]: Number(e.target.value) })}>
      {withValue(options, d[key]).map((n) => (
        <option key={n} value={n}>
          {text(n)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="loc">
      <LocHead page="online" view={view} viewText={O.view} viewHint={O.viewHint} />
      <LinkCard link={link} test={test} />
      <form
        className="loc-form"
        onBlur={auto.flush}
        onSubmit={(e) => {
          e.preventDefault();
          auto.flush();
        }}
      >
        <section className="adm-card loc-card" aria-labelledby="onl-slots-h">
          <h2 className="loc-h" id="onl-slots-h">
            {O.slots}
          </h2>
          {/* Altegio offers a choice of slot types; we keep its «Оптимальный», so it is said, not asked */}
          <div className="adm-field">
            <span>{O.slotType}</span>
            <small className="adm-meta">{O.slotTypeHint}</small>
          </div>
          <LocField id="onl-step" label={O.step} hint={O.stepHint}>
            {pick("slot_step_min", "onl-step", STEP_OPTIONS, O.mins)}
          </LocField>
          <LocField id="onl-notice" label={O.notice} hint={O.noticeHint}>
            {pick("min_notice_min", "onl-notice", NOTICE_OPTIONS, (n) => (n === 0 ? O.noticeNone : O.mins(n)))}
          </LocField>
          <LocField id="onl-horizon" label={O.horizon} hint={O.horizonHint}>
            {pick("horizon_days", "onl-horizon", HORIZON_OPTIONS, O.days)}
          </LocField>
        </section>
        <section className="adm-card loc-card" aria-labelledby="onl-records-h">
          <h2 className="loc-h" id="onl-records-h">
            {O.records}
          </h2>
          <LocField id="onl-cutoff" label={O.cutoff} hint={O.cutoffHint}>
            {pick("cancel_cutoff_min", "onl-cutoff", CUTOFF_OPTIONS, (n) => (n === 0 ? O.cutoffNone : O.cutoffAt(n / 60)))}
          </LocField>
        </section>
        <section className="adm-card loc-card" aria-labelledby="onl-master-h">
          <h2 className="loc-h" id="onl-master-h">
            {O.master}
          </h2>
          <div>
            <label className="adm-toggle">
              <span>{O.any}</span>
              <input type="checkbox" role="switch" className="adm-sw" aria-describedby="onl-any-hint" checked={d.any_staff_on} onChange={(e) => setD({ ...d, any_staff_on: e.target.checked })} />
            </label>
            <small className="adm-meta" id="onl-any-hint">
              {d.any_staff_on ? O.anyOn : O.anyOff}
            </small>
          </div>
        </section>
      </form>
      <LocSaveBar auto={auto} />
    </div>
  );
}

/**
 * The link clients book by, as the first card of the admin we follow
 * («Ссылки на онлайн-запись»: the address in a chip, copy), and the QR
 * plaque for the reception (Renat, 18.11), opened in a tab of its own to
 * print. Outside the form: nothing here is saved.
 */
function LinkCard({ link, test }: { link: string; test: boolean }) {
  const O = useA().online;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // no clipboard (an old browser, an insecure page): select the address, so a long press copies it
      const chip = document.getElementById("onl-link");
      if (chip) getSelection()?.selectAllChildren(chip);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <section className="adm-card loc-card onl-link" aria-labelledby="onl-link-h">
      <h2 className="loc-h" id="onl-link-h">
        {O.link}
      </h2>
      <div className="onl-link-row">
        <code className="onl-link-chip" id="onl-link">
          {link}
        </code>
        <button type="button" className="adm-btn adm-btn-line adm-btn-sm" onClick={copy} aria-live="polite">
          {copied ? O.copied : O.copy}
        </button>
      </div>
      <small className="adm-meta">{O.linkHint}</small>
      <div className="onl-plaque">
        <a className="adm-btn adm-btn-line" href="/admin/plaque" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
          </svg>
          {O.plaque}
        </a>
        <small className="adm-meta">{test ? O.plaqueTest : O.plaqueHint}</small>
      </div>
    </section>
  );
}
