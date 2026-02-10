-- Growth Pack user fields
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "appOpenCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastAppOpenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firstOrderWizardDismissedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastRetentionSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "retentionCountThisWeek" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "User_lastRetentionSentAt_idx" ON "User"("lastRetentionSentAt");
