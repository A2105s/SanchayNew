# Vehicle Details, Eligibility, Compliance, and Lifecycle

## Vehicle record sections
1. **Overview:** asset/fleet ID, category, make/model, permitted registration display, organization, and current operational status.
2. **Ownership and control:** owning organization, managing unit, evidence/reference, verification status and verifier.
3. **Eligibility and restrictions:** eligibility result, reason codes, restriction type, evidence/reference, decision maker, decision timestamp, expiry/review date.
4. **Specifications:** vehicle class, seating/capacity, fuel/energy type and other verified operational attributes.
5. **Compliance and documents:** only applicable fields, expiry dates and secure document references. Do not invent requirements; configure them according to verified organizational policy.
6. **Operations:** service/maintenance events, downtime, odometer or usage records where collected, incidents and operational notes.
7. **Reservations and allocations:** upcoming requests, approved reservations, active allocations, handover/return records, subject to access rules.
8. **Telemetry:** last valid location/event, event timestamp, source and freshness; distinguish device time from server ingestion time.
9. **Audit history:** actor, action, target, timestamp, reason and correlation/request ID.

## Eligibility gate
A server-side eligibility service should return a structured decision, not a bare boolean. Suggested result: `eligible`, `ineligible`, or `needs_review`, with reason codes and policy version. Consider ownership/control verification, legal/custody restrictions, operational status, maintenance windows, compliance policy, and organization-specific rules. Missing or contradictory evidence must fail closed for allocation.

For seized/impounded vehicles, the default result is ineligible for ordinary allocation. A manually entered “approved” flag from a client is never sufficient. Any exception requires a verified authorization record, permitted authority, scope, expiry and audit entry.

## State transition discipline
Implement explicit, validated transition functions on the server. Reject illegal transitions, such as returning an allocation that was never handed over or activating an allocation whose reservation was cancelled. Store transition actor, timestamp, reason, and related request/allocation ID.

## Maintenance and restrictions
A maintenance window or safety restriction must affect availability immediately according to policy. Do not delete old maintenance events to “fix” current state; append a correction/audit event. Define how emergency maintenance interacts with active allocations, notifications and return/recall workflows.

## Documents and sensitive information
Store files in private Supabase Storage buckets. Use short-lived signed URLs after authorization. Apply size/type limits, safe filenames, metadata validation, access logging where required and retention policy. Do not place private document URLs or secrets in public records or logs.
