-- AlterTable

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "business_hours" JSONB NOT NULL DEFAULT '{"1":[540,1080],"2":[540,1080],"3":[540,1080],"4":[540,1080],"5":[540,1080]}';

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN     "first_response_business_secs" INTEGER,
ADD COLUMN     "first_response_due_at" TIMESTAMPTZ(3),
ADD COLUMN     "first_response_risk_at" TIMESTAMPTZ(3),
ADD COLUMN     "resolution_business_secs" INTEGER,
ADD COLUMN     "resolution_due_at" TIMESTAMPTZ(3),
ADD COLUMN     "resolution_risk_at" TIMESTAMPTZ(3),
ADD COLUMN     "sla_intervals" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "sla_snapshot" JSONB;

-- CreateTable
CREATE TABLE "holidays" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "organization_id" UUID NOT NULL,
    "priority" "ticket_priority" NOT NULL,
    "first_response_minutes" INTEGER,
    "resolution_minutes" INTEGER,
    "business_hours" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("organization_id","priority")
);

-- CreateTable
CREATE TABLE "sla_events" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "ticket_id" UUID,
    "data" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holidays_organization_id_id_key" ON "holidays"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_organization_id_date_key" ON "holidays"("organization_id", "date");

-- CreateIndex
CREATE INDEX "sla_events_organization_id_kind_occurred_at_idx" ON "sla_events"("organization_id", "kind", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "sla_events_organization_id_id_key" ON "sla_events"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sla_events_organization_id_ticket_id_metric_kind_key" ON "sla_events"("organization_id", "ticket_id", "metric", "kind");

-- CreateIndex
CREATE INDEX "notifications_organization_id_membership_id_read_at_idx" ON "notifications"("organization_id", "membership_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_organization_id_id_key" ON "notifications"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_events" ADD CONSTRAINT "sla_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_events" ADD CONSTRAINT "sla_events_organization_id_ticket_id_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "tickets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_membership_id_fkey" FOREIGN KEY ("organization_id", "membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_ticket_id_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "tickets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================
-- Segurança do I-5 (ADR-002; DATA_MODEL 3.3)
-- =====================================================================
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_minutes" CHECK ((first_response_minutes IS NULL OR first_response_minutes > 0) AND (resolution_minutes IS NULL OR resolution_minutes > 0));
ALTER TABLE "sla_events" ADD CONSTRAINT "sla_events_metric" CHECK (metric IN ('first_response', 'resolution'));
ALTER TABLE "sla_events" ADD CONSTRAINT "sla_events_kind" CHECK (kind IN ('risk', 'breach'));
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_name_length" CHECK (char_length(name) BETWEEN 2 AND 80);

-- Visão "SLA em risco" e ordenação por prazo (RF-ATD-10, RF-ATD-12)
CREATE INDEX "tickets_frt_risk" ON "tickets" ("organization_id", "first_response_risk_at") WHERE first_response_risk_at IS NOT NULL;
CREATE INDEX "tickets_res_risk" ON "tickets" ("organization_id", "resolution_risk_at") WHERE resolution_risk_at IS NOT NULL;

ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;      ALTER TABLE "holidays" FORCE ROW LEVEL SECURITY;
ALTER TABLE "sla_policies" ENABLE ROW LEVEL SECURITY;  ALTER TABLE "sla_policies" FORCE ROW LEVEL SECURITY;
ALTER TABLE "sla_events" ENABLE ROW LEVEL SECURITY;    ALTER TABLE "sla_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY; ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "holidays" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "sla_policies" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "sla_events" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
-- Alertas: qualquer processo da organização cria; cada pessoa só lê e marca os próprios.
CREATE POLICY notifications_insert ON "notifications" FOR INSERT WITH CHECK (organization_id = app_current_org());
CREATE POLICY notifications_own_read ON "notifications" FOR SELECT USING (
  organization_id = app_current_org() AND membership_id IN (SELECT m.id FROM memberships m WHERE m.user_id = app_current_user()));
CREATE POLICY notifications_own_update ON "notifications" FOR UPDATE USING (
  organization_id = app_current_org() AND membership_id IN (SELECT m.id FROM memberships m WHERE m.user_id = app_current_user()))
  WITH CHECK (organization_id = app_current_org());

-- Violações imutáveis (RF-SLA-05; CA-12.5)
CREATE FUNCTION sla_events_immutable() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'sla_events é somente inserção' USING ERRCODE = 'insufficient_privilege'; END $$;
CREATE TRIGGER sla_events_no_update_delete BEFORE UPDATE OR DELETE ON "sla_events" FOR EACH ROW EXECUTE FUNCTION sla_events_immutable();

REVOKE ALL ON "holidays", "sla_policies", "sla_events", "notifications" FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON "holidays" TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON "sla_policies", "notifications" TO app_runtime;
GRANT SELECT, INSERT ON "sla_events" TO app_runtime;

-- Backoffice do Superadmin (RF-ORG-09, RF-CON-02): organizações, cotas e consumo agregado.
-- Sem políticas de plataforma em chamados, mensagens ou contatos: o Superadmin não lê conteúdo (CA-16.4).
CREATE POLICY platform_read ON "organizations" FOR SELECT USING (app_platform_admin());
CREATE POLICY platform_update ON "organizations" FOR UPDATE USING (app_platform_admin()) WITH CHECK (app_platform_admin());
CREATE POLICY platform_quotas ON "ai_quotas" USING (app_platform_admin()) WITH CHECK (app_platform_admin());
CREATE POLICY platform_usage_read ON "ai_usage_events" FOR SELECT USING (app_platform_admin());
