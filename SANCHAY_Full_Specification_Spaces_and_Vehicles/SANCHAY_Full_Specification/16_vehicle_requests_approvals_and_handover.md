# Vehicle Requests, Approvals, Reservations, Handover, and Return

## Request payload
A request should include the requesting organization/unit, requester, vehicle or acceptable requirements, intended purpose, destination/area where relevant, start/end date-time with timezone semantics, accountable officers, and any required supporting information. Validate that the requester may act for the organization and that dates and purpose satisfy policy.

## Approval routing
- Resolve approvers from server-managed organization hierarchy and policy; do not accept arbitrary approver IDs from the client.
- Support submit, review, request-changes, approve, reject, cancel and expiry paths as policy requires.
- Capture reason/comment and timestamps for decisions. Keep a clear distinction between request creator, reviewer and approver.
- Enforce separation of duties where configured. AI can prepare a request and recommend eligible candidates but cannot approve it or override backend rules.

## Conflict-safe reservations
Availability checks are not sufficient on their own. Enforce overlapping-allocation prevention in PostgreSQL using a transaction-safe design, appropriate constraints (such as a range exclusion constraint when suitable), or a carefully designed locking strategy. Recheck eligibility and availability during final approval/reservation, not just during search. Make repeated submit/approve calls idempotent where appropriate.

## Lifecycle
1. Draft → submitted → under review.
2. Approved request creates a reservation, but not physical handover.
3. Handover is recorded by authorized officers with timestamp, condition, relevant odometer/fuel data if collected, accessories/documents checklist, and acknowledgement/evidence.
4. Allocation becomes active only after the configured handover event.
5. Extensions require a separate permission-checked decision and conflict recheck.
6. Return records time, condition, discrepancies, evidence and receiving officer.
7. If inspection is required, use returned-pending-inspection until accepted; then close the allocation.
8. Incidents, missing items, damage or legal/operational concerns can place the vehicle/allocation on hold and trigger escalation.

## Notifications
Send notifications only after durable state changes. Prevent duplicate messages on retries using event IDs/idempotency. Notification failure must not silently roll back a committed approval; record and retry delivery safely.

## Audit requirements
Record submission, edits to material fields, approval/rejection, cancellation, reservation, handover, extension, return, inspection, restriction changes and administrative overrides. Include actor, organization context, timestamp, reason and correlation ID. Do not permit ordinary users to edit or delete audit events.

## User-facing correctness
Never show “booked,” “allocated,” or “handed over” based only on an optimistic client action. Display the authoritative server state and explain pending approvals, conflicts, restrictions and failed operations clearly.
