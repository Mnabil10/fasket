-- CreateEnum
CREATE TYPE "ProductOptionGroupPriceMode" AS ENUM ('ADD', 'SET');

-- AlterTable
ALTER TABLE "ProductOptionGroup" ADD COLUMN     "priceMode" "ProductOptionGroupPriceMode" NOT NULL DEFAULT 'ADD';
