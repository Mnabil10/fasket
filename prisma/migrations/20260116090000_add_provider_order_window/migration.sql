-- Add provider ordering window configuration
ALTER TABLE "Provider" ADD COLUMN "orderWindowStartMinutes" INTEGER;
ALTER TABLE "Provider" ADD COLUMN "orderWindowEndMinutes" INTEGER;
