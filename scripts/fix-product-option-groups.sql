BEGIN;

-- Remove legacy join table if it exists.
DROP TABLE IF EXISTS "_ProductToProductOptionGroup";

-- Ensure the Prisma join table exists.
CREATE TABLE IF NOT EXISTS "_ProductOptionGroups" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "_ProductOptionGroups_AB_unique"
    ON "_ProductOptionGroups"("A", "B");
CREATE INDEX IF NOT EXISTS "_ProductOptionGroups_B_index"
    ON "_ProductOptionGroups"("B");

ALTER TABLE "_ProductOptionGroups" DROP CONSTRAINT IF EXISTS "_ProductOptionGroups_A_fkey";
ALTER TABLE "_ProductOptionGroups" DROP CONSTRAINT IF EXISTS "_ProductOptionGroups_B_fkey";
ALTER TABLE "_ProductOptionGroups"
    ADD CONSTRAINT "_ProductOptionGroups_A_fkey"
    FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProductOptionGroups"
    ADD CONSTRAINT "_ProductOptionGroups_B_fkey"
    FOREIGN KEY ("B") REFERENCES "ProductOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate legacy productId links into the new join table, if the column still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ProductOptionGroup'
      AND column_name = 'productId'
  ) THEN
    INSERT INTO "_ProductOptionGroups" ("A", "B")
    SELECT "productId", "id"
    FROM "ProductOptionGroup"
    WHERE "productId" IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

ALTER TABLE "ProductOptionGroup" DROP CONSTRAINT IF EXISTS "ProductOptionGroup_productId_fkey";
DROP INDEX IF EXISTS "ProductOptionGroup_productId_idx";
ALTER TABLE "ProductOptionGroup" DROP COLUMN IF EXISTS "productId";

COMMIT;
