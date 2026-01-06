-- Align order status lifecycle (PROCESSING -> CONFIRMED, add PREPARING)
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";

CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELED');

ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus"
USING (
  CASE
    WHEN "status"::text = 'PROCESSING' THEN 'CONFIRMED'
    ELSE "status"::text
  END
)::"OrderStatus";

ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "OrderStatusHistory" ALTER COLUMN "from" TYPE "OrderStatus"
USING (
  CASE
    WHEN "from" IS NULL THEN NULL
    WHEN "from"::text = 'PROCESSING' THEN 'CONFIRMED'
    ELSE "from"::text
  END
)::"OrderStatus";

ALTER TABLE "OrderStatusHistory" ALTER COLUMN "to" TYPE "OrderStatus"
USING (
  CASE
    WHEN "to"::text = 'PROCESSING' THEN 'CONFIRMED'
    ELSE "to"::text
  END
)::"OrderStatus";

DROP TYPE "OrderStatus_old";
