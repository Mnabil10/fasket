-- AlterTable
ALTER TABLE "DeliveryCampaign" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Setting" ALTER COLUMN "timezone" SET DEFAULT 'Africa/Cairo';
