import { AdminReportsController } from './reports.controller';

describe('AdminReportsController profit math', () => {
  const prisma = {
    order: {
      findMany: jest.fn(),
    },
  } as any;

  it('computes sales, discounts, delivery, cogs, gross profit, missing costs', async () => {
    const controller = new AdminReportsController(prisma);
    const mockOrders = [
      {
        discountCents: 100,
        loyaltyDiscountCents: 50,
        shippingFeeCents: 200,
        items: [
          { qty: 2, unitPriceCents: 500, unitCostCents: 300, priceSnapshotCents: 500 },
          { qty: 1, unitPriceCents: 400, unitCostCents: 0, priceSnapshotCents: 400 },
        ],
      },
    ];
    prisma.order.findMany.mockResolvedValue(mockOrders);
    const result = await (controller as any).computeRange({
      from: new Date('2025-01-01T00:00:00Z'),
      to: new Date('2025-01-02T00:00:00Z'),
    });
    expect(result.salesCents).toBe(2 * 500 + 400);
    expect(result.discountCents).toBe(150);
    expect(result.deliveryFeeCents).toBe(200);
    expect(result.cogsCents).toBe(2 * 300 + 0);
    const netRevenue = result.salesCents - result.discountCents + result.deliveryFeeCents;
    expect(result.netRevenueCents).toBe(netRevenue);
    expect(result.grossProfitCents).toBe(netRevenue - result.cogsCents);
    expect(result.missingCostCount).toBe(1);
  });
});
