-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "nameAr" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "nameAr" TEXT;

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "storeDescriptionAr" TEXT,
ADD COLUMN     "storeNameAr" TEXT;
