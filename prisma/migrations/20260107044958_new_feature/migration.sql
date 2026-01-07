-- DropForeignKey
ALTER TABLE IF EXISTS "OrderFinancials" DROP CONSTRAINT IF EXISTS "OrderFinancials_orderId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "OrderFinancials" DROP CONSTRAINT IF EXISTS "OrderFinancials_providerId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Payout" DROP CONSTRAINT IF EXISTS "Payout_providerId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "ProviderNotificationPreference" DROP CONSTRAINT IF EXISTS "ProviderNotificationPreference_providerId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "TransactionLedger" DROP CONSTRAINT IF EXISTS "TransactionLedger_providerId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "VendorBalance" DROP CONSTRAINT IF EXISTS "VendorBalance_providerId_fkey";

-- CreateIndex
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'DeliveryDriver' AND column_name = 'userId'
  ) THEN
    CREATE INDEX IF NOT EXISTS "DeliveryDriver_userId_idx" ON "DeliveryDriver"("userId");
  END IF;
END$$;

-- CreateIndex
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'OrderFinancials'
  ) THEN
    CREATE INDEX IF NOT EXISTS "OrderFinancials_orderId_idx" ON "OrderFinancials"("orderId");
  END IF;
END$$;

-- AddForeignKey
ALTER TABLE IF EXISTS "OrderFinancials" ADD CONSTRAINT "OrderFinancials_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "OrderFinancials" ADD CONSTRAINT "OrderFinancials_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "VendorBalance" ADD CONSTRAINT "VendorBalance_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Payout" ADD CONSTRAINT "Payout_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "TransactionLedger" ADD CONSTRAINT "TransactionLedger_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "ProviderNotificationPreference" ADD CONSTRAINT "ProviderNotificationPreference_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
