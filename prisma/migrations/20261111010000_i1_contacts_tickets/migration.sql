-- CreateEnum
CREATE TYPE "ticket_channel" AS ENUM ('portal', 'email', 'manual');

-- CreateEnum
CREATE TYPE "ticket_type" AS ENUM ('complaint', 'request', 'question', 'suggestion', 'compliment');

-- CreateEnum
CREATE TYPE "ticket_priority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('new', 'open', 'waiting_customer', 'waiting_third_party', 'resolved', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "triage_state" AS ENUM ('pending', 'suggested', 'reviewed', 'unavailable');

-- CreateEnum
CREATE TYPE "message_kind" AS ENUM ('customer_message', 'public_reply', 'internal_note', 'system');

-- CreateTable
CREATE TABLE "client_companies" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email_domain" TEXT,
    "anonymized_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "client_company_id" UUID,
    "pseudonym_code" TEXT,
    "anonymized_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "contact_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "channel" "ticket_channel" NOT NULL,
    "type" "ticket_type",
    "priority" "ticket_priority" NOT NULL DEFAULT 'medium',
    "status" "ticket_status" NOT NULL DEFAULT 'new',
    "triage_state" "triage_state" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "kind" "message_kind" NOT NULL,
    "author_membership_id" UUID,
    "body_text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" UUID,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_companies_organization_id_id_key" ON "client_companies"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_organization_id_id_key" ON "contacts"("organization_id", "id");

-- CreateIndex
CREATE INDEX "tickets_organization_id_status_priority_created_at_idx" ON "tickets"("organization_id", "status", "priority", "created_at" DESC);

-- CreateIndex
CREATE INDEX "tickets_organization_id_contact_id_created_at_idx" ON "tickets"("organization_id", "contact_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_organization_id_id_key" ON "tickets"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_organization_id_number_key" ON "tickets"("organization_id", "number");

-- CreateIndex
CREATE INDEX "ticket_messages_organization_id_ticket_id_created_at_idx" ON "ticket_messages"("organization_id", "ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_messages_organization_id_id_key" ON "ticket_messages"("organization_id", "id");

-- CreateIndex
CREATE INDEX "ticket_events_organization_id_ticket_id_created_at_idx" ON "ticket_events"("organization_id", "ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_events_organization_id_id_key" ON "ticket_events"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "client_companies" ADD CONSTRAINT "client_companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_client_company_id_fkey" FOREIGN KEY ("organization_id", "client_company_id") REFERENCES "client_companies"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_contact_id_fkey" FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_organization_id_ticket_id_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "tickets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_organization_id_author_membership_id_fkey" FOREIGN KEY ("organization_id", "author_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_organization_id_ticket_id_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "tickets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================
-- Segurança do I-1 (ADR-002; DATA_MODEL 3.3 e 3.4)
-- =====================================================================
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_email_lower" CHECK (email = lower(email));
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_number_positive" CHECK (number > 0);
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_subject_length" CHECK (char_length(subject) BETWEEN 1 AND 200);
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author" CHECK (kind = 'system' OR author_membership_id IS NOT NULL OR kind = 'customer_message');
-- E-mail único por organização entre contatos não anonimizados (RF-CLI-01; CA-19.2)
CREATE UNIQUE INDEX "contacts_org_email_active" ON "contacts" ("organization_id", "email") WHERE anonymized_at IS NULL;
CREATE INDEX "contacts_org_name" ON "contacts" ("organization_id", lower(name));

ALTER TABLE "client_companies" ENABLE ROW LEVEL SECURITY; ALTER TABLE "client_companies" FORCE ROW LEVEL SECURITY;
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;         ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;          ALTER TABLE "tickets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ticket_messages" ENABLE ROW LEVEL SECURITY;  ALTER TABLE "ticket_messages" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ticket_events" ENABLE ROW LEVEL SECURITY;    ALTER TABLE "ticket_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "client_companies" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "contacts" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "tickets" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "ticket_messages" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "ticket_events" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

-- Linha do tempo somente inserção (DATA_MODEL 3.4)
CREATE FUNCTION ticket_events_immutable() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'ticket_events é somente inserção' USING ERRCODE = 'insufficient_privilege'; END $$;
CREATE TRIGGER ticket_events_no_update_delete BEFORE UPDATE OR DELETE ON "ticket_events" FOR EACH ROW EXECUTE FUNCTION ticket_events_immutable();

-- Privilégios do runtime: sem DELETE (anonimização no lugar de exclusão física)
REVOKE ALL ON "client_companies", "contacts", "tickets", "ticket_messages", "ticket_events" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "client_companies", "contacts", "tickets" TO app_runtime;
GRANT SELECT, INSERT ON "ticket_messages", "ticket_events" TO app_runtime;
