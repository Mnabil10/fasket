const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

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

const parseNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const defaults = {
  deliveryRatePerKmCents: parseNumber(process.env.DEFAULT_DELIVERY_RATE_PER_KM_CENTS, 200),
  minDeliveryFeeCents: parseNumber(process.env.DEFAULT_MIN_DELIVERY_FEE_CENTS, 1000),
  maxDeliveryFeeCents: parseNumber(process.env.DEFAULT_MAX_DELIVERY_FEE_CENTS, 5000),
  planMonthlyAmountCents: parseNumber(process.env.DEFAULT_PLAN_MONTHLY_AMOUNT_CENTS, 0),
  planYearlyAmountCents: parseNumber(process.env.DEFAULT_PLAN_YEARLY_AMOUNT_CENTS, 0),
  planMonthlyCommissionBps: parseNumber(process.env.DEFAULT_PLAN_MONTHLY_COMMISSION_BPS, 500),
  planYearlyCommissionBps: parseNumber(process.env.DEFAULT_PLAN_YEARLY_COMMISSION_BPS, 500),
  planTrialDays: parseNumber(process.env.DEFAULT_PLAN_TRIAL_DAYS, 14),
};

const envBranchLat = parseNumber(process.env.DEFAULT_BRANCH_LAT, Number.NaN);
const envBranchLng = parseNumber(process.env.DEFAULT_BRANCH_LNG, Number.NaN);
const hasEnvBranchLocation = Number.isFinite(envBranchLat) && Number.isFinite(envBranchLng);

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

async function ensureSettings() {
  let settings = await prisma.setting.findFirst();
  if (!settings) {
    settings = await prisma.setting.create({ data: { currency: "EGP" } });
  }
  const updates = {};
  if (settings.deliveryRatePerKmCents == null) {
    updates.deliveryRatePerKmCents = defaults.deliveryRatePerKmCents;
  }
  if (settings.minDeliveryFeeCents == null) {
    updates.minDeliveryFeeCents = defaults.minDeliveryFeeCents;
  }
  if (settings.maxDeliveryFeeCents == null) {
    updates.maxDeliveryFeeCents = defaults.maxDeliveryFeeCents;
  }
  if (Object.keys(updates).length > 0) {
    await prisma.setting.update({ where: { id: settings.id }, data: updates });
    console.log("Updated platform delivery defaults:", updates);
  }
}

async function updateDefaultBranches() {
  let branches = await prisma.branch.findMany({ where: { isDefault: true } });
  if (!branches.length) {
    const fallback = await prisma.branch.findUnique({ where: { id: "branch_default" } });
    if (fallback) branches = [fallback];
  }
  if (!branches.length) {
    console.warn("No default branches found. Skipping branch defaults.");
    return;
  }

  const fallbackAddress = hasEnvBranchLocation
    ? null
    : await prisma.address.findFirst({
        where: { lat: { not: null }, lng: { not: null } },
        orderBy: { createdAt: "desc" },
      });

  for (const branch of branches) {
    const updates = {};
    if (branch.lat == null || branch.lng == null) {
      if (hasEnvBranchLocation) {
        updates.lat = envBranchLat;
        updates.lng = envBranchLng;
      } else if (fallbackAddress?.lat != null && fallbackAddress?.lng != null) {
        updates.lat = fallbackAddress.lat;
        updates.lng = fallbackAddress.lng;
      } else {
        console.warn(`Default branch ${branch.id} has no location; set DEFAULT_BRANCH_LAT/LNG.`);
      }
    }
    if (branch.deliveryRatePerKmCents == null) {
      updates.deliveryRatePerKmCents = defaults.deliveryRatePerKmCents;
    }
    if (branch.minDeliveryFeeCents == null) {
      updates.minDeliveryFeeCents = defaults.minDeliveryFeeCents;
    }
    if (branch.maxDeliveryFeeCents == null) {
      updates.maxDeliveryFeeCents = defaults.maxDeliveryFeeCents;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.branch.update({ where: { id: branch.id }, data: updates });
      console.log(`Updated branch ${branch.id} defaults:`, updates);
    }
  }
}

async function ensurePlan({ code, name, billingInterval, amountCents, commissionRateBps, trialDays }) {
  const existing = await prisma.plan.findUnique({ where: { code } });
  if (existing) return existing;
  return prisma.plan.create({
    data: {
      code,
      name,
      billingInterval,
      amountCents,
      commissionRateBps,
      trialDays,
      currency: "EGP",
      isActive: true,
    },
  });
}

async function ensureSubscriptions(defaultPlan) {
  const providers = await prisma.provider.findMany({ select: { id: true } });
  const now = new Date();
  for (const provider of providers) {
    const existing = await prisma.providerSubscription.findFirst({
      where: { providerId: provider.id, status: { in: ["TRIALING", "ACTIVE"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) continue;

    const trialEndsAt = defaultPlan.trialDays > 0 ? addDays(now, defaultPlan.trialDays) : null;
    const intervalMonths = defaultPlan.billingInterval === "YEARLY" ? 12 : 1;
    const currentPeriodEnd = addMonths(now, intervalMonths);
    const status = trialEndsAt ? "TRIALING" : "ACTIVE";

    await prisma.providerSubscription.create({
      data: {
        providerId: provider.id,
        planId: defaultPlan.id,
        status,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd,
      },
    });
    console.log(`Created ${status} subscription for provider ${provider.id} on plan ${defaultPlan.code}`);
  }
}

async function main() {
  await ensureSettings();
  await updateDefaultBranches();
  const monthlyPlan = await ensurePlan({
    code: "default-monthly",
    name: "Default Monthly",
    billingInterval: "MONTHLY",
    amountCents: defaults.planMonthlyAmountCents,
    commissionRateBps: defaults.planMonthlyCommissionBps,
    trialDays: defaults.planTrialDays,
  });
  await ensurePlan({
    code: "default-yearly",
    name: "Default Yearly",
    billingInterval: "YEARLY",
    amountCents: defaults.planYearlyAmountCents,
    commissionRateBps: defaults.planYearlyCommissionBps,
    trialDays: defaults.planTrialDays,
  });
  await ensureSubscriptions(monthlyPlan);
}

main()
  .catch((error) => {
    console.error("Marketplace bootstrap failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
