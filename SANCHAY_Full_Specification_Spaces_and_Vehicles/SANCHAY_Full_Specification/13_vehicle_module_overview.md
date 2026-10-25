# Vehicle Module — Product Scope and Requirements

## Purpose
Manage discoverable, eligible government fleet vehicles across authorized government organizations, including registration, operational status, availability, cross-organization requests, approvals, handover, usage, return, maintenance, and audit history. This module must integrate with SANCHAY’s shared organization, identity, permissions, notifications, request, and audit services.

## Critical legal and ownership distinction
Never treat every vehicle present in a police station yard as a shareable government asset. Model at least these distinct categories:
- **Government fleet vehicle:** owned/controlled by an authorized government organization and potentially eligible for allocation.
- **Seized/impounded/private vehicle:** held in custody, potentially privately owned and subject to investigation, court orders, release processes, or other restrictions. It is not bookable or transferable through ordinary fleet allocation unless a verified, explicit legal authorization and policy permit the specific action.
- **Other / unverified:** unavailable for allocation until ownership, custody, and authorization are verified.

Eligibility must be enforced by backend policy, not by AI output or client-side filters. Unknown legal status means **not eligible** until reviewed. Do not infer ownership from location, inactivity, or possession.

## Primary actors
- Organization asset administrator: registers vehicles and maintains records.
- Fleet/operations officer: manages operational status, maintenance and availability.
- Requesting officer: searches and submits a request on behalf of an authorized organization.
- Approver: approves, rejects, requests changes, or escalates under configured authority.
- Handover/receiving officers: record physical transfer, condition, odometer/fuel where applicable, and evidence.
- Auditor/supervisor: reviews immutable audit history and reports within authorized scope.
- Platform administrator: manages platform configuration, not arbitrary access to restricted operational data.

## Main workflows
1. Register or import a vehicle; validate required identifiers and ownership/control evidence.
2. Set operational status and availability; record maintenance and restrictions.
3. Search eligible vehicles by organization, type/class, location, date range, capacity/specifications and permitted attributes.
4. Open vehicle details and verify eligibility, compliance, status, availability and last-updated timestamps.
5. Submit a request with purpose, destination/use context, requested dates, requesting organization, and responsible officers.
6. Route to the correct authorized approver(s); prevent requester self-approval unless policy explicitly permits it.
7. On approval, create a reservation/allocation record with conflict-safe date locking. Approval alone does not prove physical handover.
8. Record handover, condition and custody transfer; mark active use.
9. Record extension requests, incident/maintenance flags, return inspection, release, and closure.
10. Retain a searchable audit trail for every meaningful state change.

## Status model
Keep distinct fields for operational status, eligibility, availability, request state and allocation lifecycle. Do not compress these into one overloaded status string.
- Operational status examples: active, maintenance, out_of_service, retired.
- Eligibility: eligible, restricted, pending_verification, ineligible.
- Request state: draft, submitted, under_review, approved, rejected, changes_requested, cancelled, expired.
- Allocation lifecycle: reserved, awaiting_handover, active, return_due, returned_pending_inspection, completed, cancelled, incident_hold.
Availability is computed from eligibility, operational state, date conflicts, maintenance windows, organization policy, and active allocations.

## Acceptance criteria
- Restricted or unverified vehicles cannot be reserved even if a client submits a crafted request.
- An approved request does not mark a vehicle as handed over until handover is recorded.
- Concurrent overlapping requests cannot both secure the same vehicle.
- Return and extension actions are permission-checked and audited.
- Vehicle data shown to another organization is limited to fields permitted by policy.
- All vehicle flows have loading, empty, validation, success and failure states; failures never display fake success.
