-- Commission + Payout engine
CREATE TYPE "CommissionMode" AS ENUM ('SUBSCRIPTION_ONLY', 'COMMISSION_ONLY', 'HYBRID');
CREATE TYPE "CommissionScope" AS ENUM ('PLATFORM', 'PROVIDER', 'CATEGORY', 'PROVIDER_CATEGORY');
CREATE TYPE "CommissionDiscountRule" AS ENUM ('BEFORE_DISCOUNT', 'AFTER_DISCOUNT');
CREATE TYPE "FeeRecipient" AS ENUM ('PLATFORM', 'VENDOR');
CREATE TYPE "LedgerEntryType" AS ENUM ('ORDER_SETTLEMENT', 'HOLD_RELEASE', 'PAYOUT', 'PAYOUT_FEE', 'PAYOUT_REVERSAL', 'ADJUSTMENT');
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

ALTER TABLE "Review" ADD COLUMN "reply" TEXT;
ALTER TABLE "Review" ADD COLUMN "replyAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN "replyById" TEXT;

CREATE TABLE "CommissionConfig" (
  "id" TEXT NOT NULL,
  "scope" "CommissionScope" NOT NULL DEFAULT 'PLATFORM',
  "providerId" TEXT,
  "categoryId" TEXT,
  "mode" "CommissionMode" NOT NULL DEFAULT 'HYBRID',
  "commissionRateBps" INTEGER,
  "minCommissionCents" INTEGER NOT NULL DEFAULT 0,
  "maxCommissionCents" INTEGER,
  "deliveryFeeRecipient" "FeeRecipient" NOT NULL DEFAULT 'PLATFORM',
  "gatewayFeeRecipient" "FeeRecipient" NOT NULL DEFAULT 'PLATFORM',
  "discountRule" "CommissionDiscountRule" NOT NULL DEFAULT 'AFTER_DISCOUNT',
  "gatewayFeeRateBps" INTEGER,
  "gatewayFeeFlatCents" INTEGER,
  "payoutHoldDays" INTEGER NOT NULL DEFAULT 0,
  "minimumPayoutCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommissionConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderFinancials" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "commissionConfigId" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'EGP',
  "subtotalCents" INTEGER NOT NULL,
  "deliveryFeeCents" INTEGER NOT NULL DEFAULT 0,
  "discountCents" INTEGER NOT NULL DEFAULT 0,
  "loyaltyDiscountCents" INTEGER NOT NULL DEFAULT 0,
  "taxCents" INTEGER NOT NULL DEFAULT 0,
  "gatewayFeeCents" INTEGER NOT NULL DEFAULT 0,
  "commissionRateBps" INTEGER NOT NULL DEFAULT 0,
  "commissionCents" INTEGER NOT NULL DEFAULT 0,
  "vendorNetCents" INTEGER NOT NULL DEFAULT 0,
  "platformRevenueCents" INTEGER NOT NULL DEFAULT 0,
  "deliveryFeeRecipient" "FeeRecipient" NOT NULL DEFAULT 'PLATFORM',
  "gatewayFeeRecipient" "FeeRecipient" NOT NULL DEFAULT 'PLATFORM',
  "discountRule" "CommissionDiscountRule" NOT NULL DEFAULT 'AFTER_DISCOUNT',
  "holdUntil" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderFinancials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorBalance" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EGP',
  "availableCents" INTEGER NOT NULL DEFAULT 0,
  "pendingCents" INTEGER NOT NULL DEFAULT 0,
  "lifetimeSalesCents" INTEGER NOT NULL DEFAULT 0,
  "lifetimeCommissionCents" INTEGER NOT NULL DEFAULT 0,
  "lifetimeEarningsCents" INTEGER NOT NULL DEFAULT 0,
  "lastSettlementAt" TIMESTAMP(3),
  "lastPayoutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payout" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "feeCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'EGP',
  "referenceId" TEXT,
  "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT,
  "processedById" TEXT,
  "processedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransactionLedger" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "orderId" TEXT,
  "payoutId" TEXT,
  "type" "LedgerEntryType" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EGP',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransactionLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderNotificationPreference" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "preferences" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderFinancials_orderId_key" ON "OrderFinancials"("orderId");
CREATE UNIQUE INDEX "VendorBalance_providerId_key" ON "VendorBalance"("providerId");
CREATE UNIQUE INDEX "ProviderNotificationPreference_providerId_key" ON "ProviderNotificationPreference"("providerId");

CREATE INDEX "CommissionConfig_scope_idx" ON "CommissionConfig"("scope");
CREATE INDEX "CommissionConfig_providerId_idx" ON "CommissionConfig"("providerId");
CREATE INDEX "CommissionConfig_categoryId_idx" ON "CommissionConfig"("categoryId");
CREATE INDEX "CommissionConfig_providerId_categoryId_idx" ON "CommissionConfig"("providerId", "categoryId");
CREATE INDEX "OrderFinancials_providerId_settledAt_idx" ON "OrderFinancials"("providerId", "settledAt");
CREATE INDEX "Payout_providerId_createdAt_idx" ON "Payout"("providerId", "createdAt");
CREATE INDEX "Payout_status_createdAt_idx" ON "Payout"("status", "createdAt");
CREATE INDEX "TransactionLedger_providerId_createdAt_idx" ON "TransactionLedger"("providerId", "createdAt");
CREATE INDEX "TransactionLedger_orderId_idx" ON "TransactionLedger"("orderId");
CREATE INDEX "TransactionLedger_payoutId_idx" ON "TransactionLedger"("payoutId");

ALTER TABLE "Review" ADD CONSTRAINT "Review_replyById_fkey" FOREIGN KEY ("replyById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommissionConfig" ADD CONSTRAINT "CommissionConfig_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionConfig" ADD CONSTRAINT "CommissionConfig_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderFinancials" ADD CONSTRAINT "OrderFinancials_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderFinancials" ADD CONSTRAINT "OrderFinancials_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderFinancials" ADD CONSTRAINT "OrderFinancials_commissionConfigId_fkey" FOREIGN KEY ("commissionConfigId") REFERENCES "CommissionConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VendorBalance" ADD CONSTRAINT "VendorBalance_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payout" ADD CONSTRAINT "Payout_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TransactionLedger" ADD CONSTRAINT "TransactionLedger_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionLedger" ADD CONSTRAINT "TransactionLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransactionLedger" ADD CONSTRAINT "TransactionLedger_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderNotificationPreference" ADD CONSTRAINT "ProviderNotificationPreference_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
