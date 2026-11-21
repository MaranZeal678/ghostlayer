-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobKind" ADD VALUE 'INVESTIGATE';
ALTER TYPE "JobKind" ADD VALUE 'VERIFY';

-- AlterTable
ALTER TABLE "RepairAttempt" ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "signals" JSONB;
