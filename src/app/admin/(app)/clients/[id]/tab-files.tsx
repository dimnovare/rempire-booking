"use client";

/**
 * «Файлы»: a client's papers (client_files, 018). The note on top says what
 * can be uploaded; «Загрузить файлы» picks one or several; under it the
 * list, newest first: each file with its size, when and by whom, a link
 * that downloads it and a cross that deletes it (after a question).
 *
 * A file is sent one request each to /admin/clients/<id>/files, which
 * checks it again whatever is said here; a file that cannot be kept is
 * named with the reason, and the others still go. Nothing here is public:
 * the download route wants a login too.
 */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ClientFile } from "@/lib/admin/client-card";
import { XIcon } from "../../../icons";
import { useA } from "../../../lang";
import { deleteFileAction } from "../actions";
import { Ask, Empty, useCard, useFmt } from "./parts";

/** The library's rules (src/lib/admin/client-card.ts), handed down by the page. */
export type FileRules = { exts: string[]; maxBytes: number; max: number };

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 3.5h7l4 4v13h-11z" />
      <path d="M13.5 3.5v4h4" />
    </svg>
  );
}

export function FilesTab({ files, rules }: { files: ClientFile[]; rules: FileRules }) {
  const A = useA();
  const K = A.clients.card;
  const card = useCard();
  const fmt = useFmt(card.tz);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string[]>([]);
  const [asking, setAsking] = useState<ClientFile | null>(null);
  const mb = Math.round(rules.maxBytes / 1024 / 1024);
  const full = files.length >= rules.max;

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!picked.length) return;
    setBusy(true);
    const problems: string[] = [];
    let room = rules.max - files.length;
    for (const file of picked) {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase() : "";
      // said here first, so 5 MB too many are not sent to be refused
      let code = !rules.exts.includes(ext) ? "type" : file.size > rules.maxBytes ? "size" : file.size === 0 ? "empty" : room <= 0 ? "full" : "";
      if (!code) {
        try {
          const body = new FormData();
          body.set("file", file);
          const res = await fetch(`/admin/clients/${card.id}/files`, { method: "POST", body });
          const r = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
          // a platform's own «too large» has no body of ours
          if (r?.ok) room--;
          else code = res.status === 413 ? "size" : (r?.code ?? "failed");
        } catch {
          code = "failed";
        }
      }
      if (code) problems.push(K.fileNot(file.name, K.fileBad[code] ?? K.fileBad.failed));
    }
    setBad(problems);
    setBusy(false);
    router.refresh();
  };

  return (
    <div className="cc-scroll">
      <p className="cc-note">{K.filesNote(rules.exts.join(", "), mb, rules.max)}</p>
      {card.may.upload && (
        <div className="cc-bar">
          <input ref={input} type="file" multiple hidden accept={rules.exts.map((x) => `.${x}`).join(",")} onChange={upload} />
          <button type="button" className="cc-btn cc-btn-main" disabled={busy || full} onClick={() => input.current?.click()}>
            {busy ? K.uploading : K.upload}
          </button>
        </div>
      )}
      {bad.length > 0 && (
        <ul className="cc-file-bad" role="alert">
          {bad.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {files.length === 0 ? (
        <Empty text={K.filesNone}>
          <FileIcon />
        </Empty>
      ) : (
        <ul className="cc-files">
          {files.map((f) => (
            <li key={f.id}>
              <span className="txt">
                <b>{f.name}</b>
                <small>{[K.bytes(f.size), fmt.moment(f.at), f.by].filter(Boolean).join(" · ")}</small>
              </span>
              <a className="cc-btn" href={`/admin/clients/${card.id}/files/${f.id}`} download={f.name}>
                {K.download}
              </a>
              {card.may.fileDelete && (
                <button type="button" className="cc-btn cc-btn-ico" aria-label={K.fileDelete(f.name)} title={K.fileDelete(f.name)} onClick={() => setAsking(f)}>
                  <XIcon size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {asking && (
        <Ask
          title={K.fileDelete(asking.name)}
          text={K.fileAsk(asking.name)}
          yes={A.remove}
          onYes={async () => ((await deleteFileAction(card.id, asking.id)) ? null : A.error)}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  );
}
