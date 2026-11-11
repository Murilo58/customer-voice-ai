-- run_after usa o relógio do banco: o default do Prisma (now() no cliente) sofria com diferença de relógio.
-- AlterTable
ALTER TABLE "jobs" ALTER COLUMN "run_after" SET DEFAULT now();

