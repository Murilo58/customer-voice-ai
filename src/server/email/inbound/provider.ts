import type { InboundAttachmentMeta, InboundEmail } from "./parse";

// Provedor de recebimento (ADR-007). Resend: o webhook traz só metadados; o conteúdo vem pela API
// (GET /emails/receiving/{id}), validado na PoC 3. Testes injetam um provedor em memória.

export interface InboundProvider {
  get(providerId: string): Promise<InboundEmail | null>;
  /** Ids recebidos mais recentes (reconciliação de webhooks perdidos) */
  listRecent(limit: number): Promise<string[]>;
  attachment(providerId: string, meta: InboundAttachmentMeta): Promise<Buffer>;
}

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : []);

export class ResendInboundProvider implements InboundProvider {
  constructor(private readonly apiKey: string) {}

  private async api(path: string): Promise<Json | null> {
    const r = await fetch(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${this.apiKey}` }, signal: AbortSignal.timeout(15_000) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`resend_${r.status}`);
    return (await r.json()) as Json;
  }

  async get(providerId: string): Promise<InboundEmail | null> {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(providerId)) return null;
    const e = await this.api(`/emails/receiving/${providerId}`);
    if (!e) return null;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((e.headers as Json) ?? {})) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
    const auth = (e.authentication as Json | undefined) ?? null;
    return {
      providerId,
      messageId: str(e.message_id),
      from: str(e.from) ?? "",
      to: strs(e.to),
      receivedFor: strs(e.received_for),
      cc: strs(e.cc),
      subject: str(e.subject) ?? "",
      text: str(e.text),
      html: str(e.html),
      headers,
      auth: auth ? { spf: str(auth.spf), dkim: str(auth.dkim), dmarc: str(auth.dmarc) } : null,
      attachments: (Array.isArray(e.attachments) ? (e.attachments as Json[]) : []).map((a) => ({
        id: str(a.id) ?? "",
        filename: str(a.filename) ?? "arquivo",
        contentType: str(a.content_type) ?? "application/octet-stream",
        size: typeof a.size === "number" ? a.size : 0,
        downloadUrl: str(a.download_url),
      })),
    };
  }

  async listRecent(limit: number): Promise<string[]> {
    const l = await this.api(`/emails/receiving?limit=${Math.min(Math.max(limit, 1), 100)}`);
    return (Array.isArray(l?.data) ? (l!.data as Json[]) : []).map((x) => str(x.id)).filter((x): x is string => !!x);
  }

  async attachment(providerId: string, meta: InboundAttachmentMeta): Promise<Buffer> {
    // A estrutura de anexos não foi verificada com um anexo real na PoC 3: aceita download_url direto
    // ou consulta o recurso do anexo para obtê-lo.
    let url = meta.downloadUrl ?? null;
    if (!url) {
      const a = await this.api(`/emails/receiving/${providerId}/attachments/${encodeURIComponent(meta.id)}`);
      url = str(a?.download_url);
    }
    if (!url || !/^https:\/\//.test(url)) throw new Error("attachment_url_missing");
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`attachment_${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) throw new Error("attachment_too_large");
    return buf;
  }
}

let override: InboundProvider | null = null;

export function setInboundProviderForTests(p: InboundProvider | null) {
  override = p;
}

export function getInboundProvider(): InboundProvider {
  if (override) return override;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Recebimento de e-mail não configurado (RESEND_API_KEY).");
  return new ResendInboundProvider(key);
}
