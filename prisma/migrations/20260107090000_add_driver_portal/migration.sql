-- Add DRIVER role and link delivery drivers to user accounts
ALTER TYPE "UserRole" ADD VALUE 'DRIVER';

ALTER TABLE "DeliveryDriver" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "DeliveryDriver_userId_key" ON "DeliveryDriver"("userId");

ALTER TABLE "DeliveryDriver" ADD CONSTRAINT "DeliveryDriver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
