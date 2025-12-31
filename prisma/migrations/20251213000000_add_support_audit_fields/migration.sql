-- Add columns for richer support audit visibility
ALTER TABLE IF EXISTS "SupportQueryAudit" ADD COLUMN "phoneMasked" TEXT;
ALTER TABLE IF EXISTS "SupportQueryAudit" ADD COLUMN "orderCode" TEXT;
ALTER TABLE IF EXISTS "SupportQueryAudit" ADD COLUMN "responseSnippet" TEXT;
