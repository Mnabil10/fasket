-- Minimal, idempotent migration to ensure cost/price columns exist without recreating existing indexes/constraints

-- Add missing columns on OrderItem if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'OrderItem' AND column_name = 'lineProfitCents') THEN
    ALTER TABLE "OrderItem" ADD COLUMN "lineProfitCents" INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'OrderItem' AND column_name = 'lineTotalCents') THEN
    ALTER TABLE "OrderItem" ADD COLUMN "lineTotalCents" INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'OrderItem' AND column_name = 'unitCostCents') THEN
    ALTER TABLE "OrderItem" ADD COLUMN "unitCostCents" INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'OrderItem' AND column_name = 'unitPriceCents') THEN
    ALTER TABLE "OrderItem" ADD COLUMN "unitPriceCents" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add missing cost column on Product
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'costPriceCents') THEN
    ALTER TABLE "Product" ADD COLUMN "costPriceCents" INTEGER DEFAULT 0;
  END IF;
END $$;
