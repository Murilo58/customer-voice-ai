-- CreateEnum
CREATE TYPE "sentiment" AS ENUM ('very_negative', 'negative', 'neutral', 'positive');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('pending', 'running', 'succeeded', 'dead');

-- CreateEnum
CREATE TYPE "triage_run_status" AS ENUM ('succeeded', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "review_outcome" AS ENUM ('pending', 'accepted', 'changed');

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "category_id" UUID,
ADD COLUMN     "escalation_risk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority_manual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reason_id" UUID,
ADD COLUMN     "sentiment" "sentiment";

-- CreateTable
CREATE TABLE "categories" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "default_priority" "ticket_priority",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reasons" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "default_priority" "ticket_priority",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "idempotency_key" TEXT NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "run_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_runs" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "status" "triage_run_status" NOT NULL,
    "result" JSONB,
    "error_code" TEXT,
    "forced" BOOLEAN NOT NULL DEFAULT false,
    "forced_reason" TEXT,
    "forced_by" UUID,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "thought_tokens" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triage_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_reviews" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "triage_run_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "suggested_value" TEXT,
    "final_value" TEXT,
    "outcome" "review_outcome" NOT NULL DEFAULT 'pending',
    "reviewer_membership_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),

    CONSTRAINT "triage_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_events" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "triage_run_id" UUID,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "thought_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd_micros" BIGINT NOT NULL DEFAULT 0,
    "price_version" TEXT NOT NULL,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_quotas" (
    "organization_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "limit_ops" INTEGER NOT NULL,
    "used_ops" INTEGER NOT NULL DEFAULT 0,
    "alerted_80_at" TIMESTAMPTZ(3),
    "alerted_100_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_quotas_pkey" PRIMARY KEY ("organization_id","period")
);

-- CreateTable
CREATE TABLE "platform_ai_budget" (
    "period" TEXT NOT NULL,
    "limit_usd_micros" BIGINT NOT NULL,
    "spent_usd_micros" BIGINT NOT NULL DEFAULT 0,
    "tripped_at" TIMESTAMPTZ(3),

    CONSTRAINT "platform_ai_budget_pkey" PRIMARY KEY ("period")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_organization_id_id_key" ON "categories"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organization_id_name_key" ON "categories"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "reasons_organization_id_id_key" ON "reasons"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reasons_organization_id_name_key" ON "reasons"("organization_id", "name");

-- CreateIndex
CREATE INDEX "jobs_status_run_after_idx" ON "jobs"("status", "run_after");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_type_idempotency_key_key" ON "jobs"("type", "idempotency_key");

-- CreateIndex
CREATE INDEX "triage_runs_organization_id_ticket_id_created_at_idx" ON "triage_runs"("organization_id", "ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "triage_runs_organization_id_id_key" ON "triage_runs"("organization_id", "id");

-- CreateIndex
CREATE INDEX "triage_reviews_organization_id_reviewed_at_idx" ON "triage_reviews"("organization_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "triage_reviews_organization_id_id_key" ON "triage_reviews"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "triage_reviews_organization_id_triage_run_id_field_key" ON "triage_reviews"("organization_id", "triage_run_id", "field");

-- CreateIndex
CREATE INDEX "ai_usage_events_organization_id_created_at_idx" ON "ai_usage_events"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_category_id_fkey" FOREIGN KEY ("organization_id", "category_id") REFERENCES "categories"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_reason_id_fkey" FOREIGN KEY ("organization_id", "reason_id") REFERENCES "reasons"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasons" ADD CONSTRAINT "reasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_runs" ADD CONSTRAINT "triage_runs_organization_id_ticket_id_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "tickets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_reviews" ADD CONSTRAINT "triage_reviews_organization_id_triage_run_id_fkey" FOREIGN KEY ("organization_id", "triage_run_id") REFERENCES "triage_runs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_reviews" ADD CONSTRAINT "triage_reviews_organization_id_reviewer_membership_id_fkey" FOREIGN KEY ("organization_id", "reviewer_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_quotas" ADD CONSTRAINT "ai_quotas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================
-- Segurança do I-2 (ADR-002, ADR-005, ADR-006; DATA_MODEL 3.6)
-- =====================================================================
ALTER TABLE "categories" ADD CONSTRAINT "categories_name_length" CHECK (char_length(name) BETWEEN 2 AND 80);
ALTER TABLE "reasons" ADD CONSTRAINT "reasons_name_length" CHECK (char_length(name) BETWEEN 2 AND 80);
ALTER TABLE "triage_runs" ADD CONSTRAINT "triage_runs_forced_reason" CHECK (forced = false OR forced_reason IS NOT NULL);
ALTER TABLE "ai_quotas" ADD CONSTRAINT "ai_quotas_limits" CHECK (limit_ops >= 0 AND used_ops >= 0);
-- Idempotência (RIA-06): uma execução não forçada por chamado e chave
CREATE UNIQUE INDEX "triage_runs_idempotency" ON "triage_runs" ("organization_id", "ticket_id", "idempotency_key") WHERE forced = false;
CREATE INDEX "jobs_running_locked" ON "jobs" ("status", "locked_until");
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;      ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;
ALTER TABLE "reasons" ENABLE ROW LEVEL SECURITY;         ALTER TABLE "reasons" FORCE ROW LEVEL SECURITY;
ALTER TABLE "triage_runs" ENABLE ROW LEVEL SECURITY;     ALTER TABLE "triage_runs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "triage_reviews" ENABLE ROW LEVEL SECURITY;  ALTER TABLE "triage_reviews" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage_events" ENABLE ROW LEVEL SECURITY; ALTER TABLE "ai_usage_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ai_quotas" ENABLE ROW LEVEL SECURITY;       ALTER TABLE "ai_quotas" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "categories" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "reasons" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "triage_runs" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "triage_reviews" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "ai_usage_events" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "ai_quotas" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

-- Consumo de IA somente inserção (RF-CON-01)
CREATE FUNCTION ai_usage_events_immutable() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'ai_usage_events é somente inserção' USING ERRCODE = 'insufficient_privilege'; END $$;
CREATE TRIGGER ai_usage_events_no_update_delete BEFORE UPDATE OR DELETE ON "ai_usage_events" FOR EACH ROW EXECUTE FUNCTION ai_usage_events_immutable();

REVOKE ALL ON "categories", "reasons", "jobs", "triage_runs", "triage_reviews", "ai_usage_events", "ai_quotas", "platform_ai_budget" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "categories", "reasons", "triage_reviews", "ai_quotas" TO app_runtime;
GRANT SELECT, INSERT ON "triage_runs", "ai_usage_events" TO app_runtime;
-- Outbox e orçamento global: tabelas de plataforma sem dados pessoais (payload só com IDs).
GRANT SELECT, INSERT, UPDATE ON "jobs" TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON "platform_ai_budget" TO app_runtime;
