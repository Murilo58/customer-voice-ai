import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Armazenamento de anexos (ADR-008): store privado do Vercel Blob; "local" só em desenvolvimento.
// As chaves nunca vêm do cliente: são montadas no servidor a partir dos ids do registro.

export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const KEY_RE = /^(quarantine|released)\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

export function storageKey(state: "quarantine" | "released", organizationId: string, attachmentId: string): string {
  const key = `${state}/${organizationId}/${attachmentId}`;
  if (!KEY_RE.test(key)) throw new Error("Chave de armazenamento inválida.");
  return key;
}

function assertKey(key: string) {
  if (!KEY_RE.test(key)) throw new Error("Chave de armazenamento inválida.");
}

/** Sistema de arquivos local (desenvolvimento; diretório fora do Git). */
export class LocalStorage implements StorageProvider {
  constructor(private readonly root = resolve(process.cwd(), ".storage")) {}

  private path(key: string) {
    assertKey(key);
    return join(this.root, ...key.split("/"));
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data, { flag: "wx" });
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

/** Memória (testes). */
export class MemoryStorage implements StorageProvider {
  readonly objects = new Map<string, Buffer>();
  async put(key: string, data: Buffer) {
    assertKey(key);
    if (this.objects.has(key)) throw new Error("Objeto já existe.");
    this.objects.set(key, Buffer.from(data));
  }
  async get(key: string) {
    return this.objects.get(key) ?? null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

/** Store privado do Vercel Blob (BLOB_READ_WRITE_TOKEN ou OIDC só no servidor). Leitura sem cache. */
export class VercelBlobStorage implements StorageProvider {
  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    assertKey(key);
    const { put } = await import("@vercel/blob");
    await put(key, data, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
  }

  async get(key: string): Promise<Buffer | null> {
    assertKey(key);
    const { get } = await import("@vercel/blob");
    const r = await get(key, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    const { del } = await import("@vercel/blob");
    await del(key);
  }
}

let override: StorageProvider | null = null;

/** Testes injetam um provedor (MemoryStorage). */
export function setStorageForTests(p: StorageProvider | null) {
  override = p;
}

export function getStorage(): StorageProvider {
  if (override) return override;
  const provider = process.env.STORAGE_PROVIDER ?? (process.env.NODE_ENV === "production" ? "" : "local");
  if (provider === "vercel-blob") return new VercelBlobStorage();
  if (provider === "local" && process.env.NODE_ENV !== "production") return new LocalStorage();
  throw new Error("Armazenamento de anexos não configurado (STORAGE_PROVIDER).");
}
