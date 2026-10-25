# SANCHAY — Public Asset Management Specification Pack

## Purpose
A modular functional, data-quality, security, reliability, and implementation specification for SANCHAY’s two core asset domains: government spaces and vehicles. Space requirements are based on the supplied space screenshots and conversation notes; vehicle requirements are a domain specification to guide the corresponding vehicle module and must be reconciled with the actual repository/screenshots during implementation. This is an improvement pass, **not a planned wholesale UI/UX redesign**. Preserve the current visual language and layout unless a specific usability or accessibility defect requires a targeted change.

## Confirmed constraints
- Product branding must consistently say **SANCHAY**. Remove visible legacy “NationTrack” branding from page titles, navigation, metadata, document titles, and user-facing copy. Do not rename unrelated third-party services or identifiers without checking their purpose.
- Scope includes both **Spaces** and **Vehicles**. Treat them as distinct asset domains that share identity, organization boundaries, request/approval infrastructure, audit history, and common platform services.
- Backend migration: replace Firebase services with **Supabase** (Supabase Auth, PostgreSQL, Row Level Security, Storage and Edge Functions only where appropriate). Plan a controlled migration; do not assume a blind find-and-replace is sufficient.
- Security-first: enforce authorization server-side and through RLS; never trust client-supplied role, space ID, approval state, or ownership. Keep secrets out of client code.
- Clean codebase: remove unused/duplicate code only after reference checks; handle errors, loading and empty states; avoid unnecessary dependencies; ensure lint, type-check, tests and production build pass.
- Use Context7 for current framework/library documentation. Use MCP integrations only when relevant and approved; never give an agent unrestricted credentials or database access.
- Existing functional requirements and core flows must be preserved. Do not introduce a major UI redesign as a default requirement.

## Evidence and confidence
- Directly visible in screenshots: Space Details, All Spaces listing, map-based dashboard view(s), and Space Authentication/signup.
- Described in the conversation: Space Settings, general Settings, Space Reports, Open Space Live Booking Calendar, My Bookings, and Space Request Center.
- Items not directly visible in the available screenshot context are marked as requirements to verify, not confirmed defects. Sample data and placeholder imagery must not be treated as production truth.

## Files
### Space module
1. `01_space_details.md`
2. `02_all_spaces_listing.md`
3. `03_dashboard_map.md`
4. `04_map_markers_and_clustering.md`
5. `05_space_authentication.md`
6. `06_space_settings.md`
7. `07_general_settings.md`
8. `08_space_reports.md`
9. `09_live_booking_calendar.md`
10. `10_my_bookings.md`
11. `11_space_request_center.md`
12. `12_cross_screen_improvement_plan.md`

### Vehicle module
13. `13_vehicle_module_overview.md`
14. `14_vehicle_inventory_and_discovery.md`
15. `15_vehicle_details_eligibility_and_lifecycle.md`
16. `16_vehicle_requests_approvals_and_handover.md`
17. `17_vehicle_map_and_telemetry.md`
18. `18_vehicle_reports_and_operations.md`
19. `19_shared_data_model_security_and_supabase.md`

## Implementation order
1. Audit current Firebase dependencies, data model, auth flows, security rules, storage usage, and server functions before migration.
2. Design Supabase schema, constraints, indexes, RLS policies, roles, and migration/rollback plan.
3. Migrate authentication and data with integrity checks; keep credentials and privileged operations server-side.
4. Implement and verify vehicle domain flows alongside the space flows; do not treat vehicle management as out of scope.
5. Fix correctness issues: QR rendering, map configuration, rating consistency, availability/status semantics, and placeholder media.
6. Verify discovery → details → booking → confirmation → My Bookings → cancellation/update.
7. Verify administrative workflows: update requests, approvals, maintenance, reports, and audit history.
8. Run automated security, functional, accessibility, lint, type-check, and production-build checks.
