import { messageFor } from "@/lib/messages";

export function ErrorAlert({ code }: { code?: string }) {
  const msg = messageFor(code);
  return msg ? <p className="alert" role="alert">{msg}</p> : null;
}

export function Success({ show, children }: { show: boolean; children: React.ReactNode }) {
  return show ? <p className="alert success" role="status">{children}</p> : null;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}
