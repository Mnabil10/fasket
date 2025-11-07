/*
  Warnings:

  - You are about to drop the column `defaultShippingFeeCents` on the `Setting` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Setting" DROP COLUMN "defaultShippingFeeCents",
ADD COLUMN     "allowRegistrations" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "backupFrequency" TEXT NOT NULL DEFAULT 'daily',
ADD COLUMN     "businessHours" JSONB,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "dataRetentionDays" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN     "deliveryFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryZones" JSONB,
ADD COLUMN     "estimatedDeliveryTime" TEXT,
ADD COLUMN     "freeDeliveryMinimumCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxDeliveryRadiusKm" INTEGER,
ADD COLUMN     "maxLoginAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "notifications" JSONB,
ADD COLUMN     "payment" JSONB,
ADD COLUMN     "requireEmailVerification" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sessionTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "storeAddress" TEXT,
ADD COLUMN     "storeDescription" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
ALTER COLUMN "currency" SET DEFAULT 'USD';
