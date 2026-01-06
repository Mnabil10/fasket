# Tech Debt and Risks

- Risk: Automation webhook misconfiguration or outages will leave events in FAILED/DEAD and customers/providers may miss notifications. Impact: High. Mitigation: Set `AUTOMATION_WEBHOOK_URL/HMAC/SECRET`, monitor Automation Outbox daily, and alert on FAILED/DEAD counts.
- Risk: Redis outage breaks OTP throttling, login protection, and cache lookups. Impact: High. Mitigation: Run Redis in HA mode, add uptime alerts, and document manual OTP fallback steps.
- Risk: Orders Stuck Watcher scans all orders by status and could slow down as volume grows. Impact: Medium. Mitigation: Keep indexes on `status/updatedAt`, and move watcher to a scheduled worker if volume increases.
- Risk: Distance-based delivery pricing depends on external routing service; fallback uses haversine and may misprice fees/ETA. Impact: Medium. Mitigation: Monitor routing latency/errors and calibrate `ROUTING_FALLBACK_SPEED_KPH`.
- Risk: Profit reports depend on `costPriceCents`; missing COGS leads to inaccurate margins. Impact: Medium. Mitigation: Require cost price in product workflows and audit missing costs weekly.
- Risk: Default branch fallback (`branch_default`) must exist; missing defaults can block order creation for items without branch mapping. Impact: Medium. Mitigation: Ensure each provider has an ACTIVE default branch and run `scripts/bootstrap-marketplace.js` after seeding.
- Risk: Provider onboarding requires active plans; disabled or missing plans will block approvals. Impact: Medium. Mitigation: Keep at least one active plan and validate before approving applications.
- Risk: Telegram-based signup OTP relies on automation delivery; if N8N/Telegram is down, signup sessions fail. Impact: High. Mitigation: Monitor OTP delivery failures and keep SMS fallback ready if needed.
- Risk: Automation outbox retry backlog can grow during outages and increase DB load. Impact: Medium. Mitigation: Periodically replay or purge dead events and monitor queue depth.
- Risk: Backend test suite exists but there is no `npm run test` script or Jest dependency, so automated tests cannot run in CI. Impact: Medium. Mitigation: Add a test script and Jest/ts-jest config, then wire into CI.
- Risk: Reviews rating recalculation runs on every moderation and uses aggregates; high review volume may slow moderation. Impact: Low. Mitigation: Batch recalculations or move to a scheduled task later.
- Risk: Uploads config mistakes (S3 or local base URL) result in broken product images. Impact: High. Mitigation: Validate uploads in staging and verify `LOCAL_UPLOADS_BASE_URL`/S3 credentials.
- Risk: Mobile session refresh failures can strand users in a logged-out state without clear recovery if error messaging regresses. Impact: Low. Mitigation: Keep regression tests on login/refresh flows and error translations.
