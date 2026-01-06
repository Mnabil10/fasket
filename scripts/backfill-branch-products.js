const fs = require("fs");
const path = require("path");
const { PrismaClient, ProductStatus } = require("@prisma/client");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (!key || key in process.env) return;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

const repoRoot = path.resolve(__dirname, "..");
loadEnvFile(path.join(repoRoot, ".env"));

const prisma = new PrismaClient();

async function main() {
  const providers = await prisma.provider.findMany({
    select: {
      id: true,
      name: true,
      branches: {
        where: { status: "ACTIVE" },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        take: 1,
        select: { id: true, isDefault: true },
      },
    },
  });

  let totalCreated = 0;
  for (const provider of providers) {
    const branch = provider.branches[0];
    if (!branch) {
      console.warn(`Provider ${provider.id} has no active branches. Skipping.`);
      continue;
    }

    const products = await prisma.product.findMany({
      where: {
        providerId: provider.id,
        deletedAt: null,
        status: ProductStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!products.length) continue;

    const existing = await prisma.branchProduct.findMany({
      where: {
        branchId: branch.id,
        productId: { in: products.map((p) => p.id) },
      },
      select: { productId: true },
    });
    const existingIds = new Set(existing.map((row) => row.productId));
    const missing = products.filter((p) => !existingIds.has(p.id));
    if (!missing.length) continue;

    const result = await prisma.branchProduct.createMany({
      data: missing.map((p) => ({
        branchId: branch.id,
        productId: p.id,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    totalCreated += result.count;
    console.log(
      `Provider ${provider.name || provider.id}: added ${result.count} branch products to ${branch.id}`
    );
  }

  console.log(`Backfill complete. Created ${totalCreated} branch products.`);
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
