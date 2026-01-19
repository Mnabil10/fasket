-- Drop DeliveryCampaign.updatedAt default after table creation
ALTER TABLE "DeliveryCampaign" ALTER COLUMN "updatedAt" DROP DEFAULT;
