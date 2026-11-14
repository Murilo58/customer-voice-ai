import "dotenv/config";

// Os testes de integração rodam só contra o banco de testes (nunca o de desenvolvimento ou produção).
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL não definida.");
process.env.DATABASE_URL = testUrl;
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0000";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.EMAIL_PROVIDER = "console";
// Testes nunca chamam a IA real, mesmo com o Gemini configurado no .env local (sem rede e sem custo).
process.env.AI_PROVIDER = "simulated";
delete process.env.GEMINI_API_KEY;
delete process.env.AI_TRIAGE_MODEL;
// DP-01: com o provedor simulado, todas as organizações de teste estão autorizadas (testes específicos restringem).
process.env.AI_SYNTHETIC_ORGS = "*";
// I-4: domínio de recebimento sintético; o provedor de recebimento, o armazenamento e o anti-bot são injetados nos testes.
process.env.INBOUND_EMAIL_DOMAIN = "in.exemplo.test";
delete process.env.RESEND_API_KEY;
