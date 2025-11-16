-- Add sku column for better catalog management
ALTER TABLE "Product" ADD COLUMN "sku" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Product_sku_key" ON "Product"("sku") WHERE "sku" IS NOT NULL;

-- Improve category/product filtering performance
CREATE INDEX IF NOT EXISTS "Product_categoryId_status_idx" ON "Product"("categoryId", "status");

-- Session logging table
CREATE TABLE IF NOT EXISTS "SessionLog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "device" JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "SessionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "SessionLog_userId_createdAt_idx" ON "SessionLog"("userId", "createdAt");

-- Product stock history
CREATE TABLE IF NOT EXISTS "ProductStockLog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" TEXT NOT NULL,
  "previousStock" INTEGER NOT NULL,
  "newStock" INTEGER NOT NULL,
  "delta" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "ProductStockLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ProductStockLog_productId_createdAt_idx" ON "ProductStockLog"("productId", "createdAt");

-- Audit logs
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "before" JSONB,
  "after" JSONB,
  "ip" TEXT,
  "userAgent" TEXT,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
