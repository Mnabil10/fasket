# Launch Checklist (Badr City Soft Launch)

## Pre-flight (one-time before launch)
- Database is reachable and backed up (PostgreSQL 14+).
- Migrations are applied: `npx prisma migrate deploy`.
- Redis is running (required for OTP, auth throttling, caching).
- `.env` is updated from `.env.example` and secrets are set:
  - Auth: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SIGNUP_SESSION_SECRET`, `OTP_SECRET`.
  - Automation: `AUTOMATION_WEBHOOK_URL`, `AUTOMATION_HMAC_SECRET`, `AUTOMATION_WEBHOOK_SECRET`.
  - Uploads: `UPLOADS_DRIVER` + S3/LOCAL fields.
  - Ops: `ORDER_STUCK_*` thresholds, `SENTRY_DSN` (optional but recommended).
- Storage is ready (local uploads or S3 bucket).
- Bootstrap defaults are seeded (run once): `node scripts/bootstrap-marketplace.js`.
- Admin user account exists and can log into Admin Web.

## Backoffice / Admin setup (ops tasks)
- Delivery zones are created and marked Active (zone name, fee, ETA, min order).
- Delivery pricing is verified (platform fees, distance pricing if enabled).
- Subscription plans are configured (monthly/yearly, commission rates, trial days).
- Provider onboarding is ready:
  - Decide which categories to accept (supermarket, restaurant, pharmacy).
  - Confirm approval workflow and rejection reasons.
- Seed at least one provider of each type:
  - Supermarket, Restaurant, Pharmacy.
  - Each provider has one active branch with a delivery mode and location.
- Products and categories are uploaded for each provider (with images).
- Reviews moderation policy is defined (who approves/rejects and how fast).
- Automation Outbox is monitored (Admin > Automation Outbox page visible).

## Manual customer flows to test
- New user: register/login with OTP, add address, place COD order, track, and submit a review.
- Returning user: re-open app after token expiration and re-authenticate smoothly.
- Edge cases:
  - No providers in the user area.
  - Provider disabled or temporarily inactive.
  - Out-of-stock product in cart.
  - API error shows a friendly message (no blank screens).

## Manual provider flows to test
- Provider application submitted, approved, and appears in Providers list.
- Default branch auto-created on approval with correct delivery mode and fees.
- Provider status changes (ACTIVE, SUSPENDED, DISABLED) take effect in customer app.
- Orders can move through the full lifecycle without invalid transitions.

## Monitoring & logs
- API health check: `GET /api/v1/system/health` returns success.
- Automation Outbox shows event status and retries.
- Orders Stuck Watcher is enabled and visible in Admin Ops page.
- Error logging is active (Sentry if configured).
- Audit logs exist for order status changes, reviews, and onboarding approvals.

## Minimal test commands
- Backend tests: `cd Backend && npm run test`
- Admin build: `cd admin-web && npm run build`
- Mobile build (web): `cd mobileapp && npm run build`
