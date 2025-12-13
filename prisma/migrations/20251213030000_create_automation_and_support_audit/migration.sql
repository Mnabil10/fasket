-- Ensure UUID generation is available for automation events
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Automation event status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AutomationEventStatus') THEN
        CREATE TYPE "AutomationEventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DEAD');
    END IF;
END $$;

-- Automation events queue
CREATE TABLE IF NOT EXISTS "AutomationEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AutomationEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ,
    "dedupeKey" TEXT,
    "correlationId" TEXT,
    "lastHttpStatus" INTEGER,
    "lastError" TEXT,
    "lastResponseAt" TIMESTAMPTZ,
    "lastResponseBodySnippet" TEXT,
    "sentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AutomationEvent_type_dedupeKey_key" ON "AutomationEvent"("type", "dedupeKey");
CREATE INDEX IF NOT EXISTS "AutomationEvent_status_nextAttemptAt_idx" ON "AutomationEvent"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "AutomationEvent_dedupeKey_idx" ON "AutomationEvent"("dedupeKey");
CREATE INDEX IF NOT EXISTS "AutomationEvent_type_idx" ON "AutomationEvent"("type");
CREATE INDEX IF NOT EXISTS "AutomationEvent_createdAt_idx" ON "AutomationEvent"("createdAt");

-- Support bot audit log
CREATE TABLE IF NOT EXISTS "SupportQueryAudit" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "phoneHash" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "correlationId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "SupportQueryAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SupportQueryAudit_endpoint_createdAt_idx" ON "SupportQueryAudit"("endpoint", "createdAt");
