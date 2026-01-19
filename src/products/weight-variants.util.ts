import { Prisma, ProductOptionGroupPriceMode, ProductOptionGroupType } from '@prisma/client';

type WeightVariant = {
  weightKg: number;
  name: string;
  nameAr: string;
  sortOrder: number;
};

const WEIGHT_GROUP = { name: 'Weight', nameAr: 'الوزن' };
const WEIGHT_VARIANTS: WeightVariant[] = [
  { weightKg: 0.25, name: '0.25kg', nameAr: 'ربع كيلو', sortOrder: 0 },
  { weightKg: 0.5, name: '0.5kg', nameAr: 'نص كيلو', sortOrder: 1 },
  { weightKg: 1, name: '1kg', nameAr: 'كيلو', sortOrder: 2 },
];

export function roundWeightPriceCents(value: number) {
  return Math.round(value);
}

export function buildWeightOptions(pricePerKgCents: number) {
  return WEIGHT_VARIANTS.map((variant) => ({
    ...variant,
    priceCents: roundWeightPriceCents(pricePerKgCents * variant.weightKg),
    maxQtyPerOption: 1,
    isActive: true,
  }));
}

export async function syncWeightOptionGroup(
  client: Prisma.TransactionClient,
  productId: string,
  pricePerKgCents: number,
) {
  const options = buildWeightOptions(pricePerKgCents);
  const group = await client.productOptionGroup.findFirst({
    where: {
      products: { some: { id: productId } },
      type: ProductOptionGroupType.SINGLE,
      priceMode: ProductOptionGroupPriceMode.SET,
      OR: [{ name: WEIGHT_GROUP.name }, { nameAr: WEIGHT_GROUP.nameAr }],
    },
    include: { options: true },
  });

  if (!group) {
    return client.productOptionGroup.create({
      data: {
        name: WEIGHT_GROUP.name,
        nameAr: WEIGHT_GROUP.nameAr,
        type: ProductOptionGroupType.SINGLE,
        priceMode: ProductOptionGroupPriceMode.SET,
        minSelected: 1,
        maxSelected: 1,
        sortOrder: 0,
        isActive: true,
        products: { connect: { id: productId } },
        options: {
          create: options.map((opt) => ({
            name: opt.name,
            nameAr: opt.nameAr,
            priceCents: opt.priceCents,
            maxQtyPerOption: opt.maxQtyPerOption,
            sortOrder: opt.sortOrder,
            isActive: true,
          })),
        },
      },
    });
  }

  if (group.isActive === false) {
    await client.productOptionGroup.update({
      where: { id: group.id },
      data: { isActive: true, minSelected: 1, maxSelected: 1, priceMode: ProductOptionGroupPriceMode.SET },
    });
  }

  const existing = group.options ?? [];
  const lookup = new Map<string, typeof existing[number]>();
  existing.forEach((opt) => {
    lookup.set(opt.name.toLowerCase(), opt);
    if (opt.nameAr) lookup.set(opt.nameAr, opt);
  });

  for (const option of options) {
    const match = lookup.get(option.name.toLowerCase()) ?? lookup.get(option.nameAr);
    if (match) {
      const update: Prisma.ProductOptionUpdateInput = {};
      if (match.priceCents !== option.priceCents) update.priceCents = option.priceCents;
      if (match.sortOrder !== option.sortOrder) update.sortOrder = option.sortOrder;
      if (Object.keys(update).length) {
        await client.productOption.update({ where: { id: match.id }, data: update });
      }
      continue;
    }
    await client.productOption.create({
      data: {
        groupId: group.id,
        name: option.name,
        nameAr: option.nameAr,
        priceCents: option.priceCents,
        maxQtyPerOption: option.maxQtyPerOption,
        sortOrder: option.sortOrder,
        isActive: true,
      },
    });
  }
}

export async function disableWeightOptionGroup(client: Prisma.TransactionClient, productId: string) {
  const group = await client.productOptionGroup.findFirst({
    where: {
      products: { some: { id: productId } },
      type: ProductOptionGroupType.SINGLE,
      priceMode: ProductOptionGroupPriceMode.SET,
      OR: [{ name: WEIGHT_GROUP.name }, { nameAr: WEIGHT_GROUP.nameAr }],
    },
    select: { id: true, isActive: true },
  });
  if (!group || group.isActive === false) return;
  await client.productOptionGroup.update({
    where: { id: group.id },
    data: { isActive: false, minSelected: 0 },
  });
}

