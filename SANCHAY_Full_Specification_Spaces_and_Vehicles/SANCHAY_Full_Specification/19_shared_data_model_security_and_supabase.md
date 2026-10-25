# Shared Platform Model, Supabase Migration, and Security

## Shared vs domain-specific records
SANCHAY has two asset domains—spaces and vehicles—that should share platform services without forcing identical domain schemas. Shared concepts include organizations/units, memberships, roles/permissions, requests, approval steps, notifications, audit events, files/documents and policy configuration. Space-specific concepts (room/building capacity and bookings) and vehicle-specific concepts (ownership/custody eligibility, maintenance, handover/return and telemetry) remain domain-specific.

## Suggested logical entities
Adapt after repository audit; do not blindly create duplicate tables if equivalent entities already exist.
- `organizations`, `organization_units`, `profiles`, `memberships`, `roles` / permission assignments.
- `spaces`, `space_availability`, `space_bookings` (existing space spec is authoritative for those details).
- `vehicles`, `vehicle_ownership_verifications`, `vehicle_restrictions`, `vehicle_compliance_records`, `vehicle_maintenance_events`.
- `asset_requests` or domain-specific request tables, `approval_steps`, `reservations` / `allocations`, `handover_records`, `return_records`.
- `telemetry_devices`, `vehicle_telemetry_events`.
- `documents`, `notifications`, `audit_events`, `idempotency_keys` where appropriate.

Choose shared request abstractions only when they preserve domain-specific validation and lifecycle constraints. Prefer foreign keys, check constraints, indexes, normalized enums/reference tables, and database-enforced invariants. Avoid untyped JSON blobs for core lifecycle state.

## Supabase migration requirements
- Inventory Firebase Auth, Firestore collections, Storage paths, Cloud Functions, security rules and client SDK usage before changing code.
- Map identities and organization membership carefully; preserve stable user and asset references where possible.
- Design PostgreSQL schema and migrations with forward and rollback/recovery plans. Backfill, validate counts/references, and test cutover before removing legacy dependencies.
- Use Supabase Auth for identity; use PostgreSQL RLS for data access; use private Storage buckets and server-authorized signed URLs for protected documents; use Edge Functions or server-side application routes only where appropriate.
- Never expose `service_role` or other privileged keys to the browser. Enforce business rules in trusted server-side code and database constraints, not only in UI code.
- Write RLS policies for organization boundaries, role permissions, read/write scope, and sensitive fields/documents. Test cross-tenant access explicitly.
- Use transactions and concurrency-safe database constraints for bookings/reservations. Use idempotency for retried high-impact commands.
- Keep schema changes in version-controlled migrations. Do not manually mutate production schema without a migration.

## Security baseline
- Deny by default and grant least privilege.
- Do not trust client-supplied organization ID, role, eligibility, status, approver, or approval result.
- Validate every mutation with typed schemas and server-side authorization.
- Restrict document access and sensitive vehicle location/identifiers.
- Rate-limit sensitive endpoints and protect against replay/duplicate actions where appropriate.
- Keep secrets out of source control, logs, client bundles and telemetry firmware.
- Maintain append-only audit semantics for high-impact events; use stronger tamper-evidence controls if the deployment threat model requires them.
- Log actor, organization, action, target, outcome, timestamp and correlation ID without leaking secrets.

## AI agent boundaries
The AI agent may search authorized records, summarize permitted fields, rank eligible candidates with reasons, draft requests, and explain backend decisions. It must call trusted tools/APIs for availability and eligibility. It cannot grant itself permissions, bypass RLS, approve its own request, alter legal status without authorized review, or treat generated reasoning as authoritative data. All tool calls need server-side authorization and auditable outcomes.

## Repository hygiene and completion criteria
- Replace user-visible NationTrack branding with **SANCHAY** and check routes, titles, metadata, emails, seeded content and docs. Do not rename unrelated dependency identifiers without impact analysis.
- Remove dead code only after reference/import checks; avoid speculative rewrites and unused dependencies.
- Keep domain logic outside large UI components, use strict TypeScript, validate boundaries, handle errors explicitly and preserve useful comments for non-obvious decisions.
- Add tests for RLS/authorization, eligibility, booking conflicts, lifecycle transitions and migration integrity.
- Before completion run available lint, type-check, unit/integration tests and production build; report exact commands and failures honestly.
