# 10 — My Bookings

## Purpose
Give a signed-in citizen or authorised user a trustworthy view of their own current, past, pending, cancelled, and rejected space bookings.

## Requirements to verify
The exact screen details were described in conversation but are not fully visible in the available screenshots. Confirm the existing columns, filters, and available actions before implementation.

## Functional requirements
- Show booking reference, space, date/time, purpose, status, submission time, and relevant approval/cancellation information.
- Separate upcoming, pending, completed, cancelled, and rejected bookings or provide equivalent filters.
- Show status with both text and visual indication; do not rely on colour alone.
- Permit cancellation or modification only when policy allows, and explain cut-off rules before confirmation.
- Prevent duplicate submissions and handle retries idempotently.
- Show clear loading, empty, error, and stale-data states.
- Refresh booking status after a successful action and preserve filters where practical.

## Security and Supabase
- Query bookings for the authenticated user using the server-authenticated identity.
- Implement PostgreSQL Row Level Security (RLS) so users can only read their own bookings; authorised officers may access records only within their permitted scope.
- Do not rely on client-side filtering as access control. Validate state transitions on the server/database.
- Keep service-role keys server-side only. Record consequential status changes in an audit table.

## Acceptance criteria
- Cross-user booking reads and mutations are denied by RLS and integration tests.
- Cancelled or rejected bookings cannot be presented as active.
- Concurrent requests do not create duplicate bookings or invalid status transitions.
- Each action gives a truthful result and leaves an auditable record.
