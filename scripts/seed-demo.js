const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const {
  PrismaClient,
  UserRole,
  ProviderStatus,
  ProviderType,
  BranchStatus,
  ProductStatus,
  DeliveryMode,
  OrderStatus,
  PaymentMethod,
  BillingInterval,
  SubscriptionStatus,
  CommissionScope,
  CommissionMode,
  CommissionDiscountRule,
  FeeRecipient,
  PayoutStatus,
  LedgerEntryType,
} = require("@prisma/client");

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
  branchLat: parseNumber(process.env.DEFAULT_BRANCH_LAT, 30.135),
  branchLng: parseNumber(process.env.DEFAULT_BRANCH_LNG, 31.741),
  minDeliveryFeeCents: parseNumber(process.env.DEFAULT_MIN_DELIVERY_FEE_CENTS, 1500),
};

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

async function upsertUser({ phone, name, role, password }) {
  const existing = await prisma.user.findFirst({ where: { phone } });
  if (existing) return existing;
  const hashed = await bcrypt.hash(password, parseNumber(process.env.BCRYPT_ROUNDS, 12));
  return prisma.user.create({
    data: {
      name,
      phone,
      password: hashed,
      role,
    },
  });
}

async function ensureProvider() {
  const slug = "fasket-demo-market";
  const provider =
    (await prisma.provider.findUnique({ where: { slug } })) ||
    (await prisma.provider.create({
      data: {
        name: "Fasket Demo Market",
        slug,
        type: ProviderType.SUPERMARKET,
        status: ProviderStatus.ACTIVE,
        deliveryMode: DeliveryMode.PLATFORM,
        deliveryRatePerKmCents: 200,
        minDeliveryFeeCents: 1500,
        maxDeliveryFeeCents: 5000,
        contactPhone: "+20-100-000-0000",
      },
    }));
  return provider;
}

async function ensureBranch(providerId) {
  const slug = "badr-main-branch";
  const existing = await prisma.branch.findUnique({ where: { slug } });
  if (existing) return existing;
  return prisma.branch.create({
    data: {
      providerId,
      name: "Badr Main Branch",
      slug,
      status: BranchStatus.ACTIVE,
      deliveryMode: DeliveryMode.PLATFORM,
      lat: defaults.branchLat,
      lng: defaults.branchLng,
      deliveryRadiusKm: 12,
      deliveryRatePerKmCents: 200,
      minDeliveryFeeCents: 1500,
      maxDeliveryFeeCents: 5000,
      isDefault: true,
    },
  });
}

async function ensureDeliveryZone() {
  const existing = await prisma.deliveryZone.findFirst({
    where: { nameEn: "Badr City", isActive: true },
  });
  if (existing) return existing;
  return prisma.deliveryZone.create({
    data: {
      nameEn: "Badr City",
      nameAr: "مدينة بدر",
      city: "Badr",
      region: "Cairo",
      feeCents: defaults.minDeliveryFeeCents,
      etaMinutes: 35,
      isActive: true,
    },
  });
}

async function ensureCategories() {
  const categories = [
    { name: "Fresh Produce", nameAr: "الخضروات والفاكهة" },
    { name: "Dairy", nameAr: "الألبان" },
    { name: "Pantry", nameAr: "المعلبات" },
  ];
  const results = [];
  for (const cat of categories) {
    const slug = slugify(cat.name);
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      results.push(existing);
      continue;
    }
    const created = await prisma.category.create({
      data: {
        name: cat.name,
        nameAr: cat.nameAr,
        slug,
        isActive: true,
      },
    });
    results.push(created);
  }
  return results;
}

async function ensureProducts(providerId, categories) {
  const [produce, dairy, pantry] = categories;
  const products = [
    { name: "Bananas", nameAr: "موز", priceCents: 2500, stock: 120, categoryId: produce?.id },
    { name: "Fresh Milk 1L", nameAr: "لبن طازج 1 لتر", priceCents: 3200, stock: 80, categoryId: dairy?.id },
    { name: "Pasta Pack", nameAr: "مكرونة", priceCents: 1800, stock: 150, categoryId: pantry?.id },
  ];

  const results = [];
  for (const item of products) {
    const slug = slugify(item.name);
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (existing) {
      results.push(existing);
      continue;
    }
    const created = await prisma.product.create({
      data: {
        name: item.name,
        nameAr: item.nameAr,
        slug,
        priceCents: item.priceCents,
        stock: item.stock,
        status: ProductStatus.ACTIVE,
        providerId,
        categoryId: item.categoryId ?? null,
        images: [],
      },
    });
    results.push(created);
  }
  return results;
}

async function ensureBranchProducts(branchId, products) {
  for (const product of products) {
    await prisma.branchProduct.upsert({
      where: {
        branchId_productId: {
          branchId,
          productId: product.id,
        },
      },
      update: {
        stock: product.stock ?? 100,
        priceCents: product.priceCents,
        isActive: true,
      },
      create: {
        branchId,
        productId: product.id,
        stock: product.stock ?? 100,
        priceCents: product.priceCents,
        isActive: true,
      },
    });
  }
}

async function ensurePlan() {
  const code = "BASIC";
  const existing = await prisma.plan.findUnique({ where: { code } });
  if (existing) return existing;
  return prisma.plan.create({
    data: {
      code,
      name: "Basic Plan",
      description: "Monthly plan with commission",
      billingInterval: BillingInterval.MONTHLY,
      amountCents: 5000,
      currency: "EGP",
      commissionRateBps: 200,
      trialDays: 14,
      isActive: true,
    },
  });
}

async function ensureSubscription(providerId, planId) {
  const existing = await prisma.providerSubscription.findFirst({
    where: { providerId, status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE] } },
  });
  if (existing) return existing;
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);
  return prisma.providerSubscription.create({
    data: {
      providerId,
      planId,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: end,
    },
  });
}

async function ensureCommissionConfig() {
  const existing = await prisma.commissionConfig.findFirst({
    where: { scope: CommissionScope.PLATFORM },
  });
  if (existing) return existing;
  return prisma.commissionConfig.create({
    data: {
      scope: CommissionScope.PLATFORM,
      mode: CommissionMode.HYBRID,
      minCommissionCents: 0,
      deliveryFeeRecipient: FeeRecipient.PLATFORM,
      gatewayFeeRecipient: FeeRecipient.PLATFORM,
      discountRule: CommissionDiscountRule.AFTER_DISCOUNT,
      payoutHoldDays: 0,
      minimumPayoutCents: 5000,
    },
  });
}

async function ensureNotificationPrefs(providerId) {
  return prisma.providerNotificationPreference.upsert({
    where: { providerId },
    update: {},
    create: {
      providerId,
      preferences: {
        newOrders: { email: true, sms: true, push: true },
        payoutSuccess: { email: true, sms: false, push: true },
        subscriptionExpiry: { email: true, sms: false, push: true },
      },
    },
  });
}

async function ensureDeliveredOrder(provider, branch, customer, product, address, zone) {
  const existing = await prisma.order.findFirst({ where: { code: "DEMO-ORDER-001" } });
  if (existing) return existing;
  const order = await prisma.order.create({
    data: {
      code: "DEMO-ORDER-001",
      userId: customer.id,
      providerId: provider.id,
      branchId: branch.id,
      addressId: address?.id ?? undefined,
      deliveryZoneId: zone?.id ?? undefined,
      deliveryZoneName: zone?.nameEn ?? undefined,
      deliveryMode: DeliveryMode.PLATFORM,
      subtotalCents: 10000,
      shippingFeeCents: 1000,
      discountCents: 0,
      loyaltyDiscountCents: 0,
      totalCents: 11000,
      status: OrderStatus.DELIVERED,
      paymentMethod: PaymentMethod.COD,
      notes: "Demo delivered order",
    },
  });
  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productId: product.id,
      productNameSnapshot: product.name,
      priceSnapshotCents: 10000,
      qty: 1,
    },
  });
  return order;
}

async function ensureOrderFinancials(order, providerId, commissionRateBps) {
  const existing = await prisma.orderFinancials.findUnique({ where: { orderId: order.id } });
  if (existing) return existing;
  const commissionCents = Math.round((order.subtotalCents * commissionRateBps) / 10000);
  const vendorNetCents = order.subtotalCents - commissionCents;
  const platformRevenueCents = commissionCents + order.shippingFeeCents;
  const financials = await prisma.orderFinancials.create({
    data: {
      orderId: order.id,
      providerId,
      currency: "EGP",
      subtotalCents: order.subtotalCents,
      deliveryFeeCents: order.shippingFeeCents,
      discountCents: order.discountCents,
      loyaltyDiscountCents: order.loyaltyDiscountCents,
      taxCents: 0,
      gatewayFeeCents: 0,
      commissionRateBps,
      commissionCents,
      vendorNetCents,
      platformRevenueCents,
      deliveryFeeRecipient: FeeRecipient.PLATFORM,
      gatewayFeeRecipient: FeeRecipient.PLATFORM,
      discountRule: CommissionDiscountRule.AFTER_DISCOUNT,
      settledAt: new Date(),
    },
  });

  await prisma.vendorBalance.upsert({
    where: { providerId },
    update: {
      availableCents: { increment: vendorNetCents },
      lifetimeSalesCents: { increment: order.totalCents },
      lifetimeCommissionCents: { increment: commissionCents },
      lifetimeEarningsCents: { increment: vendorNetCents },
      lastSettlementAt: new Date(),
    },
    create: {
      providerId,
      currency: "EGP",
      availableCents: vendorNetCents,
      pendingCents: 0,
      lifetimeSalesCents: order.totalCents,
      lifetimeCommissionCents: commissionCents,
      lifetimeEarningsCents: vendorNetCents,
      lastSettlementAt: new Date(),
    },
  });

  const existingLedger = await prisma.transactionLedger.findFirst({
    where: { orderId: order.id, type: LedgerEntryType.ORDER_SETTLEMENT },
  });
  if (!existingLedger) {
    await prisma.transactionLedger.create({
      data: {
        providerId,
        orderId: order.id,
        type: LedgerEntryType.ORDER_SETTLEMENT,
        amountCents: vendorNetCents,
        currency: "EGP",
        metadata: { commissionCents, platformRevenueCents },
      },
    });
  }
  return financials;
}

async function ensureDemoPayout(providerId, amountCents) {
  const existing = await prisma.payout.findFirst({ where: { providerId, referenceId: "DEMO-PAYOUT-001" } });
  if (existing) return existing;
  const payout = await prisma.payout.create({
    data: {
      providerId,
      amountCents,
      feeCents: 0,
      currency: "EGP",
      referenceId: "DEMO-PAYOUT-001",
      status: PayoutStatus.PAID,
      processedAt: new Date(),
    },
  });
  await prisma.vendorBalance.update({
    where: { providerId },
    data: {
      availableCents: { decrement: amountCents },
      lastPayoutAt: new Date(),
    },
  });
  await prisma.transactionLedger.create({
    data: {
      providerId,
      payoutId: payout.id,
      type: LedgerEntryType.PAYOUT,
      amountCents: -Math.abs(amountCents),
      currency: "EGP",
    },
  });
  return payout;
}

async function ensureProviderOwner(providerId) {
  const owner = await upsertUser({
    name: "Demo Vendor Owner",
    phone: "+20-100-000-0001",
    role: UserRole.PROVIDER,
    password: "Vendor123!",
  });
  await prisma.providerUser.upsert({
    where: {
      providerId_userId: {
        providerId,
        userId: owner.id,
      },
    },
    update: { role: "OWNER" },
    create: {
      providerId,
      userId: owner.id,
      role: "OWNER",
    },
  });
  return owner;
}

async function ensureAdmin() {
  return upsertUser({
    name: "Demo Admin",
    phone: "+20-100-000-0000",
    role: UserRole.ADMIN,
    password: "Admin123!",
  });
}

async function ensureDriver() {
  const phone = "+20-100-000-0002";
  const user = await upsertUser({
    name: "Demo Driver",
    phone,
    role: UserRole.DRIVER,
    password: "Driver123!",
  });
  const existing = await prisma.deliveryDriver.findFirst({ where: { phone } });
  if (existing) return existing;
  return prisma.deliveryDriver.create({
    data: {
      fullName: "Demo Driver",
      phone,
      nationalId: "DRIVER-DEMO-001",
      isActive: true,
      userId: user.id,
    },
  });
}

async function ensureDriverTwo() {
  const phone = "+20-100-000-0004";
  const user = await upsertUser({
    name: "Demo Driver 2",
    phone,
    role: UserRole.DRIVER,
    password: "Driver456!",
  });
  const existing = await prisma.deliveryDriver.findFirst({ where: { phone } });
  if (existing) return existing;
  return prisma.deliveryDriver.create({
    data: {
      fullName: "Demo Driver 2",
      phone,
      nationalId: "DRIVER-DEMO-002",
      isActive: true,
      userId: user.id,
    },
  });
}

async function ensureCustomer() {
  return upsertUser({
    name: "Demo Customer",
    phone: "+20-100-000-0003",
    role: UserRole.CUSTOMER,
    password: "Customer123!",
  });
}

async function ensureCustomerAddress(userId, zoneId) {
  const existing = await prisma.address.findFirst({ where: { userId } });
  if (existing) return existing;
  return prisma.address.create({
    data: {
      userId,
      zoneId,
      label: "Home",
      city: "Badr",
      street: "Demo Street",
      building: "12",
      apartment: "3A",
      notes: "Demo address",
      lat: defaults.branchLat,
      lng: defaults.branchLng,
      isDefault: true,
    },
  });
}

async function ensureDemoOrder(code, data) {
  const existing = await prisma.order.findUnique({ where: { code } });
  if (existing) return existing;
  return prisma.order.create({ data: { code, ...data } });
}

async function ensureDemoOrders({ customer, address, driver, provider, branch, zone, products }) {
  const itemA = products[0];
  const itemB = products[1];
  if (!itemA || !itemB) return;

  const assignedSubtotal = itemA.priceCents * 2 + itemB.priceCents;
  const assignedTotal = assignedSubtotal + defaults.minDeliveryFeeCents;

  await ensureDemoOrder("DEMO-ORDER-ASSIGNED", {
    userId: customer.id,
    providerId: provider.id,
    branchId: branch.id,
    addressId: address.id,
    deliveryZoneId: zone.id,
    deliveryZoneName: zone.nameEn,
    deliveryMode: DeliveryMode.PLATFORM,
    subtotalCents: assignedSubtotal,
    shippingFeeCents: defaults.minDeliveryFeeCents,
    totalCents: assignedTotal,
    status: OrderStatus.PREPARING,
    paymentMethod: PaymentMethod.COD,
    driverId: driver.id,
    driverAssignedAt: new Date(),
    items: {
      create: [
        {
          productId: itemA.id,
          productNameSnapshot: itemA.name,
          priceSnapshotCents: itemA.priceCents,
          qty: 2,
          unitPriceCents: itemA.priceCents,
          lineTotalCents: itemA.priceCents * 2,
        },
        {
          productId: itemB.id,
          productNameSnapshot: itemB.name,
          priceSnapshotCents: itemB.priceCents,
          qty: 1,
          unitPriceCents: itemB.priceCents,
          lineTotalCents: itemB.priceCents,
        },
      ],
    },
  });

  const unassignedSubtotal = itemB.priceCents;
  const unassignedTotal = unassignedSubtotal + defaults.minDeliveryFeeCents;

  await ensureDemoOrder("DEMO-ORDER-UNASSIGNED", {
    userId: customer.id,
    providerId: provider.id,
    branchId: branch.id,
    addressId: address.id,
    deliveryZoneId: zone.id,
    deliveryZoneName: zone.nameEn,
    deliveryMode: DeliveryMode.PLATFORM,
    subtotalCents: unassignedSubtotal,
    shippingFeeCents: defaults.minDeliveryFeeCents,
    totalCents: unassignedTotal,
    status: OrderStatus.CONFIRMED,
    paymentMethod: PaymentMethod.COD,
    items: {
      create: [
        {
          productId: itemB.id,
          productNameSnapshot: itemB.name,
          priceSnapshotCents: itemB.priceCents,
          qty: 1,
          unitPriceCents: itemB.priceCents,
          lineTotalCents: itemB.priceCents,
        },
      ],
    },
  });
}

async function main() {
  await ensureAdmin();
  const provider = await ensureProvider();
  const branch = await ensureBranch(provider.id);
  const zone = await ensureDeliveryZone();
  const categories = await ensureCategories();
  const products = await ensureProducts(provider.id, categories);
  await ensureBranchProducts(branch.id, products);
  await ensureProviderOwner(provider.id);
  const plan = await ensurePlan();
  const subscription = await ensureSubscription(provider.id, plan.id);
  await ensureCommissionConfig();
  await ensureNotificationPrefs(provider.id);
  const driver = await ensureDriver();
  await ensureDriverTwo();
  const customer = await ensureCustomer();
  const address = await ensureCustomerAddress(customer.id, zone.id);
  await ensureDemoOrders({ customer, address, driver, provider, branch, zone, products });
  if (products[0]) {
    const deliveredOrder = await ensureDeliveredOrder(provider, branch, customer, products[0], address, zone);
    const commissionRateBps =
      subscription?.commissionRateBpsOverride ?? subscription?.plan?.commissionRateBps ?? plan.commissionRateBps ?? 0;
    await ensureOrderFinancials(deliveredOrder, provider.id, commissionRateBps);
    await ensureDemoPayout(provider.id, 5000);
  }
  console.log("Demo seed data ready.");
}

main()
  .catch((error) => {
    console.error("Demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
