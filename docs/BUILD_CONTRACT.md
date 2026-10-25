# Sanchay build contract v2 (spec-aligned) - shared by all builders

Authoritative requirements: `SANCHAY_Full_Specification_Spaces_and_Vehicles/SANCHAY_Full_Specification/*.md` (files 13-19 for this phase).
Coverage tracking: `docs/SPEC_COVERAGE.md`. Types: `types/index.ts` (source of truth - already rewritten; extend by appending only).
Schema: `prisma/schema.prisma` + `prisma/post-push.sql` (DB-level constraints: allocation overlap EXCLUDE constraint, append-only audit trigger, CHECKs).

Workspace `C:\Users\Parikshit\Desktop\Hackathons\SanchayNew`. Next 16.4.3, React 19, strict TS, alias `@/*` = repo root.
Rules: NO emojis (lucide icons). The CSS is EasyLife's REAL stylesheet (`app/globals.css`, `theme.css`, `controls.css`, `cloud-status.css` are verbatim copies - DO NOT edit them).
Add new styles ONLY to `app/sanchay-ui.css` (shared), `app/vehicles.css` or `app/ops.css`. Reuse EasyLife class names (`.panel`, `.metric-grid`, `.metric-tile`, `.badge badge--*`, `.button button--*`, `.table-wrap`, `.page-title`, `.modal*`, `.toast-inline`, `.custom-select-*`, `.search-field`, `.empty-state`, `.skeleton`, `.settings-tab-btn` ...) and the UI kit in `components/ui/*`.
Never read `.env*` files from other projects. Never print secrets. `.env.local` points at a throwaway local Postgres on port 54329 (running).
Verification commands: `npx tsc --noEmit`, `npx eslint .`, `npm run build`. Do not run `next build` while the dev server is running on port 3000 (it deletes `.next`); use `npx tsc --noEmit` and the dev server for checks.

## Roles and permissions (server enforces; client mirrors via lib/client/permissions.ts)
Roles: `ADMIN` (platform admin), `ORG_ADMIN`, `DEPT_OFFICER` (approver), `STATION_OFFICER`, `FIELD_STAFF`, `AUDITOR`.
| Permission | ADMIN | ORG_ADMIN | DEPT_OFFICER | STATION_OFFICER | FIELD_STAFF | AUDITOR |
|---|---|---|---|---|---|---|
| fleet.read | all orgs | own tree | own tree | own station/org | own station | own tree |
| vehicle.register / vehicle.edit | - | yes | - | edit own station | - | - |
| vehicle.delete | - | - | - | - | - | - (retire instead) |
| eligibility.verify, restriction.manage | - | yes (verifier must differ from submitter) | restriction only | - | - | - |
| maintenance.write | - | yes | yes | yes | - | - |
| trip.write, incident.write | - | yes | yes | yes | yes | - |
| request.create | - | yes | yes | yes | - | - |
| request.review, extension.decide, return.inspect | - | - | yes (never own request unless settings.allowSelfApproval) | - | - | - |
| handover.record, return.record | - | yes | yes | yes | - | - |
| transfer.create / transfer.review | - | yes / yes | yes / yes | create; review only as source station | - | - |
| device.manage | yes | yes | - | - | - | - |
| document.read / document.write | - | yes | yes (read) | read own station | - | - |
| audit.read, report.read, export | yes | yes (own tree) | yes (own tree) | report.read | - | yes (read-only) |
| settings.manage, operators.manage | yes | - | - | - | - | - |
ADMIN is a platform administrator: cannot approve, verify eligibility, record handovers or read documents.

## Scope & masking (lib/auth/scope.ts - BACKEND)
- `orgTree(user)` = user's organization + descendants (ADMIN: all). Own-scope = vehicles whose organizationId is in the tree.
- Cross-org discovery (`scope=discover`): only vehicles that are `ownershipCategory=GOVERNMENT_FLEET`, `eligibilityState=ELIGIBLE`, `operationalStatus=ACTIVE`, returned as `VehicleCardView` (masked registration, no driver/odometer/documents/exact position). Anything else owned by another org is invisible (404, never 403) so existence is not revealed.
- Foreign `AllocationView/AssetRequestView` expose only what the request/approval flow needs (masked vehicle label).

## Eligibility service (lib/cloud/eligibility.ts - BACKEND)
`evaluateEligibility(vehicle, ctx) -> EligibilityDecision`. Fail closed. Rules (policy version string in settings):
1. ownershipCategory must be GOVERNMENT_FLEET and the latest ownership verification must be VERIFIED (else `needs_review` / PENDING_VERIFICATION). SEIZED_IMPOUNDED => INELIGIBLE (reason SEIZED_CUSTODY, blocking). OTHER_UNVERIFIED => PENDING_VERIFICATION.
2. Any active restriction (not lifted, not expired) => RESTRICTED (blocking, reason carries type/authority).
3. operationalStatus != ACTIVE => INELIGIBLE (blocking) ; open maintenance with blocksAvailability whose window covers now => RESTRICTED/INELIGIBLE reason MAINTENANCE_WINDOW.
4. Expired mandatory compliance (PUC/insurance/fitness) => blocking COMPLIANCE_EXPIRED; expiring soon => non-blocking warning.
Telemetry (stale/missing/simulated) NEVER affects eligibility or availability. Result is cached on the Vehicle (eligibility* columns) and recomputed on every relevant mutation + `reevaluateEligibility`. The DB CHECK forbids ELIGIBLE unless GOVERNMENT_FLEET.
Availability (`computeAvailability(vehicle, from, to)`) = eligibility + operationalStatus + maintenance windows + overlapping live allocations (lifecycle not CANCELLED/COMPLETED) + approved-not-yet-allocated? (allocations are created at approval, so allocations are authoritative).

## Request -> allocation lifecycle (lib/cloud/ops/requests.ts, allocations.ts - BACKEND)
- Create draft/submit validates requester org membership (org comes from the session, never the body), dates (end>start, within `maxBookingHorizonDays`, not in the past), vehicle visibility + eligibility + availability for the range.
- Approver resolved server-side: the vehicle's owning org; step 2 = parent org on `escalate`. Requester can never approve own request (unless settings.allowSelfApproval=true). Same-org requests are reviewed by DEPT_OFFICER of that org.
- `approve` runs in ONE transaction: lock vehicle row, re-run eligibility + availability, insert Allocation (DB EXCLUDE constraint is the final guard; a violation -> HTTP 409 "vehicle no longer available"), mark request APPROVED, write audit, enqueue notifications AFTER commit. Idempotent: repeated approve returns the same allocation.
- Allocation transitions are explicit functions with a transition table; illegal transition => 409. `recordHandover` requires RESERVED/AWAITING_HANDOVER; allocation becomes ACTIVE ONLY then. `recordReturn` requires ACTIVE (not RESERVED). Return due = ACTIVE and now > endAt + returnGraceMinutes (derived). Extension: separate request, decision re-checks conflicts (overlap with later allocation => 409 + reason). `hold` -> INCIDENT_HOLD. Cancel before handover only.
- Requests expire (state EXPIRED) when SUBMITTED/UNDER_REVIEW for > requestExpiryHours or start time passed (job via sync-jobs + lazy check on read).
- Notifications are inserted only after commit with deterministic `eventKey` (idempotent); failure to notify never rolls back a decision.

## API routes (all require session unless noted; envelope `{success,data}|{success:false,error,code?}`)
| Method + path | Purpose |
|---|---|
| POST /api/auth/login, /logout, GET /api/auth/session | cookie session (payload includes organizationId) |
| GET /api/cloud/health, /snapshot, /telemetry | scoped as above |
| GET /api/cloud/vehicles/search?<VehicleSearchParams> | server-side pagination (pageSize<=100), filters validated by zod, `VehicleSearchResult` |
| POST /api/cloud/vehicles; GET /vehicles/[id] (`VehicleDetail`); POST /vehicles/[id]/actions (`VehicleAction`); POST /vehicles/bulk | |
| GET/POST /api/cloud/vehicles/[id]/documents; GET /api/cloud/documents/[docId]/url (short-lived signed URL, access-logged); GET /api/cloud/documents/[docId]/file?exp&sig (local-storage driver) | private storage; type/size limits; filename sanitised |
| GET /api/cloud/requests (scoped list, filters state/mine/needsMyDecision), POST /requests (`RequestInput`, optional `Idempotency-Key`), GET /requests/[id], POST /requests/[id]/actions (`RequestAction`) | |
| GET /api/cloud/allocations (scoped; filters lifecycle/overdue), GET /allocations/[id], POST /allocations/[id]/actions (`AllocationAction`) | |
| GET /api/cloud/notifications, POST /api/cloud/notifications/read | |
| POST /api/cloud/transfers, /transfers/[id]/actions | station pool counts of ELIGIBLE vehicles |
| POST /api/cloud/devices, /devices/[id]/actions (`DeviceProvisionResult` for create + rotateKey) | per-device ingest key shown once |
| POST /api/iot/ingest (X-Device-Code + Bearer device key; no cookie) | per-device auth, scoped to its bound vehicle, replay protection, 60 req/min/device, coordinate/time validation, `recordedAt` vs `receivedAt` stored separately |
| GET /api/cloud/reports/[kind] (`ReportKind`, query from/to/organizationId/vehicleClass/status) -> `ReportResult`; GET /api/cloud/exports/[kind] CSV | same scope + masking, row cap `settings.exportRowLimit`, exports logged to audit |
| GET /api/cloud/activity (audit with `correlationId`, `organizationId`, verify chain), GET/PUT /settings, operators, sync-jobs(+/process), POST /seed | |

## Page ownership
- BACKEND: `proxy.ts`, `lib/db/*`, `lib/auth/*`, `lib/security/*`, `lib/cloud/*`, `lib/validation/*`, `lib/seed/*`, `prisma/*`, `scripts/*`, `app/api/**`, `tests/**` (node:test integration tests, `npm test`).
- FOUNDATION/UI-CORE: `components/layout/*`, `components/ui/*`, `components/providers/*`, `lib/client/*`, `lib/fleet/*`, `app/sanchay-ui.css`.
- FLEET PAGES: `app/vehicles/**`, `components/vehicles/**`, `app/vehicles.css`, `app/requests/**`, `app/allocations/**`, `components/requests/**`.
- OPS PAGES: `app/dashboard`, `stations`, `transfers`, `incidents`, `iot`, `compliance`, `maintenance`, `idle`, `audit`, `reports`, `settings`, `notifications`, `operations`, `spaces`, `components/ops/**`, `app/ops.css`.

## Navigation (sidebar order)
Dashboard; Fleet `/vehicles`; Discover `/vehicles/discover`; Live map `/vehicles/map`; Requests `/requests`; Allocations `/allocations`; Operations `/operations`; Stations `/stations`; Transfers `/transfers`;
Compliance; Maintenance; Idle & reuse; Incidents; IoT hub; Reports; Audit; Settings; Notifications (bell + `/notifications`); Spaces (placeholder, "Soon").
The old `/bookings` route is replaced by `/requests` (redirect `/bookings` -> `/requests`).
