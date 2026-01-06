-- CreateEnum
CREATE TYPE "ProviderApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "ProviderStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "ProviderSubscription" ADD COLUMN     "commissionRateBpsOverride" INTEGER;

-- CreateTable
CREATE TABLE "ProviderApplication" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'PLATFORM',
    "notes" TEXT,
    "status" "ProviderApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "providerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderApplication_status_idx" ON "ProviderApplication"("status");

-- CreateIndex
CREATE INDEX "ProviderApplication_providerType_idx" ON "ProviderApplication"("providerType");

-- CreateIndex
CREATE INDEX "ProviderApplication_city_idx" ON "ProviderApplication"("city");

-- CreateIndex
CREATE INDEX "ProviderApplication_providerId_idx" ON "ProviderApplication"("providerId");

-- AddForeignKey
ALTER TABLE "ProviderApplication" ADD CONSTRAINT "ProviderApplication_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
