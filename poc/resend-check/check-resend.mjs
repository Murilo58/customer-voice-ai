// PoC 3 — Verificação de recursos do Resend (somente mensagens de teste, sem dados reais).
// Pré-requisitos (conta gratuita do Resend):
//   RESEND_API_KEY     chave de teste (variável de ambiente; nunca em arquivo versionado)
//   TEST_TO            seu próprio e-mail, para o teste de envio
//   RECEIVED_EMAIL_ID  (opcional) id de um e-mail recebido; sem ele, usa o mais recente da listagem
// Antes: envie, do seu e-mail pessoal, uma mensagem de teste para qualquer endereço do seu domínio
// de recebimento (ex.: r+tokenteste@<id>.resend.app) e configure um webhook email.received (opcional).
// Execução: node check-resend.mjs
import { writeFileSync } from 'node:fs';

const KEY = process.env.RESEND_API_KEY;
if (!KEY) throw new Error('Defina RESEND_API_KEY no ambiente.');
const api = async (method, path, body, extraHeaders = {}) => {
  const r = await fetch(`https://api.resend.com${path}`, {
    method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
};

const out = { executedAt: new Date().toISOString(), checks: [] };
const check = (id, name, ok, detail) => { out.checks.push({ id, name, ok, detail }); console.log(`${ok ? 'OK  ' : 'NÃO '} ${id} ${name} — ${detail}`); };

// R1 — recebimento: listar e obter o e-mail recebido
let id = process.env.RECEIVED_EMAIL_ID;
if (!id) {
  const list = await api('GET', '/emails/receiving');
  check('R1a', 'Listagem de e-mails recebidos disponível', list.status === 200, `HTTP ${list.status}`);
  id = list.json?.data?.[0]?.id;
}
if (id) {
  const got = await api('GET', `/emails/receiving/${id}`);
  const e = got.json ?? {};
  const headerKeys = Object.keys(e.headers ?? {});
  check('R1b', 'Objeto authentication (spf/dkim/dmarc) presente', !!e.authentication, JSON.stringify(e.authentication ?? null));
  check('R1c', 'Cabeçalhos retornados', headerKeys.length > 0, `chaves: ${headerKeys.join(', ').slice(0, 300)}`);
  check('R1d', 'Authentication-Results entre os cabeçalhos', headerKeys.includes('authentication-results'), 'informativo; o objeto authentication é a fonte prevista');
  check('R1e', 'Message-ID e received_for disponíveis', !!e.message_id, `message_id=${!!e.message_id}; received_for=${JSON.stringify(e.received_for ?? null)}`);
  check('R1f', 'MIME bruto disponível para download', !!e.raw?.download_url, `expires_at=${e.raw?.expires_at ?? 'n/a'}`);
  check('R1g', 'Endereço com subendereçamento recebido (r+token@...)', JSON.stringify(e.to ?? '').includes('+'), `to=${JSON.stringify(e.to ?? null)}`);
  check('R1h', 'Metadados de anexos', Array.isArray(e.attachments), `anexos=${(e.attachments ?? []).length}`);
} else {
  check('R1', 'Nenhum e-mail recebido encontrado', false, 'envie uma mensagem de teste ao domínio de recebimento e execute novamente');
}

// R2 — envio com cabeçalhos customizados e idempotency key
if (process.env.TEST_TO) {
  const idem = `poc-${Date.now()}`;
  const body = {
    from: process.env.TEST_FROM ?? 'onboarding@resend.dev',
    to: [process.env.TEST_TO],
    reply_to: process.env.TEST_REPLY_TO,
    subject: '[PoC Customer Voice AI] teste de cabeçalhos',
    text: 'Mensagem de teste da PoC. Pode ignorar.',
    headers: { 'Message-ID': `<poc-${Date.now()}@poc.invalid>`, 'In-Reply-To': '<anterior@poc.invalid>', References: '<anterior@poc.invalid>' },
  };
  const s1 = await api('POST', '/emails', body, { 'Idempotency-Key': idem });
  check('R2a', 'Envio aceito com Message-ID/In-Reply-To/References customizados', s1.status === 200, `HTTP ${s1.status} ${JSON.stringify(s1.json).slice(0, 160)}`);
  const s2 = await api('POST', '/emails', body, { 'Idempotency-Key': idem });
  check('R2b', 'Repetição com a mesma Idempotency-Key não gera novo envio', s2.status === 200 && s2.json?.id === s1.json?.id, `ids iguais=${s2.json?.id === s1.json?.id}`);
  console.log('Confira na caixa de entrada (ver original) se o Message-ID customizado foi preservado e registre o resultado.');
}

writeFileSync(`resultado-resend-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2));
