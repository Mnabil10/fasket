-- Add couponCode column to carts so we can persist the applied coupon.
ALTER TABLE "Cart" ADD COLUMN "couponCode" TEXT;
