-- Add pricing model enum
DO $$ BEGIN
  CREATE TYPE "ProductPricingModel" AS ENUM ('unit', 'weight');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add product ordering and weight pricing columns
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "pricingModel" "ProductPricingModel" NOT NULL DEFAULT 'unit';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "pricePerKg" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "unitLabel" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Add ordering index
CREATE INDEX IF NOT EXISTS "Product_categoryId_sortOrder_createdAt_idx" ON "Product"("categoryId", "sortOrder", "createdAt");
