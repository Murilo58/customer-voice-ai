// Política de anexos do Marco A (RSG-12, RSG-17; ADR-008 C2 e C3). Funções puras.

export type AttachmentKind = "png" | "jpeg" | "webp" | "pdf" | "txt" | "csv";

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
/** Proposta de DP-15: 5 arquivos por mensagem */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

const EXTENSIONS: Record<string, AttachmentKind> = {
  png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp", pdf: "pdf", txt: "txt", csv: "csv",
};

export const CONTENT_TYPE: Record<AttachmentKind, string> = {
  png: "image/png", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf", txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
};

/** Extensões explicitamente bloqueadas nesta etapa (registradas como "bloqueado", não só "fora da lista"). */
const BLOCKED = new Set([
  "docx", "xlsx", "odt", "ods", "odp", "pptx", "doc", "xls", "ppt", "docm", "xlsm", "pptm", "rtf",
  "zip", "rar", "7z", "gz", "tar", "tgz", "bz2", "xz", "iso", "img", "dmg", "vhd",
  "exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "js", "mjs", "jar", "sh", "py", "apk", "app", "lnk", "url", "reg", "dll",
  "html", "htm", "xhtml", "svg", "xml", "hta", "mht",
]);

export type RejectReason = "type_blocked" | "type_not_allowed" | "type_mismatch" | "too_large" | "empty" | "too_many_files";

/** Nome original sanitizado, guardado só como metadado (RSG-12). */
export function sanitizeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").normalize("NFC");
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return (clean || "arquivo").slice(0, 120);
}

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "";
}

/** Tipo real pelo conteúdo (magic bytes); texto exige UTF-8 válido e nenhum byte nulo. */
export function detectKind(buf: Uint8Array): "png" | "jpeg" | "webp" | "pdf" | "text" | null {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (b.subarray(0, 1024).toString("latin1").includes("%PDF-")) return "pdf";
  if (b.includes(0)) return null;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b);
    return "text";
  } catch {
    return null;
  }
}

/** Valida extensão, tamanho e tipo real. A extensão e o conteúdo devem coincidir e pertencer à lista. */
export function validateUpload(name: string, size: number, content: Uint8Array): { ok: true; kind: AttachmentKind } | { ok: false; reason: RejectReason } {
  const ext = extensionOf(name);
  if (BLOCKED.has(ext)) return { ok: false, reason: "type_blocked" };
  const kind = EXTENSIONS[ext];
  if (!kind) return { ok: false, reason: "type_not_allowed" };
  if (size <= 0) return { ok: false, reason: "empty" };
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: "too_large" };
  const detected = detectKind(content);
  const expected = kind === "txt" || kind === "csv" ? "text" : kind;
  if (detected !== expected) return { ok: false, reason: "type_mismatch" };
  return { ok: true, kind };
}
