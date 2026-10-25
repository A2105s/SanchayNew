# Spec coverage (SANCHAY_Full_Specification) - honest status

Source: `SANCHAY_Full_Specification_Spaces_and_Vehicles/SANCHAY_Full_Specification/00..19`.
Legend: DONE = implemented and verified; PARTIAL = exists but does not meet the spec; MISSING = not built.
Status below is the state BEFORE the spec-alignment pass (Phase 1+). It is updated as phases land.

## Decisions taken (flag if you disagree)
1. **Backend stays EasyLife-style** (you asked for this): Prisma + Supabase Postgres, server-only data access, signed-cookie sessions,
   RLS = deny-all for anon/authenticated. The spec says "Supabase Auth + RLS policies"; because every read/write goes through
   trusted server routes, tenant isolation is enforced in one server-side scope layer (`lib/auth/scope.ts`) and tested, and RLS
   keeps the database closed to direct client access. Switching identity to Supabase Auth later only touches `lib/auth/*`.
2. **Platform admin is not a super-user** (spec: "manages platform configuration, not arbitrary access to restricted operational data"):
   `ADMIN` can configure the platform and read aggregates but cannot approve requests, verify ownership/eligibility or record handovers.
3. **Seized / impounded / unverified vehicles are never allocatable.** The old "idle -> GeM auction" flow for seized yard vehicles is removed.
4. Spaces module is implemented after Vehicles (your priority order).

## Vehicle module (files 13-19)
| Requirement | Before | Phase |
|---|---|---|
| Ownership categories (government fleet / seized-impounded / other-unverified), verification evidence, fail-closed | MISSING (seized was just a lifecycle) | 1 |
| Server-side eligibility service returning `{result, reasons[], policyVersion}` | MISSING | 1 |
| Restrictions with authority, evidence, expiry/review date | MISSING | 1 |
| Separate fields: operational status / eligibility / availability (computed) / request state / allocation lifecycle | PARTIAL (overloaded status + lifecycle) | 1 |
| Organizations, memberships, org-scoped visibility, cross-org field masking | MISSING (stations only) | 1 |
| Registration normalisation, scoped uniqueness, duplicate-candidate flagging | PARTIAL | 1 |
| Inventory: server-side pagination, filters, freshness indicator, no leakage of out-of-scope records | PARTIAL (client-side filter of full snapshot) | 2-3 |
| Availability search for a date range with as-of timestamp + reason semantics | MISSING | 2 |
| Request states draft..expired, approver routing from org hierarchy, separation of duties, request-changes | PARTIAL (simple booking) | 2 |
| Conflict-safe reservation (PostgreSQL exclusion constraint) + idempotency keys | PARTIAL (app-level overlap check only) | 2 |
| Allocation lifecycle reserved -> awaiting_handover -> active -> return_due -> returned_pending_inspection -> completed / cancelled / incident_hold | MISSING | 2 |
| Handover record (condition, odometer, fuel, checklist, evidence) / return record + inspection / extension with conflict re-check | MISSING | 2 |
| Notifications after durable state change, idempotent by event id | MISSING (derived bell only) | 2 |
| Documents in private storage, signed URLs, type/size limits, access log | MISSING | 2 |
| Telemetry: per-device auth scoped to its vehicle, replay protection, rate limit, coordinate validation, device vs ingestion time, freshness thresholds in config, stale never changes eligibility | PARTIAL (one global token) | 1-2 |
| Map & API respect org/role + location precision; list alternative | PARTIAL | 3 |
| Simulated telemetry labelled | DONE | - |
| Reports: fleet composition, maintenance, restricted/unverified, compliance due, active allocations, overdue returns, pending approvals, stale telemetry, utilisation, downtime, approval cycle time, allocation/maintenance history | PARTIAL | 2-3 |
| Exports obey field masking, row limits, sensitive exports logged | PARTIAL (CSV guard only) | 2 |
| Append-only audit with org context + correlation id, DB-enforced | PARTIAL (hash chain, not DB-enforced) | 1 |
| Explicit permissions per action (register, edit, verify, maintenance, approve, handover/return, report, policy) | PARTIAL (coarse) | 1 |
| Vehicle detail sections (overview, ownership, eligibility/restrictions, specs, compliance docs, operations, reservations, telemetry, audit) | PARTIAL | 3 |
| Loading / empty / validation / success / failure states, no optimistic fake success for allocations | PARTIAL | 3 |
| QA scenarios 1-7 of file 18 (race, restricted rejected, extension conflict, unauthorised doc access, overdue, export masking) | MISSING | 4 |

## Space module (files 01-11) and shared (05, 12, 19)
Not started (placeholder page only). Scope: registry + details (stable QR, single rating aggregation, maintenance->availability policy),
listing (search/filters/badges/fallback images), map with clustering + legend + tile fallback, space-owner accounts linked to a registered space,
booking rules settings (versioned), live booking calendar (DB-enforced no-overlap), My bookings, update-request centre, reports. Phase 5-6.

## Cross-cutting (12, 19)
| Requirement | Status |
|---|---|
| SANCHAY branding only (no NationTrack) | DONE (verified: no legacy strings in this repo) |
| Strict TS, typed boundaries, error handling, lint/type-check/build | DONE (build + tsc clean) |
| Automated tests for eligibility, conflicts, transitions, scope | MISSING -> Phase 4 |
| Migration plan Firebase -> Supabase (data inventory, reconciliation, rollback) | MISSING -> docs in Phase 4 (no Firebase data exists in this repo) |
