// Chave de leitura do recebimento separada da chave de envio (envio pode ser "Sending access" no Resend).
import { afterEach, describe, expect, it } from "vitest";
import { inboundApiKey } from "@/server/email/inbound/provider";

const saved = { send: process.env.RESEND_API_KEY, read: process.env.RESEND_INBOUND_API_KEY };
afterEach(() => {
  for (const [k, v] of [["RESEND_API_KEY", saved.send], ["RESEND_INBOUND_API_KEY", saved.read]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe("inboundApiKey", () => {
  it("prefere RESEND_INBOUND_API_KEY", () => {
    process.env.RESEND_API_KEY = "re_envio";
    process.env.RESEND_INBOUND_API_KEY = "re_leitura";
    expect(inboundApiKey()).toBe("re_leitura");
  });
  it("sem a chave de leitura, usa RESEND_API_KEY (configuração anterior)", () => {
    process.env.RESEND_API_KEY = "re_envio";
    delete process.env.RESEND_INBOUND_API_KEY;
    expect(inboundApiKey()).toBe("re_envio");
  });
  it("sem nenhuma chave, recebimento não configurado", () => {
    delete process.env.RESEND_API_KEY;
    process.env.RESEND_INBOUND_API_KEY = "";
    expect(inboundApiKey()).toBeUndefined();
  });
});
