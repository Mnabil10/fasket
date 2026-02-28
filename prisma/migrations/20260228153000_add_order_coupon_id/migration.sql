-- Persist coupon foreign key on orders for historical tracking
ALTER TABLE "Order"
  ADD COLUMN "couponId" TEXT;

UPDATE "Order" AS o
SET "couponId" = c."id"
FROM "Coupon" AS c
WHERE o."couponId" IS NULL
  AND o."couponCode" IS NOT NULL
  AND o."couponCode" = c."code";

CREATE INDEX "Order_couponId_idx" ON "Order"("couponId");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "Coupon"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
