# Sanchay - understanding and UX flow map

## What Sanchay is

A public-asset intelligence platform for Gwalior (pilot of ~286 connected assets). It gives district administrators,
department officers and police stations one place to see where vehicles are, whether they are legal to run, who has
them, and which ones are idle and could be reused. A second module, Civic Spaces, does the same for underused public
rooms and halls. The original prototype (Next 15, Tailwind, Firebase moving to Supabase) was mostly static mock screens
with a rich domain model; this rebuild keeps the domain and replaces the UI/UX/backend with the EasyLife pattern.

## Domain carried over from the prototype

- Vehicles belong to **police stations** (37 Gwalior stations with coordinates) and sectors (police patrol, 108 ambulance, GMC waste, PWD heavy, health, election requisition). Many are seized/idle yard vehicles.
- **GPS tiers**: AIS-140 hardware tracker, QR/PWA phone check-in, manual CSV. Rebuilt as IoT devices with a simulated/live flag.
- **Compliance**: PUC, insurance, fitness expiry with warning/critical thresholds.
- **Idle reuse**: long-idle vehicles are routed to GeM auction, inter-department transfer or election deployment.
- **Station transfers**: a station requests vehicle counts per class (patrol car, motorcycle, van, heavy) from another station; source approves (allocation), destination completes.
- **Requisitions**: an officer requests a vehicle for a time window; reviewer approves, assigns vehicle and driver.
- **Trips, maintenance, legal records (challan, court, accident, seizure), SOS/incident reports, fuel logs.**
- **Audit**: tamper-evident ledger (hash chain).
- Roles: admin, department officer, station officer, field staff (driver), auditor.

## What EasyLife contributes

Design system (tokens, dark sidebar shell, panels, tables, modals, toasts, command palette, light/dark), the page-enter
animation, login with animated Grainient background, cloud-status pill, and the backend shape: Prisma on Supabase,
signed-cookie sessions, `requireSession` on every route, audit + backend events, retry queue, health polling with a data
version fingerprint, RLS lockdown, CSV export guards.

## UX flows covered

1. **Sign in** -> role-aware home; session expiry sends you back with `?next=`.
2. **See the fleet**: dashboard attention list -> filtered registry -> vehicle passport -> live map.
3. **Register vehicles**: wizard (identity, assignment, specs and compliance, tracking) or CSV import (template, mapping, validation, duplicate detection, result summary).
4. **Run a vehicle**: start trip -> end trip (odometer validation, fuel) -> utilization and audit.
5. **Stay compliant**: compliance tracker -> renew document -> severity recalculates -> notification bell clears.
6. **Maintain**: raise ticket -> progress -> complete with cost; risk ranking.
7. **Respond to incidents**: SOS/incident board -> acknowledge -> resolve; offline capture queues and syncs later.
8. **Share vehicles**: station transfer (request, approve with atomic allocation, complete) and requisitions (request, conflict-checked approval, driver, start, complete).
9. **Reuse idle assets**: idle analysis -> suggestion -> mark auction ready -> GeM CSV export.
10. **Connect hardware**: provision device -> bind to vehicle -> send packets to `/api/iot/ingest` -> device flips from simulated to live.
11. **Govern**: audit ledger with chain verification, filters, export; fleet policy and operators in settings.
12. Cross-cutting: loading, empty and error states everywhere; toasts; confirm dialogs for destructive actions; keyboard access; mobile drawer; light/dark.

## Out of scope for now (deliberate)

Civic Spaces (registry, booking, idle activation, occupancy sensors) - `/spaces` is a roadmap placeholder.
Notification delivery (SMS/WhatsApp), VAHAN import, and real GeM submission are represented by buttons that queue or export only.
