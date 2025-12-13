-- Add columns for richer support audit visibility
ALTER TABLE "SupportQueryAudit" ADD COLUMN "phoneMasked" TEXT;
ALTER TABLE "SupportQueryAudit" ADD COLUMN "orderCode" TEXT;
ALTER TABLE "SupportQueryAudit" ADD COLUMN "responseSnippet" TEXT;
