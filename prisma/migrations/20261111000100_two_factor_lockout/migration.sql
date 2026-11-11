-- Colunas de bloqueio por tentativas do plugin twoFactor (Better Auth 1.7)
ALTER TABLE "two_factors" ADD COLUMN "failed_verification_count" INTEGER DEFAULT 0;
ALTER TABLE "two_factors" ADD COLUMN "locked_until" TIMESTAMPTZ(3);
