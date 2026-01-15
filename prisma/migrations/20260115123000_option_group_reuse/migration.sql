-- Migrate existing links
INSERT INTO "_ProductOptionGroups" ("A", "B")
SELECT "productId", "id" FROM "ProductOptionGroup" WHERE "productId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "ProductOptionGroup" DROP CONSTRAINT IF EXISTS "ProductOptionGroup_productId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "ProductOptionGroup_productId_idx";

-- AlterTable
ALTER TABLE "ProductOptionGroup" DROP COLUMN IF EXISTS "productId";
