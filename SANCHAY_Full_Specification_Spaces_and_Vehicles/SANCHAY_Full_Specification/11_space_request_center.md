# 11 — Space Request Center

## Purpose
Provide an auditable workflow for submitting, reviewing, approving, rejecting, and tracking requests to register a space or update existing space information.

## Requirements to verify
The screen was described in conversation; confirm exact fields and actions against the existing implementation before changing them.

## Functional requirements
- Display request ID, request type, space, requester, submitted/updated timestamps, current status, and assigned reviewer where applicable.
- Support draft/submitted, under review, needs information, approved, rejected, and withdrawn states only where the policy requires them.
- Capture a reason for rejection or a request for more information. Notify the requester of status changes.
- Prevent duplicate submissions and conflicting edits while a request is under review.
- Approved changes should update the canonical space record through a validated, transactional server-side workflow; do not directly trust proposed values.
- Preserve before/after values and reviewer decisions in an append-only audit trail.

## Security and Supabase
- Use authenticated identity and role-based authorisation, backed by RLS and server-side validation.
- Requesters may read their own requests; reviewers may access only requests in their authorised scope.
- Only authorised roles may approve/reject. A requester must not approve their own request where separation of duties is required.
- Never expose service-role credentials to the browser. Validate uploaded evidence and restrict file access.

## Acceptance criteria
- Unauthorised approval and cross-department/cross-space access attempts fail.
- Every status transition records actor, timestamp, reason, and request ID.
- Retried approval actions do not apply changes twice.
- The requester can see the current status and the next required action.
