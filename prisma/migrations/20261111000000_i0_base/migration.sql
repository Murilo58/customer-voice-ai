-- CreateEnum
CREATE TYPE "organization_status" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "member_role" AS ENUM ('admin', 'manager', 'agent');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('user', 'superadmin', 'contact', 'system');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "two_factor_enabled" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(3),
    "refresh_token_expires_at" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factors" (
    "id" UUID NOT NULL,
    "secret" TEXT NOT NULL,
    "backup_codes" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "verified" BOOLEAN DEFAULT true,

    CONSTRAINT "two_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admins" (
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "organization_invitations" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "organization_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "ticket_prefix" TEXT NOT NULL,
    "ticket_seq" INTEGER NOT NULL DEFAULT 0,
    "status" "organization_status" NOT NULL DEFAULT 'active',
    "ai_enabled" BOOLEAN NOT NULL DEFAULT false,
    "retention_days" INTEGER,
    "plan_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "member_role" NOT NULL,
    "executive_read" BOOLEAN NOT NULL DEFAULT false,
    "status" "membership_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_invitations" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "member_role" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip_hash" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE INDEX "two_factors_user_id_idx" ON "two_factors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitations_token_hash_key" ON "organization_invitations"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_id_key" ON "memberships"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_token_hash_key" ON "user_invitations"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_organization_id_id_key" ON "user_invitations"("organization_id", "id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_action_idx" ON "audit_logs"("organization_id", "action");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_organization_id_created_by_membership_id_fkey" FOREIGN KEY ("organization_id", "created_by_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================
-- Segurança multi-tenant (ADR-002; DATA_MODEL seção 5; PoC 1)
-- =====================================================================

-- Restrições de dados
ALTER TABLE "users" ADD CONSTRAINT "users_email_lower" CHECK (email = lower(email));
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_email_lower" CHECK (email = lower(email));
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_email_lower" CHECK (email = lower(email));
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_slug_format" CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$');
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
-- Um convite pendente por e-mail e organização
CREATE UNIQUE INDEX "user_invitations_pending_email" ON "user_invitations" ("organization_id", "email") WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Papel de runtime: sem BYPASSRLS. Senha e LOGIN definidos por scripts/db/bootstrap-roles.mjs.
-- Papéis não são removidos e recriados com o mesmo nome (achado da PoC no Neon).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

-- Funções de contexto. NULLIF é obrigatório: após uso na sessão, current_setting volta '' (PoC T6b).
CREATE FUNCTION app_current_org() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;
CREATE FUNCTION app_current_user() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
CREATE FUNCTION app_invitation_token_hash() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.invitation_token_hash', true), '') $$;
CREATE FUNCTION app_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(NULLIF(current_setting('app.platform_admin', true), ''), 'false') = 'true' $$;

-- RLS em todas as tabelas de tenant (ENABLE + FORCE)
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;    ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;      ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
ALTER TABLE "user_invitations" ENABLE ROW LEVEL SECURITY; ALTER TABLE "user_invitations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;       ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

-- Isolamento por organização
CREATE POLICY tenant_isolation ON "organizations" USING (id = app_current_org()) WITH CHECK (id = app_current_org());
CREATE POLICY tenant_isolation ON "memberships" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "user_invitations" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_isolation ON "audit_logs" USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

-- Pré-contexto, somente leitura: "de quais organizações sou membro?" (app.user_id vem da sessão validada)
CREATE POLICY own_memberships_read ON "memberships" FOR SELECT USING (user_id = app_current_user());
CREATE POLICY member_organizations_read ON "organizations" FOR SELECT USING (
  id IN (SELECT m.organization_id FROM "memberships" m WHERE m.user_id = app_current_user() AND m.status = 'active')
);

-- Pré-contexto, somente leitura: convite localizado pelo hash do token (token aleatório de 256 bits)
CREATE POLICY invitation_by_token_read ON "user_invitations" FOR SELECT USING (token_hash = app_invitation_token_hash());
CREATE POLICY invited_organization_read ON "organizations" FOR SELECT USING (
  id IN (SELECT i.organization_id FROM "user_invitations" i WHERE i.token_hash = app_invitation_token_hash())
);

-- Eventos de auditoria de plataforma (organization_id nulo): só em contexto de Superadmin verificado
CREATE POLICY platform_audit ON "audit_logs" USING (organization_id IS NULL AND app_platform_admin())
  WITH CHECK (organization_id IS NULL AND app_platform_admin());

-- Auditoria somente inserção (RF-AUD-03): bloqueia UPDATE, DELETE e TRUNCATE para qualquer papel
CREATE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'audit_logs é somente inserção' USING ERRCODE = 'insufficient_privilege'; END $$;
CREATE TRIGGER audit_logs_no_update_delete BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON "audit_logs" FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();

-- Privilégios do runtime (mínimos)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "users", "sessions", "accounts", "verifications", "two_factors" TO app_runtime;
GRANT SELECT ON "platform_admins" TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON "organization_invitations" TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON "organizations", "memberships", "user_invitations" TO app_runtime;
GRANT SELECT, INSERT ON "audit_logs" TO app_runtime;
GRANT EXECUTE ON FUNCTION app_current_org(), app_current_user(), app_invitation_token_hash(), app_platform_admin() TO app_runtime;
