# QA Smoke Scenarios

## Customer

### C1 - New user registration + OTP (EN + AR)
Steps:
1) Open the app, set language to English.
2) Register with name, phone, and password.
3) Request OTP and enter the code.
4) Switch to Arabic and verify the same screen labels.
Expected:
- OTP is delivered and accepted; user is signed in.
- Arabic labels render correctly (no placeholders or broken text).

### C2 - Add address and place COD order
Steps:
1) Add a new address with delivery zone, street, and notes.
2) Browse providers, open a provider, add items to cart.
3) Proceed to checkout and place a Cash on Delivery order.
Expected:
- Address saved and marked as default if it is the first address.
- Delivery fee and ETA are shown.
- Order is created successfully and appears in Orders list.

### C3 - Track order status through full lifecycle
Steps:
1) Open Orders list and select the latest order.
2) Observe status updates as admin moves the order (PENDING -> CONFIRMED -> PREPARING -> OUT_FOR_DELIVERY -> DELIVERED).
Expected:
- Status labels update correctly and match backend status.
- Timeline shows the correct sequence.

### C4 - Leave a review after delivery
Steps:
1) Open a DELIVERED order.
2) Submit a rating and optional comment.
Expected:
- Review submission succeeds.
- Review status is PENDING until admin moderation.

### C5 - Returning user with expired session
Steps:
1) Log in, then wait for token expiration or simulate refresh failure.
2) Open the app and navigate to Orders.
Expected:
- User is prompted to re-authenticate gracefully.
- No blank screen or crash.

### C6 - Failure cases
Steps:
1) Attempt checkout with an empty cart.
2) Try selecting a zone that is inactive.
3) Trigger an API failure (disable network) and retry.
Expected:
- Clear error messages are shown.
- Retry controls are visible.

## Admin / Ops

### A1 - Provider applications approval flow
Steps:
1) Open Provider Applications and view PENDING list.
2) Approve an application with a plan and branch details.
3) Reject another application with a reason.
Expected:
- Approved application creates Provider + Branch + Subscription.
- Rejected application shows rejection reason.
- Approved provider appears in Providers list.

### A2 - Orders management lifecycle
Steps:
1) Filter orders by status and provider.
2) Open an order and update status step-by-step.
3) Attempt an invalid transition (should be blocked).
Expected:
- Valid transitions succeed; invalid transitions show clear error.
- Status history records each change.

### A3 - Driver assignment
Steps:
1) Assign a driver to a CONFIRMED/PREPARING order.
2) Attempt assignment on a DELIVERED/CANCELED order.
Expected:
- Driver assignment succeeds for active orders.
- Completed orders show a clear restriction message.

### A4 - Reviews moderation
Steps:
1) Open Reviews Management and filter by PENDING.
2) Approve a review and then reject another with a note.
Expected:
- Review status updates correctly.
- Provider average rating refreshes after moderation.

### A5 - Automation Outbox + Ops Watchers
Steps:
1) Open Automation Outbox and filter by status.
2) Retry a FAILED event.
3) Check Ops watcher status for stuck orders.
Expected:
- Event status updates after replay.
- Stuck watcher shows last run time and thresholds.

### A6 - Arabic admin UI spot check
Steps:
1) Switch admin UI to Arabic.
2) Review Orders, Provider Applications, and Reviews screens.
Expected:
- Status labels and action buttons render correctly in Arabic.

## Provider

### P1 - Provider account access (if enabled)
Steps:
1) Log in as a Provider user.
2) Open Orders list and view details.
Expected:
- Provider can only see their own orders.
- Restricted actions (driver assignment, cancellations) are blocked if role is provider.

### P2 - Provider visibility toggles
Steps:
1) Admin sets Provider status to DISABLED.
2) Customer searches for provider.
Expected:
- Disabled provider is not visible in customer app.
- Admin can re-enable provider and it appears again.
