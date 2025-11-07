-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cartId" TEXT,
ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Setting" ALTER COLUMN "currency" SET DEFAULT 'EGP';

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
