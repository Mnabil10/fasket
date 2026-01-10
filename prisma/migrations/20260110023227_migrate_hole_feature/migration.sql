-- DropForeignKey
ALTER TABLE "OrderFinancials" DROP CONSTRAINT "OrderFinancials_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderFinancials" DROP CONSTRAINT "OrderFinancials_providerId_fkey";

-- DropForeignKey
ALTER TABLE "Payout" DROP CONSTRAINT "Payout_providerId_fkey";

-- DropForeignKey
ALTER TABLE "ProviderNotificationPreference" DROP CONSTRAINT "ProviderNotificationPreference_providerId_fkey";

-- DropForeignKey
ALTER TABLE "SupportMessage" DROP CONSTRAINT "SupportMessage_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "TransactionLedger" DROP CONSTRAINT "TransactionLedger_providerId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "UserNotificationPreference" DROP CONSTRAINT IF EXISTS "UserNotificationPreference_userId_fkey";

-- DropForeignKey
ALTER TABLE "VendorBalance" DROP CONSTRAINT "VendorBalance_providerId_fkey";

-- AlterTable
ALTER TABLE "SupportConversation" ALTER COLUMN "lastMessageAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SupportMessage" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE IF EXISTS "UserNotificationPreference" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WhatsAppMessageLog" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeliveryDriver_userId_idx" ON "DeliveryDriver"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderFinancials_orderId_idx" ON "OrderFinancials"("orderId");

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE IF EXISTS "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
