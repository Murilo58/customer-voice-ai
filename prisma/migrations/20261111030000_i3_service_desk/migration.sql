-- CreateEnum
CREATE TYPE "outbound_email_status" AS ENUM ('queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed');

-- AlterTable
ALTER TABLE "jobs" ALTER COLUMN "run_after" SET DEFAULT now();

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "assignee_membership_id" UUID,
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "closed_at" TIMESTAMPTZ(3),
ADD COLUMN     "first_responded_at" TIMESTAMPTZ(3),
ADD COLUMN     "resolution_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resolved_at" TIMESTAMPTZ(3),
ADD COLUMN     "team_id" UUID;

-- AlterTable
ALTER TABLE "user_invitations" ADD COLUMN     "team_ids" UUID[] DEFAULT ARRAY[]::UUID[];

-- CreateTable
CREATE TABLE "teams" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "organization_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("organization_id","team_id","membership_id")
);

-- CreateTable
CREATE TABLE "onboarding_checklist" (
    "organization_id" UUID NOT NULL,
    "item" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_checklist_pkey" PRIMARY KEY ("organization_id","item")
);

-- CreateTable
CREATE TABLE "outbound_emails" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "ticket_id" UUID,
    "message_id" UUID,
    "template" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "rfc_message_id" TEXT NOT NULL,
    "provider_email_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "status" "outbound_email_status" NOT NULL DEFAULT 'queued',
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "outbound_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_organization_id_id_key" ON "teams"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_organization_id_name_key" ON "teams"("organization_id", "name");

-- CreateIndex
CREATE INDEX "team_members_organization_id_membership_id_idx" ON "team_members"("organization_id", "membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_emails_rfc_message_id_key" ON "outbound_emails"("rfc_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_emails_idempotency_key_key" ON "outbound_emails"("idempotency_key");

-- CreateIndex
CREATE INDEX "outbound_emails_organization_id_ticket_id_idx" ON "outbound_emails"("organization_id", "ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_emails_organization_id_id_key" ON "outbound_emails"("organization_id", "id");

-- CreateIndex
CREATE INDEX "tickets_organization_id_team_id_assignee_membership_id_stat_idx" ON "tickets"("organization_id", "team_id", "assignee_membership_id", "status");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_team_id_fkey" FOREIGN KEY ("organization_id", "team_id") REFERENCES "teams"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_assignee_membership_id_fkey" FOREIGN KEY ("organization_id", "assignee_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_organization_id_team_id_fkey" FOREIGN KEY ("organization_id", "team_id") REFERENCES "teams"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_organization_id_membership_id_fkey" FOREIGN KEY ("organization_id", "membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_checklist" ADD CONSTRAINT "onboarding_checklist_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_organization_id_ticket_id_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "tickets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_organization_id_message_id_fkey" FOREIGN KEY ("organization_id", "message_id") REFERENCES "ticket_messages"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================
-- Segurança do I-3 (ADR-002; DATA_MODEL 3.3)
-- =====================================================================
-- Cancelamento exige motivo (RN-05)
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_cancel_reason" CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL);
ALTER TABLE "teams" ADD CONSTRAINT "teams_name_length" CHECK (char_length(name) BETWEEN 2 AND 80);
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_to_lower" CHECK (to_address = lower(to_address));

-- Busca textual restrita à organização ativa (RF-ATD-11; DATA_MODEL seção 4)
CREATE INDEX "tickets_search" ON "tickets" USING GIN (to_tsvector('portuguese', subject || ' ' || description));
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "contacts_name_trgm" ON "contacts" USING GIN (lower(name) gin_trgm_ops);
CREATE INDEX "tickets_resolved" ON "tickets" ("organization_id", "resolved_at") WHERE status = 'resolved';

ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;                ALTER TABLE "teams" FORCE ROW LEVEL SECURITY;
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;         ALTER TABLE "team_members" FORCE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_checklist" ENABLE ROW LEVEL SECURITY; ALTER TABLE "onboarding_checklist" FORCE ROW LEVEL SECURITY;
ALTER TABLE "outbound_emails" ENABLE ROW LEVEL SECURITY;      ALTER TABLE "outbound_emails" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "teams" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "team_members" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "onboarding_checklist" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "outbound_emails" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

REVOKE ALL ON "teams", "team_members", "onboarding_checklist", "outbound_emails" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "teams", "onboarding_checklist", "outbound_emails" TO app_runtime;
-- Vínculo de equipe é configuração (sem dados pessoais): remover membro da equipe apaga o vínculo; a mudança é auditada.
GRANT SELECT, INSERT, DELETE ON "team_members" TO app_runtime;
