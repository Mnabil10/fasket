-- Add delivery terms and service fee tracking
ALTER TABLE "OrderGroup" ADD COLUMN "deliveryTermsAccepted" BOOLEAN;
ALTER TABLE "OrderGroup" ADD COLUMN "serviceFeeCents" INTEGER;

ALTER TABLE "Order" ADD COLUMN "deliveryTermsAccepted" BOOLEAN;
ALTER TABLE "Order" ADD COLUMN "serviceFeeCents" INTEGER;

ALTER TABLE "OrderFinancials" ADD COLUMN "serviceFeeCents" INTEGER NOT NULL DEFAULT 0;
