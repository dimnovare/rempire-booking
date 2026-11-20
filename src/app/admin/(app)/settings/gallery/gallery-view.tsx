"use client";

/**
 * «Галерея»: up to eight photos on the salon's page, in order. A photo is
 * dropped on the zone or picked, made small in the browser (photo-shrink.ts)
 * and sent at once; moving one earlier or later and deleting one are saved
 * at once too. So there is no «Сохранить»: nothing waits on this page.
 *
 * The list on the page always comes back from the server after each change,
 * so two tabs never leave it different from what clients see.
 */
import { useRef, useState } from "react";
import { MAX_PHOTOS } from "@/lib/admin/location-form";
import { useA } from "../../../lang";
import { BinIcon, NextIcon, PlusIcon, PrevIcon } from "../../../icons";
import { shrinkPhoto } from "../../photo-shrink";
import { addPhotoAction, orderPhotosAction, removePhotoAction } from "../actions";
import { LocHead } from "../parts";

type Note = { ok: boolean; text: string };

export function GalleryView({ initial, view }: { initial: string[]; view: string }) {
  const A = useA();
  const G = A.loc.gallery;
  const [photos, setPhotos] = useState(initial);
  const [left, setLeft] = useState(0); // photos still on their way
  const [note, setNote] = useState<Note | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const busy = useRef(false);
  const full = photos.length >= MAX_PHOTOS;
  const failed = (field?: string) => (field === "forbidden" ? A.visit.invalid(field) : field === "full" ? G.full(MAX_PHOTOS) : null);

  const add = async (files: File[]) => {
    if (busy.current || !files.length) return;
    busy.current = true;
    setNote(null);
    setAsk(null);
    const room = Math.max(0, MAX_PHOTOS - photos.length);
    const list = files.slice(0, room);
    let last: Note | null = files.length > room ? { ok: false, text: G.full(MAX_PHOTOS) } : null;
    let added = 0;
    for (const [i, file] of list.entries()) {
      setLeft(list.length - i);
      try {
        const form = new FormData();
        form.set("image", await shrinkPhoto(file, "#fff", { w: 1000, h: 1000 }), "photo.jpg");
        const r = await addPhotoAction(form);
        if (r.ok) {
          setPhotos(r.photos);
          added++;
          continue;
        }
        last = { ok: false, text: failed(r.field) ?? G.bad };
        if (r.field === "full" || r.field === "forbidden") break;
      } catch {
        last = { ok: false, text: G.bad };
      }
    }
    setLeft(0);
    setNote(last ?? (added ? { ok: true, text: G.added } : null));
    busy.current = false;
  };

  const move = async (i: number, by: -1 | 1) => {
    const j = i + by;
    if (busy.current || j < 0 || j >= photos.length) return;
    busy.current = true;
    const before = photos;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    setPhotos(next);
    setNote(null);
    try {
      const r = await orderPhotosAction(next);
      if (r.ok) {
        setPhotos(r.photos);
        setNote({ ok: true, text: G.moved });
      } else {
        setPhotos(before);
        setNote({ ok: false, text: failed(r.field) ?? A.error });
      }
    } catch {
      setPhotos(before);
      setNote({ ok: false, text: A.error });
    }
    busy.current = false;
  };

  const remove = async (url: string) => {
    if (busy.current) return;
    busy.current = true;
    setNote(null);
    try {
      const r = await removePhotoAction(url);
      if (r.ok) {
        setPhotos(r.photos);
        setNote({ ok: true, text: G.removed });
      } else setNote({ ok: false, text: failed(r.field) ?? A.error });
    } catch {
      setNote({ ok: false, text: A.error });
    }
    setAsk(null);
    busy.current = false;
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = ""; // so the same file can be picked again
    void add(files);
  };

  return (
    <div className="loc">
      <LocHead page="gallery" view={view} />
      <section className="adm-card loc-card" aria-labelledby="loc-gal-h">
        <div className="loc-gal-head">
          <h2 className="loc-h" id="loc-gal-h">
            {A.nav.gallery}
          </h2>
          <span className="adm-meta">{G.count(photos.length, MAX_PHOTOS)}</span>
        </div>
        <p className="adm-meta">{G.lead(MAX_PHOTOS)}</p>
        {full ? (
          <p className="adm-note">{G.full(MAX_PHOTOS)}</p>
        ) : (
          <label
            className={`loc-drop${over ? " is-over" : ""}${left ? " is-busy" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void add([...e.dataTransfer.files].filter((f) => !f.type || f.type.startsWith("image/")));
            }}
          >
            <input type="file" accept="image/*" multiple className="sr" disabled={left > 0} onChange={pick} />
            {left ? (
              <span role="status">{G.busy(left)}</span>
            ) : (
              <>
                <span className="only-wide">{G.drop}</span>
                <span className="only-wide adm-meta">{G.or}</span>
                <span className="adm-btn adm-btn-line adm-btn-sm">
                  <PlusIcon />
                  {G.pick}
                </span>
              </>
            )}
          </label>
        )}
        {note && (
          <p className={note.ok ? "adm-ok" : "adm-err"} role={note.ok ? "status" : "alert"}>
            {note.text}
          </p>
        )}
        {photos.length ? (
          <ol className="loc-photos">
            {photos.map((url, i) => (
              <li key={url} className={ask === url ? "is-asked" : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={G.photo(i + 1)} loading="lazy" />
                <span className="loc-photo-no" aria-hidden="true">
                  {i + 1}
                </span>
                {ask === url ? (
                  <div className="loc-photo-ask" role="group" aria-label={G.ask}>
                    <p>{G.ask}</p>
                    <div className="loc-photo-btns">
                      <button type="button" className="adm-btn adm-btn-sm adm-btn-warnfill" onClick={() => void remove(url)}>
                        {G.yes}
                      </button>
                      <button type="button" className="adm-btn adm-btn-sm adm-btn-line" onClick={() => setAsk(null)}>
                        {A.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="loc-photo-bar">
                    <button type="button" className="adm-ibtn" aria-label={G.earlier(i + 1)} title={G.earlier(i + 1)} disabled={i === 0} onClick={() => void move(i, -1)}>
                      <PrevIcon />
                    </button>
                    <button type="button" className="adm-ibtn" aria-label={G.later(i + 1)} title={G.later(i + 1)} disabled={i === photos.length - 1} onClick={() => void move(i, 1)}>
                      <NextIcon />
                    </button>
                    <button type="button" className="adm-ibtn loc-photo-bin" aria-label={G.remove(i + 1)} title={G.remove(i + 1)} onClick={() => setAsk(url)}>
                      <BinIcon />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="adm-meta">{G.none}</p>
        )}
      </section>
    </div>
  );
}
