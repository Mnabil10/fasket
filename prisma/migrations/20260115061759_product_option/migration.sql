/*
  Warnings:

  - You are about to drop the `_ProductToProductOptionGroup` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_ProductToProductOptionGroup" DROP CONSTRAINT "_ProductToProductOptionGroup_A_fkey";

-- DropForeignKey
ALTER TABLE "_ProductToProductOptionGroup" DROP CONSTRAINT "_ProductToProductOptionGroup_B_fkey";

-- DropTable
DROP TABLE "_ProductToProductOptionGroup";

-- CreateTable
CREATE TABLE "_ProductOptionGroups" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_ProductOptionGroups_AB_unique" ON "_ProductOptionGroups"("A", "B");

-- CreateIndex
CREATE INDEX "_ProductOptionGroups_B_index" ON "_ProductOptionGroups"("B");

-- AddForeignKey
ALTER TABLE "_ProductOptionGroups" ADD CONSTRAINT "_ProductOptionGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductOptionGroups" ADD CONSTRAINT "_ProductOptionGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
