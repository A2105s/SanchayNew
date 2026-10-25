# Vehicle Reports, Fleet Operations, and Administration

## Operational views
Provide authorized users with views for fleet composition, operational status, vehicles in maintenance, restricted/unverified vehicles, upcoming compliance/inspection dates (where configured), active allocations, overdue returns, pending approvals and stale telemetry. Every metric must have a defined query, time window and permission scope.

## Reports
Reports may include utilization, downtime, request/approval cycle time, allocation history, maintenance history, overdue returns and audit events. Clearly define numerator, denominator, date range and treatment of cancelled/expired requests. Do not claim cost savings or efficiency improvements without a documented calculation and source data.

## Filters and export
Filter by allowed organization/unit, vehicle class, status, and date range. Apply the same authorization rules to exports as to on-screen data. Prevent exports from bypassing field masking. Log sensitive exports where policy requires it and limit row counts for large datasets.

## Administrative controls
Use explicit permissions for vehicle registration, record editing, eligibility verification, maintenance updates, approvals, handover/return, reporting and policy configuration. Do not assume that a user who can view an asset can edit it or approve its allocation.

## Audit and operational reliability
Record high-impact changes and provide authorized audit review. Avoid destructive edits to lifecycle records; use correction events. Background tasks such as expiry checks and reminders must be idempotent and observable. Report failures with correlation IDs while avoiding secrets and unnecessary personal data in logs.

## Minimum QA scenarios
- Eligible, available vehicle is requested, approved, handed over, returned and closed.
- Restricted/seized vehicle is rejected by backend with a safe explanation and eligible alternatives if available.
- Two overlapping requests race for one vehicle; at most one is confirmed.
- Extension overlaps a later reservation and is rejected or rerouted according to policy.
- Unauthorized user attempts to read documents or alter eligibility.
- Overdue return appears in the authorized operations view.
- Export contains only fields the user is permitted to access.
