-- CreateTable
CREATE TABLE "FixMemory" (
    "id" TEXT NOT NULL,
    "repositoryFullName" TEXT NOT NULL,
    "treeSha" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "diff" TEXT NOT NULL,
    "diffHash" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "rootCause" TEXT,
    "patchSummary" TEXT,
    "prTitle" TEXT,
    "branchSlug" TEXT,
    "verification" JSONB,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemo" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMemo_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "FixMemory_repositoryFullName_treeSha_fingerprint_key" ON "FixMemory"("repositoryFullName", "treeSha", "fingerprint");

ALTER TABLE "FixMemory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentMemo" ENABLE ROW LEVEL SECURITY;
