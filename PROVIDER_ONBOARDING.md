# Provider Onboarding

This document describes the provider application lifecycle, approval flow, and plan/commission handling.

## Lifecycle

1) **Application submitted**
   - A merchant submits a provider application (`PENDING`).
2) **Admin review**
   - Admin reviews the application and either approves or rejects it.
3) **Approval**
   - On approval, the system creates/updates the Provider, creates a default Branch, and assigns a Subscription plan.
4) **Active provider**
   - Provider status becomes `ACTIVE` and is eligible to appear in customer apps (subject to branch/product availability).

## Statuses

- Provider status: `PENDING`, `ACTIVE`, `REJECTED`, `SUSPENDED`, `DISABLED`
- Application status: `PENDING`, `APPROVED`, `REJECTED`

## API Endpoints

Public:
- `POST /api/v1/provider-applications`

Admin:
- `GET /api/v1/admin/provider-applications`
- `GET /api/v1/admin/provider-applications/:id`
- `POST /api/v1/admin/provider-applications/:id/approve`
- `POST /api/v1/admin/provider-applications/:id/reject`

## Approval Payload

`POST /api/v1/admin/provider-applications/:id/approve`

```json
{
  "planId": "plan_id",
  "commissionRateBpsOverride": 250,
  "branch": {
    "name": "Main Branch",
    "city": "Cairo",
    "region": "Badr",
    "address": "Street 1",
    "deliveryRadiusKm": 8,
    "deliveryRatePerKmCents": 200,
    "minDeliveryFeeCents": 1000,
    "maxDeliveryFeeCents": 5000,
    "deliveryMode": "PLATFORM"
  }
}
```

## Plan & Commission

- Plans are stored in `Plan` (billing interval, amount, commission rate).
- Providers are attached to a plan via `ProviderSubscription`.
- Optional override: `ProviderSubscription.commissionRateBpsOverride`
  - When present, it takes precedence over the plan commission rate.
- Billing commission ledger entries use the effective commission rate (override over plan).

## Automation Events

Events are emitted via the automation outbox:

- `provider.application_submitted`
- `provider.application_approved`
- `provider.application_rejected`
- `provider.onboarded`

Payload format is defined in `Backend/AUTOMATION_CONTRACT.md`.
