-- CreateEnum
CREATE TYPE "ApiKeyProvider" AS ENUM ('OPENAI', 'SOLARI');

-- CreateTable
CREATE TABLE "UserApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ApiKeyProvider" NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserApiKey_userId_provider_key" ON "UserApiKey"("userId", "provider");

-- AddForeignKey
ALTER TABLE "UserApiKey" ADD CONSTRAINT "UserApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase Data API exposure: keep RLS on (Prisma connects as owner).
ALTER TABLE "UserApiKey" ENABLE ROW LEVEL SECURITY;
