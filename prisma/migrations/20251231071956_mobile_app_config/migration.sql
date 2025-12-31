-- Add mobile app config payload
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "mobileAppConfig" JSONB;
