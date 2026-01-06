# Automation Event Contract (v1.0)

All events are delivered as JSON with HMAC-SHA256 signature over `"{timestamp}.{body}"`, headers:
- `x-fasket-event`: event type
- `x-fasket-id`: event id
- `x-fasket-timestamp`: unix seconds
- `x-fasket-signature`: hex digest
- `x-fasket-attempt`: delivery attempt (1+)
- `x-fasket-spec-version`: `1.0`

## Common envelope
```json
{
  "event_id": "uuid",
  "event_type": "order.status_changed",
  "occurred_at": "2025-12-13T02:30:00.000Z",
  "correlation_id": "corr-id",
  "version": "1.0",
  "dedupe_key": "order:123:CONFIRMED:history-abc",
  "attempt": 1,
  "data": { /* payload per type */ }
}
```

## Event payloads

- `order.created` / `order.confirmed` / `order.preparing` / `order.out_for_delivery` / `order.delivered` / `order.canceled`
  - `order_id`, `order_code`, `status`, `status_internal`, `customer_phone`, `total_cents`,
    `payment_method`, `items[] { name, qty }`, `items_summary`, `delivery_zone { id, name }`,
    `eta_minutes`, `estimated_delivery_time`, `driver { id, name, phone }`, `address { label, city, street, building, apartment, zone_id }`

- `order.status_changed`
  - All `order.*` fields above plus:
  - `from_status`, `to_status`, `from_internal`, `to_internal`, `actor_id`, `history_id`, `changed_at`

- `provider.application_submitted` / `provider.application_approved` / `provider.application_rejected` / `provider.onboarded`
  - `application_id`, `application_status`, `provider_id`, `provider_status`, `business_name`, `provider_type`, `city`, `region`,
    `owner_name`, `phone`, `email`, `delivery_mode`, `plan_id`, `plan_code`, `commission_rate_bps`,
    `submitted_at`, `reviewed_at`, `updated_at`

- `auth.otp.requested`
  - `phone`, `otpId`, `purpose`, `expiresInSeconds`, `channel`, `requestId`

- `auth.otp.verified`
  - `phone`, `otpId`, `purpose`, `requestId`

> OTP values are only sent to delivery webhooks; outbox payloads intentionally omit the raw OTP to avoid storing secrets in the database.

- `auth.password_reset.requested`
  - `phone`, `otpId`

- `auth.password_reset.completed`
  - `phone`, `userId`

- `support.order_status.requested`
  - `phone`, `orderCode`, `results`

- `ops.automation_misconfigured`
  - `event_id`, `missing_webhook`, `missing_hmac`, `node_env`, `occurred_at`

- `ops.automation_delivery_failed`
  - `event_id`, `event_type`, `attempts`, `last_status`, `correlation_id`

- `ops.order_stuck`
  - `order_id`, `order_code`, `status`, `status_internal`, `threshold_minutes`, `age_minutes`, `customer_phone`, `total_cents`, `delivery_zone { id, name }`, `updated_at`

## Replay
- Admin replay endpoints:
  - `POST /api/v1/admin/automation/events/:id/replay`
  - `POST /api/v1/admin/automation/replay` (bulk by status/type/date)

## Dedupe
- Unique on `(type, dedupeKey)`.
- Deterministic defaults:
  - Orders: `order:{orderId}:{status}:{historyId|changed_at}`
  - Ops: `ops:{type}:{entity}:{bucket}`
  - Auth: `auth:{phoneHash}:{purpose}:{otpId}`
