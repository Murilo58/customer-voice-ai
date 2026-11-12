import { Icon } from "@/app/ui/icons";
import { ATTACHMENT_ACCEPT, ATTACHMENT_STATUS_LABEL, attachmentReason } from "@/lib/labels";

export interface AttachmentItem {
  id: string;
  name: string;
  status: string;
  sizeBytes: number;
  reason?: string | null;
}

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Anexos como etiquetas: só os liberados têm link de download (rota autenticada; CA-10.8). */
export function AttachmentList({ items, hrefBase }: { items: AttachmentItem[]; hrefBase: string }) {
  if (!items.length) return null;
  return (
    <ul className="attachments" aria-label="Anexos">
      {items.map((a) => {
        const released = a.status === "released";
        const body = (
          <>
            <Icon name="paperclip" />
            <span className="att-name">{a.name}</span>
            <span className="att-meta">{size(a.sizeBytes)}</span>
          </>
        );
        return (
          <li key={a.id} className={`att${released ? "" : " att-blocked"}`}>
            {released
              ? <a href={`${hrefBase}/${a.id}`} download><span className="sr-only">Baixar </span>{body}</a>
              : <span>{body}<span className="att-status">{ATTACHMENT_STATUS_LABEL[a.status] ?? a.status}{a.reason ? ` (${attachmentReason(a.reason)})` : ""}</span></span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Campo de upload: até 5 arquivos PNG, JPEG, WEBP, PDF, TXT ou CSV de até 4 MB (RSG-12). */
export function AttachmentInput({ id = "attachments" }: { id?: string }) {
  return (
    <div className="att-input">
      <label htmlFor={id}><Icon name="paperclip" />Anexos (opcional)</label>
      <input id={id} name="attachments" type="file" multiple accept={ATTACHMENT_ACCEPT} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className="field-hint">Até 5 arquivos PNG, JPEG, WEBP, PDF, TXT ou CSV, de até 4 MB cada.</p>
    </div>
  );
}
