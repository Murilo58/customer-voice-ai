import { inflateSync } from "node:zlib";
import sharp from "sharp";
import { CONTENT_TYPE, detectKind, type AttachmentKind } from "./policy";

// Sanitização (CDR) por tipo (ADR-008 seção 3; RSG-19). NÃO é antivírus: reconstrói imagens,
// normaliza texto, neutraliza fórmulas de CSV e recusa PDF com conteúdo ativo.
// Resultado "fail" leva à quarentena; exceção lançada é erro técnico (o anexo continua pendente).

export type SanitizeResult =
  | { ok: true; data: Buffer; contentType: string; sanitizer: string }
  | { ok: false; reason: string };

const MAX_LINE = 10_000;

export async function sanitizeAttachment(kind: AttachmentKind, input: Buffer): Promise<SanitizeResult> {
  // O tipo real é conferido de novo: o arquivo em quarentena pode ter sido trocado.
  const detected = detectKind(input);
  if (detected !== (kind === "txt" || kind === "csv" ? "text" : kind)) return { ok: false, reason: "type_mismatch" };
  switch (kind) {
    case "png":
    case "jpeg":
    case "webp":
      return reencodeImage(kind, input);
    case "txt":
      return textResult(normalizeText(input), "txt", "text_normalize");
    case "csv": {
      const text = normalizeText(input);
      return text === null ? { ok: false, reason: "invalid_utf8" } : { ok: true, data: Buffer.from(neutralizeCsv(text), "utf8"), contentType: CONTENT_TYPE.csv, sanitizer: "csv_neutralize" };
    }
    case "pdf":
      return checkPdf(input);
  }
}

async function reencodeImage(kind: "png" | "jpeg" | "webp", input: Buffer): Promise<SanitizeResult> {
  let pipeline;
  try {
    // Decodifica e recodifica: metadados (EXIF, XMP, ICC) e dados extras após a imagem são descartados.
    pipeline = sharp(input, { failOn: "error", limitInputPixels: 40_000_000 }).rotate();
    const data = kind === "png" ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : kind === "jpeg" ? await pipeline.jpeg({ quality: 90 }).toBuffer()
      : await pipeline.webp({ quality: 90 }).toBuffer();
    return { ok: true, data, contentType: CONTENT_TYPE[kind], sanitizer: "reencode_image" };
  } catch {
    return { ok: false, reason: "image_decode_failed" };
  }
}

/** UTF-8 válido, sem BOM e sem caracteres de controle, quebras normalizadas, linhas limitadas. */
export function normalizeText(input: Buffer): string | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    return null;
  }
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .split("\n")
    .map((line) => (line.length > MAX_LINE ? line.slice(0, MAX_LINE) : line))
    .join("\n");
}

function textResult(text: string | null, kind: "txt", sanitizer: string): SanitizeResult {
  return text === null ? { ok: false, reason: "invalid_utf8" } : { ok: true, data: Buffer.from(text, "utf8"), contentType: CONTENT_TYPE[kind], sanitizer };
}

/** Separador mais frequente fora de aspas na primeira linha (vírgula ou ponto e vírgula). */
function detectDelimiter(text: string): "," | ";" {
  let commas = 0, semis = 0, quoted = false;
  for (const ch of text) {
    if (ch === "\n" && !quoted) break;
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ",") commas++;
    else if (!quoted && ch === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

/** Analisa CSV (RFC 4180) e neutraliza células iniciadas por = + - @ (CSV injection). */
export function neutralizeCsv(text: string): string {
  const d = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === d) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  const quote = (v: string) => (v.includes(d) || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map((v) => quote(safe(v))).join(d)).join("\n") + "\n";
}

// PDF: marcadores de conteúdo ativo, arquivos embutidos, formulários XFA e criptografia (RSG-17).
const PDF_ACTIVE: [string, RegExp][] = [
  ["JavaScript", /\/JavaScript\b/], ["JS", /\/JS[\s/<(\[]/], ["OpenAction", /\/OpenAction\b/], ["AA", /\/AA[\s/<]/],
  ["Launch", /\/Launch\b/], ["EmbeddedFile", /\/EmbeddedFiles?\b/], ["RichMedia", /\/RichMedia\b/], ["XFA", /\/XFA\b/],
  ["Encrypt", /\/Encrypt\b/], ["SubmitForm", /\/SubmitForm\b/], ["ImportData", /\/ImportData\b/],
];

/** Decodifica escapes #xx em nomes (ex.: /J#61vaScript) antes de procurar os marcadores. */
function decodeNames(s: string): string {
  return s.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function activeMarker(text: string): string | null {
  const decoded = decodeNames(text);
  return PDF_ACTIVE.find(([, re]) => re.test(decoded))?.[0] ?? null;
}

export function checkPdf(input: Buffer): SanitizeResult {
  const raw = input.toString("latin1");
  if (!raw.slice(0, 1024).includes("%PDF-") || !raw.slice(-2048).includes("%%EOF")) return { ok: false, reason: "pdf_invalid" };
  const direct = activeMarker(raw);
  if (direct) return { ok: false, reason: `pdf_active:${direct}` };
  // Objetos em fluxos comprimidos (ObjStm/FlateDecode) também são inspecionados.
  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  let inspected = 0;
  while ((m = streamRe.exec(raw)) && inspected < 2000) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) return { ok: false, reason: "pdf_invalid" };
    inspected++;
    try {
      const inflated = inflateSync(input.subarray(start, end), { maxOutputLength: 32 * 1024 * 1024 }).toString("latin1");
      const hidden = activeMarker(inflated);
      if (hidden) return { ok: false, reason: `pdf_active:${hidden}` };
    } catch {
      // Fluxo não comprimido com Flate (ex.: imagem): sem objetos a inspecionar.
    }
    streamRe.lastIndex = end;
  }
  return { ok: true, data: input, contentType: CONTENT_TYPE.pdf, sanitizer: "pdf_structural" };
}
