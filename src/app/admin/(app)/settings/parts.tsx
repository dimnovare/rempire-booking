"use client";

/**
 * What the three pages of «Настройки → Локация» share: the head (the
 * page's title with its star, the breadcrumb «Настройки» from 900px, and a
 * way to the salon's page as clients see it), the RU / ET / EN tabs of a
 * text kept in three languages, and the line that says what happened to the
 * last change (autosave.tsx): on a phone a bar that stays in view at the
 * bottom, from 900px a line under the title (admin.css, .loc-bar).
 */
import type { Text3 } from "@/lib/admin/location-form";
import { useA } from "../../lang";
import { SaveState, type AutoSave } from "../autosave";
import { Titled } from "../star";

export type LocPage = "brand" | "contacts" | "gallery";

export function LocHead({ page, view }: { page: LocPage; view: string }) {
  const A = useA();
  return (
    <div className="adm-page-head loc-top">
      <div className="cb-titles">
        <Titled page={page}>
          <h1 className="adm-h1">{A.nav[page]}</h1>
        </Titled>
        <p className="cb-crumb only-wide">{A.loc.crumb}</p>
      </div>
      {/* the booking site in the admin's language: what a client sees once a change is saved */}
      <a className="adm-btn adm-btn-line adm-btn-sm loc-view" href={view} target="_blank" rel="noreferrer" title={A.loc.viewHint}>
        {A.loc.view}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
        </svg>
      </a>
    </div>
  );
}

const LANGS = ["ru", "et", "en"] as const;
export type Lang3 = (typeof LANGS)[number];

/**
 * RU · ET · EN over one field: the open one has the yellow line, as the
 * tool's tabs; a language with nothing typed yet is grey.
 */
export function LangTabs({ value, onChange, filled, label, controls }: { value: Lang3; onChange: (l: Lang3) => void; filled: Text3; label: string; controls: string }) {
  return (
    <div className="loc-tabs" role="tablist" aria-label={label}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="tab"
          id={`${controls}-${l}`}
          aria-selected={value === l}
          aria-controls={controls}
          className={filled[l].trim() ? undefined : "is-empty"}
          onClick={() => onChange(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/**
 * A field with its words above and its hint below. The hint is the field's
 * description, not part of its name, so a screen reader says the name
 * first and short: the input gets `id` and aria-describedby `${id}-hint`.
 */
export function LocField({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="adm-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && (
        <small className="adm-meta" id={`${id}-hint`}>
          {hint}
        </small>
      )}
    </div>
  );
}

/** The last change's line: a phone's bar at the bottom, in view while the cards scroll; under the title from 900px. */
export function LocSaveBar({ auto }: { auto: AutoSave }) {
  return (
    <div className="loc-bar">
      <SaveState auto={auto} />
    </div>
  );
}
