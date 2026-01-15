-- CreateTable
CREATE TABLE "_ProductToProductOptionGroup" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_ProductToProductOptionGroup_AB_unique" ON "_ProductToProductOptionGroup"("A", "B");
CREATE INDEX "_ProductToProductOptionGroup_B_index" ON "_ProductToProductOptionGroup"("B");

-- AddForeignKey
ALTER TABLE "_ProductToProductOptionGroup" ADD CONSTRAINT "_ProductToProductOptionGroup_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProductToProductOptionGroup" ADD CONSTRAINT "_ProductToProductOptionGroup_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing links
INSERT INTO "_ProductToProductOptionGroup" ("A", "B")
SELECT "productId", "id" FROM "ProductOptionGroup" WHERE "productId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "ProductOptionGroup" DROP CONSTRAINT "ProductOptionGroup_productId_fkey";

-- DropIndex
DROP INDEX "ProductOptionGroup_productId_idx";

-- AlterTable
ALTER TABLE "ProductOptionGroup" DROP COLUMN "productId";
