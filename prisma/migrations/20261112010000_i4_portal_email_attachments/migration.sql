-- CreateEnum
CREATE TYPE "attachment_status" AS ENUM ('pending', 'released', 'quarantined', 'rejected', 'deleted');

-- CreateEnum
CREATE TYPE "inbound_classification" AS ENUM ('new_ticket', 'associated', 'automated', 'quarantined', 'duplicate', 'rejected');

-- CreateEnum
CREATE TYPE "quarantine_status" AS ENUM ('pending', 'associated', 'new_ticket', 'discarded');


-- AlterTable
ALTER TABLE "outbound_emails" ADD COLUMN     "portal_token_id" UUID;

-- AlterTable
ALTER TABLE "ticket_messages" ADD COLUMN     "author_contact_id" UUID,
ADD COLUMN     "body_html_sanitized" TEXT,
ADD COLUMN     "inbound_message_id" UUID,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'app',
ADD COLUMN     "unverified_sender" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "parent_ticket_id" UUID,
ADD COLUMN     "reply_token_hash" TEXT;

-- CreateTable
CREATE TABLE "attachments" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "message_id" UUID,
    "storage_key" TEXT,
    "original_name_sanitized" TEXT NOT NULL,
    "declared_type" TEXT NOT NULL,
    "detected_type" TEXT,
    "size_bytes" INTEGER NOT NULL,
    "status" "attachment_status" NOT NULL DEFAULT 'pending',
    "sanitizer" TEXT,
    "sanitize_reason" TEXT,
    "scan_status" TEXT NOT NULL DEFAULT 'not_scanned',
    "sha256" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csat_responses" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "resolution_seq" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "csat_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_messages" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "provider_email_id" TEXT NOT NULL,
    "message_id" TEXT,
    "from_address" TEXT NOT NULL,
    "from_name" TEXT,
    "to_addresses" TEXT[],
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "body_html_sanitized" TEXT,
    "auth_spf" TEXT,
    "auth_dkim" TEXT,
    "auth_dmarc" TEXT,
    "classification" "inbound_classification" NOT NULL,
    "reason" TEXT,
    "ticket_id" UUID,
    "possible_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "content_hash" TEXT NOT NULL,
    "attachments_meta" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quarantine_items" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "inbound_message_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "quarantine_status" NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "justification" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quarantine_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "outbound_email_id" UUID NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_access_tokens" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_sessions" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "session_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateTable
CREATE TABLE "inbound_receipts" (
    "id" UUID NOT NULL,
    "provider_email_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "organization_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "inbound_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- CreateIndex
CREATE INDEX "attachments_organization_id_ticket_id_idx" ON "attachments"("organization_id", "ticket_id");

-- CreateIndex
CREATE INDEX "attachments_status_created_at_idx" ON "attachments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_organization_id_id_key" ON "attachments"("organization_id", "id");

-- CreateIndex
CREATE INDEX "csat_responses_organization_id_created_at_idx" ON "csat_responses"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "csat_responses_organization_id_id_key" ON "csat_responses"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "csat_responses_organization_id_ticket_id_resolution_seq_key" ON "csat_responses"("organization_id", "ticket_id", "resolution_seq");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_messages_provider_email_id_key" ON "inbound_messages"("provider_email_id");

-- CreateIndex
CREATE INDEX "inbound_messages_organization_id_message_id_idx" ON "inbound_messages"("organization_id", "message_id");

-- CreateIndex
CREATE INDEX "inbound_messages_organization_id_from_address_created_at_idx" ON "inbound_messages"("organization_id", "from_address", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_messages_organization_id_id_key" ON "inbound_messages"("organization_id", "id");

-- CreateIndex
CREATE INDEX "quarantine_items_organization_id_status_created_at_idx" ON "quarantine_items"("organization_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "quarantine_items_organization_id_id_key" ON "quarantine_items"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quarantine_items_organization_id_inbound_message_id_key" ON "quarantine_items"("organization_id", "inbound_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_events_provider_event_id_key" ON "email_events"("provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_events_organization_id_id_key" ON "email_events"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_access_tokens_token_hash_key" ON "portal_access_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "portal_access_tokens_organization_id_id_key" ON "portal_access_tokens"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_sessions_session_hash_key" ON "portal_sessions"("session_hash");

-- CreateIndex
CREATE UNIQUE INDEX "portal_sessions_organization_id_id_key" ON "portal_sessions"("organization_id", "id");

-- CreateIndex
CREATE INDEX "rate_limit_counters_window_start_idx" ON "rate_limit_counters"("window_start");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_receipts_provider_email_id_key" ON "inbound_receipts"("provider_email_id");

-- CreateIndex
CREATE INDEX "inbound_receipts_status_created_at_idx" ON "inbound_receipts"("status", "created_at");

-- CreateIndex
CREATE INDEX "contacts_organization_id_email_idx" ON "contacts"("organization_id", "email");

-- CreateIndex
CREATE INDEX "outbound_emails_provider_email_id_idx" ON "outbound_emails"("provider_email_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_reply_token_hash_key" ON "tickets"("reply_token_hash");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_parent_ticket_id_fkey" FOREIGN KEY ("organization_id", "parent_ticket_id") REFERENCES "tickets"("organization_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_organization_id_author_contact_id_fkey" FOREIGN KEY ("organization_id", "author_contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_ticket_id_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "tickets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_message_id_fkey" FOREIGN KEY ("organization_id", "message_id") REFERENCES "ticket_messages"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_organization_id_ticket_id_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "tickets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_organization_id_ticket_id_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "tickets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarantine_items" ADD CONSTRAINT "quarantine_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarantine_items" ADD CONSTRAINT "quarantine_items_organization_id_inbound_message_id_fkey" FOREIGN KEY ("organization_id", "inbound_message_id") REFERENCES "inbound_messages"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_organization_id_outbound_email_id_fkey" FOREIGN KEY ("organization_id", "outbound_email_id") REFERENCES "outbound_emails"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_tokens" ADD CONSTRAINT "portal_access_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_tokens" ADD CONSTRAINT "portal_access_tokens_organization_id_contact_id_fkey" FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_organization_id_contact_id_fkey" FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- =====================================================================
-- Segurança do I-4 (ADR-002, ADR-007, ADR-008, ADR-009; DATA_MODEL 3.5 e 3.7)
-- =====================================================================
-- Restrições de domínio
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_source" CHECK (source IN ('app', 'portal', 'email'));
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_single_author" CHECK (author_membership_id IS NULL OR author_contact_id IS NULL);
-- Mensagem do cliente sempre tem o contato como autor (a associada pela quarentena é interna, RN-17)
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_customer_author" CHECK (kind <> 'customer_message' OR author_contact_id IS NOT NULL) NOT VALID;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_size" CHECK (size_bytes >= 0 AND size_bytes <= 4194304);
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by" CHECK (uploaded_by IN ('contact', 'user', 'email'));
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_storage" CHECK (status IN ('rejected', 'deleted') OR storage_key IS NOT NULL);
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_score" CHECK (score BETWEEN 1 AND 5);
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_comment_length" CHECK (comment IS NULL OR char_length(comment) <= 1000);
ALTER TABLE "quarantine_items" ADD CONSTRAINT "quarantine_justification" CHECK (status = 'pending' OR (justification IS NOT NULL AND decided_by IS NOT NULL));
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_from_lower" CHECK (from_address = lower(from_address));
ALTER TABLE "inbound_receipts" ADD CONSTRAINT "inbound_receipts_status" CHECK (status IN ('pending', 'processed', 'discarded'));
ALTER TABLE "rate_limit_counters" ADD CONSTRAINT "rate_limit_key_hash" CHECK (key ~ '^[a-z_]+:[0-9a-f]{64}$');

-- Chave estrangeira composta do autor contato (o Prisma gera a FK; reforço de isolamento pela FK composta)
CREATE INDEX "ticket_messages_inbound" ON "ticket_messages" ("organization_id", "inbound_message_id") WHERE inbound_message_id IS NOT NULL;
CREATE INDEX "contacts_email_lower" ON "contacts" ("organization_id", lower(email));

-- Pré-contextos públicos (somente leitura, definidos apenas em src/server/db/tenant.ts):
--  app.public_slug: portal e endereço de entrada {slug}@ resolvem a organização ativa pelo slug;
--  app.reply_token_hash: o token r+{token}@ resolve o chamado e a organização (RN-15a).
CREATE FUNCTION app_public_slug() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.public_slug', true), '') $$;
CREATE FUNCTION app_reply_token_hash() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.reply_token_hash', true), '') $$;
GRANT EXECUTE ON FUNCTION app_public_slug(), app_reply_token_hash() TO app_runtime;

CREATE POLICY public_slug_read ON "organizations" FOR SELECT USING (slug = app_public_slug() AND status = 'active');
CREATE POLICY reply_token_read ON "tickets" FOR SELECT USING (reply_token_hash IS NOT NULL AND reply_token_hash = app_reply_token_hash());

-- RLS nas tabelas de tenant do I-4
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;          ALTER TABLE "attachments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "csat_responses" ENABLE ROW LEVEL SECURITY;       ALTER TABLE "csat_responses" FORCE ROW LEVEL SECURITY;
ALTER TABLE "inbound_messages" ENABLE ROW LEVEL SECURITY;     ALTER TABLE "inbound_messages" FORCE ROW LEVEL SECURITY;
ALTER TABLE "quarantine_items" ENABLE ROW LEVEL SECURITY;     ALTER TABLE "quarantine_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "email_events" ENABLE ROW LEVEL SECURITY;         ALTER TABLE "email_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "portal_access_tokens" ENABLE ROW LEVEL SECURITY; ALTER TABLE "portal_access_tokens" FORCE ROW LEVEL SECURITY;
ALTER TABLE "portal_sessions" ENABLE ROW LEVEL SECURITY;      ALTER TABLE "portal_sessions" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "attachments" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "csat_responses" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "inbound_messages" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "quarantine_items" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "email_events" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "portal_access_tokens" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "portal_sessions" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

-- CSAT e eventos de entrega são somente inserção
CREATE FUNCTION i4_insert_only() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION '% é somente inserção', TG_TABLE_NAME; END $$;
CREATE TRIGGER csat_responses_no_update_delete BEFORE UPDATE OR DELETE ON "csat_responses" FOR EACH ROW EXECUTE FUNCTION i4_insert_only();
CREATE TRIGGER email_events_no_update_delete BEFORE UPDATE OR DELETE ON "email_events" FOR EACH ROW EXECUTE FUNCTION i4_insert_only();

REVOKE ALL ON "attachments", "csat_responses", "inbound_messages", "quarantine_items", "email_events",
  "portal_access_tokens", "portal_sessions", "rate_limit_counters", "inbound_receipts" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "attachments", "inbound_messages", "quarantine_items", "portal_access_tokens", "portal_sessions" TO app_runtime;
GRANT SELECT, INSERT ON "csat_responses", "email_events" TO app_runtime;
-- Tabelas de plataforma sem dados pessoais (chaves em hash; só ids do provedor)
GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_limit_counters" TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON "inbound_receipts" TO app_runtime;
