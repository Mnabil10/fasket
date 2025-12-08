-- Add idempotency key to orders for duplicate submission protection
ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key" ON "Order"("userId","idempotencyKey");

-- Improve query/index performance for common lookups
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE INDEX "LoyaltyTransaction_userId_type_createdAt_idx" ON "LoyaltyTransaction"("userId","type","createdAt");
CREATE INDEX "Address_zoneId_idx" ON "Address"("zoneId");
