-- Ensure orders have a unique code column to match the Prisma schema
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "code" TEXT;

-- Backfill existing rows using the order id as a stable code
UPDATE "Order"
SET "code" = COALESCE("code", "id")
WHERE "code" IS NULL;

-- Enforce not-null and uniqueness
ALTER TABLE "Order" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Order_code_key" ON "Order"("code");
