-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'CANCELED');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('PUSH', 'SMS', 'WHATSAPP', 'EMAIL');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PROVIDER';

-- CreateTable
CREATE TABLE "DeliveryDriverLocation" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "orderId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryDriverLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "message" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL DEFAULT 'PUSH',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "segment" JSONB,
    "payload" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryDriverLocation_driverId_recordedAt_idx" ON "DeliveryDriverLocation"("driverId", "recordedAt");

-- CreateIndex
CREATE INDEX "DeliveryDriverLocation_orderId_recordedAt_idx" ON "DeliveryDriverLocation"("orderId", "recordedAt");

-- CreateIndex
CREATE INDEX "MarketingCampaign_status_scheduledAt_idx" ON "MarketingCampaign"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "MarketingCampaign_channel_idx" ON "MarketingCampaign"("channel");

-- AddForeignKey
ALTER TABLE "DeliveryDriverLocation" ADD CONSTRAINT "DeliveryDriverLocation_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DeliveryDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryDriverLocation" ADD CONSTRAINT "DeliveryDriverLocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
