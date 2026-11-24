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

export function OnlineView({ initial, view }: { initial: OnlineSettings; view: string }) {
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
