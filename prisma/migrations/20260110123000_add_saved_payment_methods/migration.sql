-- Add enum value for wallet payments
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'WALLET';

-- CreateEnum
CREATE TYPE "WalletProvider" AS ENUM ('VODAFONE_CASH', 'ORANGE_MONEY', 'ETISALAT_CASH');

-- CreateTable
CREATE TABLE "SavedPaymentMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PaymentMethod" NOT NULL,
    "provider" TEXT,
    "token" TEXT NOT NULL,
    "last4" TEXT,
    "brand" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "walletProvider" "WalletProvider",
    "walletPhone" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "OrderGroup" ADD COLUMN "paymentMethodId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentMethodId" TEXT;

-- CreateIndex
CREATE INDEX "SavedPaymentMethod_userId_idx" ON "SavedPaymentMethod"("userId");

-- CreateIndex
CREATE INDEX "SavedPaymentMethod_userId_isDefault_idx" ON "SavedPaymentMethod"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "SavedPaymentMethod_type_idx" ON "SavedPaymentMethod"("type");

-- AddForeignKey
ALTER TABLE "SavedPaymentMethod" ADD CONSTRAINT "SavedPaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGroup" ADD CONSTRAINT "OrderGroup_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "SavedPaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "SavedPaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
