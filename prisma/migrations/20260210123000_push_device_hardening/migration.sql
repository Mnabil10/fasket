-- Push device hardening
ALTER TABLE "push_devices"
  ADD COLUMN "deviceId" VARCHAR(64),
  ADD COLUMN "isEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "push_devices_deviceId_idx" ON "push_devices"("deviceId");
CREATE INDEX "push_devices_isEnabled_idx" ON "push_devices"("isEnabled");
