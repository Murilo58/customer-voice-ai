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

/** Lista de anexos: só os liberados têm link de download (rota autenticada; CA-10.8). */
export function AttachmentList({ items, hrefBase }: { items: AttachmentItem[]; hrefBase: string }) {
  if (!items.length) return null;
  return (
    <ul className="attachments" aria-label="Anexos">
      {items.map((a) => (
        <li key={a.id}>
          {a.status === "released" ? <a href={`${hrefBase}/${a.id}`} download>{a.name}</a> : <span>{a.name}</span>}
          <span className="muted"> · {size(a.sizeBytes)}{a.status !== "released" && <> · {ATTACHMENT_STATUS_LABEL[a.status] ?? a.status}{a.reason ? ` (${attachmentReason(a.reason)})` : ""}</>}</span>
        </li>
      ))}
    </ul>
  );
}

/** Campo de upload: até 5 arquivos PNG, JPEG, WEBP, PDF, TXT ou CSV de até 4 MB (RSG-12). */
export function AttachmentInput({ id = "attachments" }: { id?: string }) {
  return (
    <p>
      <label htmlFor={id}>Anexos (opcional): até 5 arquivos PNG, JPEG, WEBP, PDF, TXT ou CSV, de até 4 MB cada</label>
      <input id={id} name="attachments" type="file" multiple accept={ATTACHMENT_ACCEPT} />
    </p>
  );
}
