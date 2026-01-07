-- Add delivery timestamps for driver lifecycle
ALTER TABLE "Order" ADD COLUMN "outForDeliveryAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "deliveredAt" TIMESTAMP(3);
