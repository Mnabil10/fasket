-- Create delivery campaigns
CREATE TABLE "DeliveryCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deliveryPriceCents" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxOrders" INTEGER,
    "maxDiscountCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryCampaignZone" (
    "campaignId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryCampaignZone_pkey" PRIMARY KEY ("campaignId", "zoneId")
);

CREATE TABLE "DeliveryCampaignProvider" (
    "campaignId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryCampaignProvider_pkey" PRIMARY KEY ("campaignId", "providerId")
);

-- Add delivery pricing metadata to orders
ALTER TABLE "Order" ADD COLUMN "deliveryBaseFeeCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN "deliveryAppliedFeeCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN "deliveryCampaignId" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryCampaignName" TEXT;

-- Link notifications to delivery campaigns
ALTER TABLE "Notification" ADD COLUMN "deliveryCampaignId" TEXT;

-- Indexes
CREATE INDEX "DeliveryCampaign_isActive_startAt_endAt_idx" ON "DeliveryCampaign"("isActive", "startAt", "endAt");
CREATE INDEX "DeliveryCampaignZone_campaignId_idx" ON "DeliveryCampaignZone"("campaignId");
CREATE INDEX "DeliveryCampaignZone_zoneId_idx" ON "DeliveryCampaignZone"("zoneId");
CREATE INDEX "DeliveryCampaignProvider_campaignId_idx" ON "DeliveryCampaignProvider"("campaignId");
CREATE INDEX "DeliveryCampaignProvider_providerId_idx" ON "DeliveryCampaignProvider"("providerId");
CREATE INDEX "Order_deliveryCampaignId_idx" ON "Order"("deliveryCampaignId");
CREATE INDEX "Notification_deliveryCampaignId_idx" ON "Notification"("deliveryCampaignId");

-- Foreign keys
ALTER TABLE "DeliveryCampaignZone" ADD CONSTRAINT "DeliveryCampaignZone_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "DeliveryCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryCampaignZone" ADD CONSTRAINT "DeliveryCampaignZone_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryCampaignProvider" ADD CONSTRAINT "DeliveryCampaignProvider_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "DeliveryCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryCampaignProvider" ADD CONSTRAINT "DeliveryCampaignProvider_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryCampaignId_fkey"
  FOREIGN KEY ("deliveryCampaignId") REFERENCES "DeliveryCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_deliveryCampaignId_fkey"
  FOREIGN KEY ("deliveryCampaignId") REFERENCES "DeliveryCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
