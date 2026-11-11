import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { DomainError, ForbiddenError } from "@/server/errors";

/** Converte erros conhecidos em código para a URL; erros inesperados viram "unexpected" (sem detalhes ao usuário). */
export function errorCode(e: unknown): string {
  if (e instanceof DomainError) return e.code;
  if (e instanceof ForbiddenError) return "forbidden";
  console.error("[action] erro inesperado", e);
  return "unexpected";
}

export function backWithError(path: string, e: unknown): never {
  if (isRedirectError(e)) throw e;
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}erro=${encodeURIComponent(errorCode(e))}`);
}

export function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}
