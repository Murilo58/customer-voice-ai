-- AlterTable

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "ai_quota_ops" INTEGER;

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_ai_quota_ops" CHECK (ai_quota_ops IS NULL OR ai_quota_ops >= 0);
