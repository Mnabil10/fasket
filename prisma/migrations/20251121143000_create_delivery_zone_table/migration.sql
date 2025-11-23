-- Create DeliveryZone table if it does not exist (aligns DB with Prisma schema)
CREATE TABLE IF NOT EXISTS "DeliveryZone" (
    "id" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "city" TEXT,
    "region" TEXT,
    "feeCents" INTEGER NOT NULL,
    "etaMinutes" INTEGER,
    "freeDeliveryThresholdCents" INTEGER,
    "minOrderAmountCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- Basic indexes
CREATE INDEX IF NOT EXISTS "DeliveryZone_isActive_nameEn_idx" ON "DeliveryZone"("isActive", "nameEn");
CREATE INDEX IF NOT EXISTS "DeliveryZone_city_idx" ON "DeliveryZone"("city");
CREATE INDEX IF NOT EXISTS "DeliveryZone_region_idx" ON "DeliveryZone"("region");
