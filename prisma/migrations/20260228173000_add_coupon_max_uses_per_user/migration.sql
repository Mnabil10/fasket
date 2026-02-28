-- Add per-customer coupon usage cap
ALTER TABLE "Coupon"
  ADD COLUMN "maxUsesPerUser" INTEGER;
