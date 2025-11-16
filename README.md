# Fasket Backend Enhancements

Modernized NestJS + Prisma backend for the Fasket grocery platform. The refactor focuses on security, consistency, media handling, observability, and operational tooling so the API can scale safely.

## Highlights

- **Validation & Sanitization** - Global sanitizing pipe plus DTO decorators keep inputs clean, trimmed, and XSS-free. Global `ValidationPipe` enforces whitelist + transform across every route.
- **RBAC & Auth Hardening** - Admin/staff/customer role guards, brute-force login detection backed by Redis, and session logging with device fingerprints.
- **Caching Layer** - Redis-backed caching for public categories, product lists, and home sections with automatic invalidation on create/update/delete.
- **Media Pipeline** - `UploadsService` validates headers, optimizes assets with Sharp, converts to WebP, and emits multiple sizes while cleaning up replaced files.
- **Bulk Upload 2.0** - Excel/CSV parser now supports row-level error codes, duplicate detection, category auto-mapping, and automatic slug/SKU generation with stock audit logging.
- **Observability** - Pino structured logging, request correlation IDs, Sentry integration, and consistent `{ success/data/error }` response envelopes.
- **Security** - Helmet, optional HTTPS enforcement, restrictive CORS, rate limiting, throttled login/register endpoints, and MIME validation across uploads.

## Getting Started

```bash
npm install
cp .env.example .env   # update secrets
npm run prisma:generate
npm run start:dev
```

### Required Services
- PostgreSQL 14+
- Redis (for cache + auth rate limiting)
- Optional S3-compatible storage when `UPLOADS_DRIVER=s3`

## Configuration

All tunables live in `.env`. Key additions:

| Variable | Description |
| --- | --- |
| `API_PREFIX` | Base REST prefix (`api`). Do **not** include `/v1`; versioning is added automatically. |
| `ENFORCE_HTTPS` | `true` to reject non-HTTPS requests (useful behind load balancers). |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins (`regex:` supported). |
| `REDIS_URL` / `CACHE_*_TTL` | Redis connection + TTLs for different caches. |
| `AUTH_BRUTE_*` | Threshold + TTL for login attempt limiter. |
| `SENTRY_*` | DSN and sampling rates for error/profiling telemetry. |
| `UPLOADS_*` | Driver choice (`s3`, `local`, `inline`), allowed MIME types, max bytes, S3 bucket info, local base URL. |

See `.env.example` for the full list.

## Architecture Notes

- **Versioned Controllers** - All public + admin controllers opt-in to Nest's URI versioning, so both `/api/v1/...` and `/api/v2/...` resolve to the same handlers until v2 diverges.
- **Request Context** - `RequestContextService` uses `AsyncLocalStorage` to propagate correlation IDs, IP, UA, and user IDs to services (audit logging, product stock logs, etc).
- **Response Formatting** - `ResponseInterceptor` wraps every success reply in `{ success, data, correlationId }` while `AllExceptionsFilter` normalizes error envelopes and notifies Sentry for 5xx responses.
- **Caching** - `ProductsService` and `CategoriesService` consult Redis first; `CacheInvalidationService` wipes relevant keys when products/categories/home sections mutate.
- **Audit & Stock Logs** - `AuditLog` captures who changed what, while `ProductStockLog` records every stock delta (admin edits, bulk import, checkout flows).

## Bulk Upload Contracts

1. Accepts `.xlsx` or `.csv` template downloaded from `/admin/products/bulk-template`.
2. Required columns now include `sku` (auto-generated if blank).
3. Row-level validation errors include machine-readable codes (`VALIDATION_ERROR`, `CATEGORY_NOT_FOUND`, `DUPLICATE_ROW`, etc.).
4. Duplicate slugs/SKUs inside the same sheet are skipped without halting the batch.
5. Category slugs are auto-resolved; missing slugs/sku fields are generated on the fly.
6. Each update/create triggers cache invalidation and stock audit entries.

## Media Upload Workflow

1. Controllers always use in-memory Multer storage; `UploadsService` handles persistence.
2. Files are validated against `UPLOAD_ALLOWED_MIME` and max size.
3. Sharp converts assets to WebP, producing original, medium, and thumbnail sizes (products) or a single optimized image (categories/other).
4. Old assets are deleted when replacements are uploaded.
5. For S3 drivers, presigned URLs remain supported via `/admin/uploads/signed-url`.

## Logging & Monitoring

- `nestjs-pino` streams structured logs, keyed by correlation ID.
- Sentry captures uncaught exceptions and profile samples (configure DSN to enable).
- Session logs store device fingerprints for every successful login.

## Testing & Verification

Recommended checks before pushing:

```bash
npm run lint
npm run build
```

### Manual smoke checklist
- Hit `/api/v1/system/health` - expect `{ success: true, ... }`.
- Create/list products & categories via admin routes - new slugs/SKUs should generate automatically.
- Upload images (product/category/admin upload) - confirm WebP conversion + additional sizes.
- Run bulk import with valid & invalid rows to observe row-level error codes.
- Exercise login with wrong password > max attempts to trigger brute-force lock.
- Confirm Redis caches populate and invalidate on create/update/delete.

---

For deeper debugging enable `NODE_ENV=development` to get colorized logs and relaxed CORS in local builds. Contributions should maintain the response envelope + audit logging conventions introduced here.
