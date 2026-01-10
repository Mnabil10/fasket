-- Add delivery failed status + failure metadata
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";

CREATE TYPE "OrderStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
  'DELIVERED',
  'CANCELED'
);

ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus"
USING ("status"::text)::"OrderStatus";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "OrderStatusHistory" ALTER COLUMN "from" TYPE "OrderStatus"
USING (
  CASE
    WHEN "from" IS NULL THEN NULL
    ELSE "from"::text
  END
)::"OrderStatus";
ALTER TABLE "OrderStatusHistory" ALTER COLUMN "to" TYPE "OrderStatus"
USING ("to"::text)::"OrderStatus";

DROP TYPE "OrderStatus_old";

CREATE TYPE "DeliveryFailureReason" AS ENUM (
  'NO_ANSWER',
  'WRONG_ADDRESS',
  'UNSAFE_LOCATION',
  'CUSTOMER_REQUESTED_RESCHEDULE'
);

ALTER TABLE "Order" ADD COLUMN "deliveryFailedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "deliveryFailedReason" "DeliveryFailureReason";
ALTER TABLE "Order" ADD COLUMN "deliveryFailedNote" TEXT;
