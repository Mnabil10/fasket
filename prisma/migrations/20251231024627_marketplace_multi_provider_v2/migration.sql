-- CreateEnum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProviderType') THEN
    CREATE TYPE "ProviderType" AS ENUM ('SUPERMARKET', 'PHARMACY', 'RESTAURANT', 'SERVICE', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProviderStatus') THEN
    CREATE TYPE "ProviderStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BranchStatus') THEN
    CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryMode') THEN
    CREATE TYPE "DeliveryMode" AS ENUM ('PLATFORM', 'MERCHANT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProviderUserRole') THEN
    CREATE TYPE "ProviderUserRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderGroupStatus') THEN
    CREATE TYPE "OrderGroupStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderSplitFailurePolicy') THEN
    CREATE TYPE "OrderSplitFailurePolicy" AS ENUM ('CANCEL_GROUP', 'PARTIAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingInterval') THEN
    CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus') THEN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceStatus') THEN
    CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceItemType') THEN
    CREATE TYPE "InvoiceItemType" AS ENUM ('SUBSCRIPTION', 'COMMISSION', 'ADJUSTMENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CouponScope') THEN
    CREATE TYPE "CouponScope" AS ENUM ('PLATFORM', 'PROVIDER', 'BRANCH');
  END IF;
END $$;

-- DropIndex
DROP INDEX IF EXISTS "CartItem_cartId_productId_key";

-- AlterTable
ALTER TABLE "AutomationEvent" DROP CONSTRAINT IF EXISTS "AutomationEvent_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "nextAttemptAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "lastResponseAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "sentAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "providerId" TEXT;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "branchId" TEXT,
ADD COLUMN IF NOT EXISTS "providerId" TEXT,
ADD COLUMN IF NOT EXISTS "scope" "CouponScope" NOT NULL DEFAULT 'PLATFORM';

-- AlterTable
ALTER TABLE "DeliveryZone" ADD COLUMN IF NOT EXISTS "branchId" TEXT,
ADD COLUMN IF NOT EXISTS "providerId" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "branchId" TEXT,
ADD COLUMN IF NOT EXISTS "deliveryDistanceKm" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'PLATFORM',
ADD COLUMN IF NOT EXISTS "deliveryRatePerKmCents" INTEGER,
ADD COLUMN IF NOT EXISTS "orderGroupId" TEXT,
ADD COLUMN IF NOT EXISTS "providerId" TEXT;

-- AlterTable (idempotent additions)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'OrderItem' AND column_name = 'lineProfitCents') THEN
    ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "lineProfitCents" INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'OrderItem' AND column_name = 'lineTotalCents') THEN
    ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "lineTotalCents" INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'OrderItem' AND column_name = 'unitCostCents') THEN
    ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "unitCostCents" INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'OrderItem' AND column_name = 'unitPriceCents') THEN
    ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "unitPriceCents" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- AlterTable (idempotent additions)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'costPriceCents') THEN
    ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "costPriceCents" INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'providerId') THEN
    ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "providerId" TEXT;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "deliveryRatePerKmCents" INTEGER,
ADD COLUMN IF NOT EXISTS "maxDeliveryFeeCents" INTEGER,
ADD COLUMN IF NOT EXISTS "minDeliveryFeeCents" INTEGER;

-- AlterTable
ALTER TABLE "SupportQueryAudit" ADD COLUMN IF NOT EXISTS "orderCode" TEXT,
ADD COLUMN IF NOT EXISTS "phoneMasked" TEXT,
ADD COLUMN IF NOT EXISTS "responseSnippet" TEXT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "signup_links" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "otp_expires_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "signup_sessions" ALTER COLUMN "otp_expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "telegram_links" ALTER COLUMN "linked_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_otp_sent_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "slug" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL DEFAULT 'SUPERMARKET',
    "status" "ProviderStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'PLATFORM',
    "deliveryRatePerKmCents" INTEGER,
    "minDeliveryFeeCents" INTEGER,
    "maxDeliveryFeeCents" INTEGER,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Branch" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "slug" TEXT NOT NULL,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "address" TEXT,
    "city" TEXT,
    "region" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "deliveryMode" "DeliveryMode",
    "deliveryRadiusKm" DOUBLE PRECISION,
    "deliveryRatePerKmCents" INTEGER,
    "minDeliveryFeeCents" INTEGER,
    "maxDeliveryFeeCents" INTEGER,
    "serviceArea" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProviderUser" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProviderUserRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BranchProduct" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceCents" INTEGER,
    "salePriceCents" INTEGER,
    "stock" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrderGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "addressId" TEXT,
    "status" "OrderGroupStatus" NOT NULL DEFAULT 'PENDING',
    "splitFailurePolicy" "OrderSplitFailurePolicy" NOT NULL DEFAULT 'PARTIAL',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'COD',
    "couponCode" TEXT,
    "subtotalCents" INTEGER NOT NULL,
    "shippingFeeCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "billingInterval" "BillingInterval" NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "commissionRateBps" INTEGER NOT NULL DEFAULT 0,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProviderSubscription" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "cancelAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "amountDueCents" INTEGER NOT NULL DEFAULT 0,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "InvoiceItemType" NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProviderLedger" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "orderId" TEXT,
    "orderGroupId" TEXT,
    "invoiceId" TEXT,
    "type" "InvoiceItemType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Provider_slug_key" ON "Provider"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_slug_key" ON "Branch"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Branch_providerId_idx" ON "Branch"("providerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Branch_status_idx" ON "Branch"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProviderUser_userId_idx" ON "ProviderUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderUser_providerId_userId_key" ON "ProviderUser"("providerId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchProduct_branchId_idx" ON "BranchProduct"("branchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BranchProduct_productId_idx" ON "BranchProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BranchProduct_branchId_productId_key" ON "BranchProduct"("branchId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrderGroup_code_key" ON "OrderGroup"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderGroup_userId_createdAt_idx" ON "OrderGroup"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderGroup_status_createdAt_idx" ON "OrderGroup"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrderGroup_userId_idempotencyKey_key" ON "OrderGroup"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProviderSubscription_providerId_status_idx" ON "ProviderSubscription"("providerId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProviderSubscription_planId_idx" ON "ProviderSubscription"("planId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_providerId_createdAt_idx" ON "Invoice"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_subscriptionId_idx" ON "Invoice"("subscriptionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProviderLedger_providerId_createdAt_idx" ON "ProviderLedger"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProviderLedger_orderId_idx" ON "ProviderLedger"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProviderLedger_orderGroupId_idx" ON "ProviderLedger"("orderGroupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProviderLedger_invoiceId_idx" ON "ProviderLedger"("invoiceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CartItem_branchId_idx" ON "CartItem"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_cartId_productId_branchId_key" ON "CartItem"("cartId", "productId", "branchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Category_providerId_idx" ON "Category"("providerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Coupon_providerId_idx" ON "Coupon"("providerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Coupon_branchId_idx" ON "Coupon"("branchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryDriver_isActive_idx" ON "DeliveryDriver"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryDriver_phone_idx" ON "DeliveryDriver"("phone");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryDriver_nationalId_idx" ON "DeliveryDriver"("nationalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryDriver_createdAt_idx" ON "DeliveryDriver"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryZone_isActive_city_region_idx" ON "DeliveryZone"("isActive", "city", "region");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryZone_providerId_idx" ON "DeliveryZone"("providerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryZone_branchId_idx" ON "DeliveryZone"("branchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_orderGroupId_idx" ON "Order"("orderGroupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_providerId_idx" ON "Order"("providerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_branchId_idx" ON "Order"("branchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_code_idx" ON "Order"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_isHotOffer_status_createdAt_idx" ON "Product"("isHotOffer", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_status_createdAt_idx" ON "Product"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_providerId_idx" ON "Product"("providerId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUser" ADD CONSTRAINT "ProviderUser_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUser" ADD CONSTRAINT "ProviderUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchProduct" ADD CONSTRAINT "BranchProduct_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchProduct" ADD CONSTRAINT "BranchProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGroup" ADD CONSTRAINT "OrderGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGroup" ADD CONSTRAINT "OrderGroup_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_orderGroupId_fkey" FOREIGN KEY ("orderGroupId") REFERENCES "OrderGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSubscription" ADD CONSTRAINT "ProviderSubscription_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSubscription" ADD CONSTRAINT "ProviderSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "ProviderSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderLedger" ADD CONSTRAINT "ProviderLedger_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderLedger" ADD CONSTRAINT "ProviderLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderLedger" ADD CONSTRAINT "ProviderLedger_orderGroupId_fkey" FOREIGN KEY ("orderGroupId") REFERENCES "OrderGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderLedger" ADD CONSTRAINT "ProviderLedger_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill default provider/branch and map existing data
INSERT INTO "Provider" (
  "id",
  "name",
  "slug",
  "type",
  "status",
  "deliveryMode",
  "createdAt",
  "updatedAt"
) VALUES (
  'prov_default',
  'Default Provider',
  'default',
  'SUPERMARKET',
  'ACTIVE',
  'PLATFORM',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Branch" (
  "id",
  "providerId",
  "name",
  "slug",
  "status",
  "deliveryMode",
  "isDefault",
  "createdAt",
  "updatedAt"
) VALUES (
  'branch_default',
  'prov_default',
  'Main Branch',
  'default-branch',
  'ACTIVE',
  'PLATFORM',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

UPDATE "Category" SET "providerId" = 'prov_default' WHERE "providerId" IS NULL;
UPDATE "Product" SET "providerId" = 'prov_default' WHERE "providerId" IS NULL;
UPDATE "Coupon"
SET "providerId" = 'prov_default', "scope" = 'PROVIDER'
WHERE "providerId" IS NULL;
UPDATE "DeliveryZone" SET "providerId" = 'prov_default' WHERE "providerId" IS NULL;
UPDATE "CartItem" SET "branchId" = 'branch_default' WHERE "branchId" IS NULL;
UPDATE "Order"
SET "providerId" = 'prov_default',
    "branchId" = 'branch_default',
    "deliveryMode" = 'PLATFORM'
WHERE "providerId" IS NULL;

INSERT INTO "BranchProduct" (
  "id",
  "branchId",
  "productId",
  "priceCents",
  "salePriceCents",
  "stock",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text),
  'branch_default',
  p."id",
  p."priceCents",
  p."salePriceCents",
  p."stock",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Product" p
WHERE NOT EXISTS (
  SELECT 1 FROM "BranchProduct" bp
  WHERE bp."branchId" = 'branch_default' AND bp."productId" = p."id"
);



