-- DropForeignKey
ALTER TABLE "OrderFinancials" DROP CONSTRAINT "OrderFinancials_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderFinancials" DROP CONSTRAINT "OrderFinancials_providerId_fkey";

-- DropForeignKey
ALTER TABLE "Payout" DROP CONSTRAINT "Payout_providerId_fkey";

-- DropForeignKey
ALTER TABLE "ProviderNotificationPreference" DROP CONSTRAINT "ProviderNotificationPreference_providerId_fkey";

-- DropForeignKey
ALTER TABLE "TransactionLedger" DROP CONSTRAINT "TransactionLedger_providerId_fkey";

-- DropForeignKey
ALTER TABLE "VendorBalance" DROP CONSTRAINT "VendorBalance_providerId_fkey";

-- CreateIndex
CREATE INDEX "DeliveryDriver_userId_idx" ON "DeliveryDriver"("userId");

-- CreateIndex
CREATE INDEX "OrderFinancials_orderId_idx" ON "OrderFinancials"("orderId");

-- AddForeignKey
ALTER TABLE "OrderFinancials" ADD CONSTRAINT "OrderFinancials_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFinancials" ADD CONSTRAINT "OrderFinancials_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBalance" ADD CONSTRAINT "VendorBalance_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLedger" ADD CONSTRAINT "TransactionLedger_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderNotificationPreference" ADD CONSTRAINT "ProviderNotificationPreference_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
