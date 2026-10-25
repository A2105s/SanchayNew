# 12 — Cross-Screen Improvement and Delivery Plan

## Scope guardrails
- Keep the current UI/UX design and visual language. Make targeted changes only when required for correctness, security, accessibility, responsive behaviour, or clear task completion. A full redesign is not in scope by default.
- Rename user-facing product branding from NationTrack to **SANCHAY** consistently. Check browser title, navigation, page headings, auth copy, metadata, emails, reports, and generated documents. Do not blindly rename database identifiers or third-party names without assessing compatibility.
- Migrate backend functionality from Firebase to Supabase. This is a real data/auth/security migration, not a superficial package swap.

## P0 — Security and migration foundation
1. Inventory Firebase Auth, Firestore collections, Security Rules, Storage buckets, Cloud Functions, triggers, scheduled jobs, and client SDK usage.
2. Map each entity and relationship to PostgreSQL tables, constraints, foreign keys, indexes, and migrations.
3. Define Supabase Auth flows and map user IDs/roles to profiles. Plan account migration carefully; password hashes may not be portable, so a secure reset/re-authentication flow may be required.
4. Write and test RLS policies for citizens, space owners, booking officers, administrators, and auditors. Default deny; grant least privilege.
5. Move privileged operations into trusted server-side routes/Edge Functions. Keep the Supabase service-role key out of browser bundles and logs.
6. Plan data export/import, reconciliation counts, referential-integrity checks, cutover, rollback, and backup. Do not delete the Firebase source until verification and rollback windows are complete.

## P1 — Data and workflow correctness
- Fix broken QR rendering and verify generated QR payloads resolve to the correct stable space ID/route.
- Fix map tile/API configuration; avoid exposing private keys and follow the map provider's current restrictions.
- Establish one canonical rating calculation and distinguish “no reviews” from a zero rating.
- Standardise booking statuses, time zones, capacity validation, overlap prevention, and cancellation rules.
- Ensure maintenance status, request state, booking history, and audit events agree across screens.
- Replace broken/placeholder images with validated assets or intentional fallbacks.

## P2 — Targeted usability and reliability
- Preserve the existing layout unless a specific issue is documented.
- Keep search/filter state and make empty, loading, failure, and permission-denied states explicit.
- Ensure keyboard accessibility, visible focus, semantic labels, mobile responsiveness, and text labels alongside status colours.
- Add marker clustering and map/list synchronisation where needed; handle map provider failure gracefully.

## Clean-code requirements
- Remove dead code, unused dependencies, duplicate components, stale Firebase configuration, and obsolete environment variables after verifying references.
- Use typed domain models and a clear separation between UI, application services, database access, and policy enforcement.
- Centralise validation and error handling; never silently swallow failures. Avoid logging secrets or sensitive personal/location data.
- Use current documentation via Context7 where available; use MCP tools only for relevant tasks and least-privilege access.
- Do not add abstractions or dependencies without a concrete need.

## Verification gates
- Static: lint, formatting, TypeScript/type checks, dependency audit.
- Build: clean production build from a fresh install with documented environment variables.
- Database: migration rehearsal, integrity checks, constraints, indexes, and rollback rehearsal.
- Security: RLS tests for allowed and denied cases; unauthorised role escalation and cross-space access must fail.
- Functional: signup/login/reset, space discovery/details, booking, cancellation, update request, approval, maintenance, reports, and audit history.
- Regression: compare key screens against the supplied screenshots; verify no unnecessary redesign.
- Brand: search the repository and generated user-facing output for legacy “NationTrack” strings. Review every match rather than blindly changing technical identifiers.

## Definition of done
The project builds cleanly; core flows work; Supabase policies are tested; no privileged secrets are client-exposed; data migration is reconciled; critical actions are auditable; the SANCHAY brand is consistent; and changes are limited to the agreed functional, security, and reliability scope.
