/*
  Warnings:

  - A unique constraint covering the columns `[cartId,productId,branchId,optionsHash]` on the table `CartItem` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ProductOptionGroupType" AS ENUM ('SINGLE', 'MULTI');

-- DropIndex
DROP INDEX "CartItem_cartId_productId_branchId_key";

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "schedulingAllowAsap" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "schedulingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "optionsHash" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryWindowId" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderGroup" ADD COLUMN     "deliveryWindowId" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProductOptionGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "type" "ProductOptionGroupType" NOT NULL,
    "minSelected" INTEGER NOT NULL DEFAULT 0,
    "maxSelected" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "maxQtyPerOption" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItemOption" (
    "id" TEXT NOT NULL,
    "cartItemId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItemOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemOption" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "optionId" TEXT,
    "optionNameSnapshot" TEXT NOT NULL,
    "optionNameArSnapshot" TEXT,
    "priceSnapshotCents" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItemOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryWindow" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "daysOfWeek" INTEGER[],
    "minLeadMinutes" INTEGER,
    "minOrderAmountCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderDeliveryZonePricing" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderDeliveryZonePricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductOptionGroup_productId_idx" ON "ProductOptionGroup"("productId");

-- CreateIndex
CREATE INDEX "ProductOptionGroup_isActive_sortOrder_idx" ON "ProductOptionGroup"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductOption_groupId_idx" ON "ProductOption"("groupId");

-- CreateIndex
CREATE INDEX "ProductOption_isActive_sortOrder_idx" ON "ProductOption"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "CartItemOption_cartItemId_idx" ON "CartItemOption"("cartItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItemOption_cartItemId_optionId_key" ON "CartItemOption"("cartItemId", "optionId");

-- CreateIndex
CREATE INDEX "OrderItemOption_orderItemId_idx" ON "OrderItemOption"("orderItemId");

-- CreateIndex
CREATE INDEX "DeliveryWindow_providerId_idx" ON "DeliveryWindow"("providerId");

-- CreateIndex
CREATE INDEX "DeliveryWindow_branchId_idx" ON "DeliveryWindow"("branchId");

-- CreateIndex
CREATE INDEX "DeliveryWindow_isActive_sortOrder_idx" ON "DeliveryWindow"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ProviderDeliveryZonePricing_providerId_idx" ON "ProviderDeliveryZonePricing"("providerId");

-- CreateIndex
CREATE INDEX "ProviderDeliveryZonePricing_zoneId_idx" ON "ProviderDeliveryZonePricing"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderDeliveryZonePricing_providerId_zoneId_key" ON "ProviderDeliveryZonePricing"("providerId", "zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_productId_branchId_optionsHash_key" ON "CartItem"("cartId", "productId", "branchId", "optionsHash");

-- AddForeignKey
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItemOption" ADD CONSTRAINT "CartItemOption_cartItemId_fkey" FOREIGN KEY ("cartItemId") REFERENCES "CartItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItemOption" ADD CONSTRAINT "CartItemOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGroup" ADD CONSTRAINT "OrderGroup_deliveryWindowId_fkey" FOREIGN KEY ("deliveryWindowId") REFERENCES "DeliveryWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryWindowId_fkey" FOREIGN KEY ("deliveryWindowId") REFERENCES "DeliveryWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryWindow" ADD CONSTRAINT "DeliveryWindow_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryWindow" ADD CONSTRAINT "DeliveryWindow_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderDeliveryZonePricing" ADD CONSTRAINT "ProviderDeliveryZonePricing_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderDeliveryZonePricing" ADD CONSTRAINT "ProviderDeliveryZonePricing_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
