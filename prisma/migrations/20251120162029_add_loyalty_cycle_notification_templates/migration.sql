/*
  Warnings:

  - A unique constraint covering the columns `[sku]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "LoyaltyTransaction" ADD COLUMN     "cycleId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "driverAssignedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "loyaltyEarnRate" DOUBLE PRECISION,
ADD COLUMN     "loyaltyMaxRedeemPerOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyRedeemRateValue" DOUBLE PRECISION,
ADD COLUMN     "loyaltyResetThreshold" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFaSecret" TEXT;

-- CreateTable
CREATE TABLE "LoyaltyCycle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "threshold" INTEGER NOT NULL,
    "resetOnComplete" BOOLEAN NOT NULL DEFAULT true,
    "earnedInCycle" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LoyaltyCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "language" VARCHAR(8) NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'push',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyCycle_userId_completedAt_idx" ON "LoyaltyCycle"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_key_language_channel_key" ON "NotificationTemplate"("key", "language", "channel");

-- CreateIndex
CREATE INDEX "DeliveryDriver_isActive_createdAt_idx" ON "DeliveryDriver"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryDriver_fullName_idx" ON "DeliveryDriver"("fullName");

-- CreateIndex
CREATE INDEX "DeliveryVehicle_plateNumber_idx" ON "DeliveryVehicle"("plateNumber");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_cycleId_idx" ON "LoyaltyTransaction"("cycleId");

-- CreateIndex
CREATE INDEX "Order_driverId_createdAt_idx" ON "Order"("driverId", "createdAt");

-- AddForeignKey
ALTER TABLE "LoyaltyCycle" ADD CONSTRAINT "LoyaltyCycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "LoyaltyCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
