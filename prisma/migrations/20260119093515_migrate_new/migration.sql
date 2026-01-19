-- AlterTable
ALTER TABLE IF EXISTS "DeliveryCampaign" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Setting" ALTER COLUMN "timezone" SET DEFAULT 'Africa/Cairo';
