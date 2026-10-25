# Sanchay - Public Asset Intelligence

Fleet-first operations platform for Gwalior's public assets. This is a clean rebuild of the original Sanchay
prototype using the EasyLife design system and backend pattern (Next.js App Router, Prisma, Supabase Postgres, Vercel).

Phase 1 (this repo): the **Vehicle / Fleet module** plus platform shell, audit ledger, reports, settings and an
**IoT / GPS hub** that runs on simulated telemetry until real devices are connected.
Phase 2 (last focus): **Civic Spaces** - `/spaces` is a placeholder page for now.

## Stack

Next.js 16 (App Router) - React 19 - TypeScript strict - vanilla CSS design tokens (light + dark) - Prisma 5.22 -
Supabase PostgreSQL (server-side only) - MapLibre GL - framer-motion - zod. Deploys to Vercel.

## Quick start

```bash
npm install                      # also runs prisma generate + copies the MapLibre worker
cp .env.example .env.local       # fill DATABASE_URL / DIRECT_URL (Supabase), SANCHAY_AUTH_SECRET, admin creds
npm run db:push                 # create tables (loads .env.local)
npm run db:seed                 # Gwalior demo fleet: 37 stations, 142 vehicles, 91 devices, 5 demo operators
npm run db:rls                  # recommended on Supabase: enable RLS + revoke anon/authenticated (server-only access)
npm run dev                     # http://localhost:3000
```

Demo operators (created by the seed, shared password printed by the seed CLI):
`admin`, `dept.officer`, `station.kotwali`, `driver.demo`, `auditor.demo`.
You can also sign in with the bootstrap admin from `SANCHAY_ADMIN_USERNAME` / `SANCHAY_ADMIN_PASSWORD`.

No Supabase yet? `npm run db:local` starts a throwaway local Postgres (port 54329, no Docker). Point `DATABASE_URL` and `DIRECT_URL` in `.env.local` at `postgresql://postgres:postgres@localhost:54329/sanchay`, then run `db:push` and `db:seed`.

Checks: `npm run typecheck`, `npm run lint`, `npm run build`.

## Backend (same shape as EasyLife)

| Concern | Implementation |
|---|---|
| Database | Prisma -> Supabase Postgres (`DATABASE_URL` pooler, `DIRECT_URL` direct). No browser/PostgREST access; `prisma/enable_rls.sql` revokes anon/authenticated |
| Auth | HMAC-signed `sanchay-session` cookie, `proxy.ts` gate + `requireSession()` in every route, roles + permissions in `lib/auth/roles.ts`, scrypt password hashes, brute-force/DoS throttle in `lib/security/tracker.ts` |
| API | `/api/cloud/*` with a `{success, data}` envelope, zod validation, domain errors with status codes |
| Governance | Hash-chained `AuditLog` (verified on `/audit`), `BackendEvent` log, `SyncJob` retry queue (cron: `/api/cloud/sync-jobs/process`) |
| Freshness | `/api/cloud/health` returns a `dataVersion` fingerprint; open tabs reload shared data only when it changes. Cached snapshot is tag-invalidated on every write |
| Offline | Incident / trip actions queue in the browser (`lib/client/offline-queue.ts`) and retry when back online |
| Storage | Supabase Storage client slot reserved for vehicle photos / incident evidence |

## Modules and flows

- **Dashboard** - ranked "needs attention", KPIs, fleet status, utilization, station leaderboard, live pulse, recent activity.
- **Fleet registry** `/vehicles` - filters, saved quick filters, bulk actions, CSV import with validation, 4-step registration wizard.
- **Vehicle passport** `/vehicles/[id]` - overview, live and IoT, trips (start/end with odometer validation), compliance renewals, maintenance, legal records, incidents/SOS, fuel, audit trail, printable QR passport.
- **Live map** `/vehicles/map` - clustered live vehicles, stations, incidents, trails, filters.
- **Stations / Transfers** - inter-station vehicle transfers: request -> approve (atomic inventory allocation with row locks) -> complete.
- **Requisitions** `/bookings` - request vehicle, conflict-checked approval, driver assignment, start/complete.
- **Compliance, Maintenance, Idle and reuse** - expiry tracker, tickets and risk ranking, idle-to-GeM/reuse suggestions with CSV export.
- **Incidents** - SOS board with acknowledge/resolve, offline capture.
- **IoT hub** `/iot` - device registry, provisioning, gateway health, live stream, hardware connection guide.
- **Reports, Audit, Settings** - exports and print, ledger verification, fleet policy, operators, demo data, cloud/sync status.

## IoT / GPS (placeholder, production-shaped)

Simulated devices move vehicles along the Gwalior road network in the browser (`lib/client/telemetry-sim.ts`),
clearly badged "Simulated placeholder". Real hardware plugs in through `POST /api/iot/ingest`:

```bash
curl -X POST https://<your-host>/api/iot/ingest \
  -H "Authorization: Bearer $SANCHAY_IOT_INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '{"deviceCode":"GPS-00085","lat":26.2183,"lng":78.1828,"speedKmph":42,"heading":90,"ignition":true}'
```

The first accepted packet flips the device from simulated to live; real data then overrides the simulator.

## Deploy to Vercel

1. Create the Supabase project, copy pooler (6543, `?pgbouncer=true`) and direct (5432) URLs into Vercel env vars.
2. Set `SANCHAY_AUTH_SECRET`, `SANCHAY_ADMIN_USERNAME`, `SANCHAY_ADMIN_PASSWORD`, `SANCHAY_IOT_INGEST_TOKEN`, `CRON_SECRET`.
3. Run `npx prisma db push` and `npm run db:seed` (or load demo data from Settings -> Data) once, then `npm run db:rls`.
4. Basemap: defaults to OpenStreetMap tiles (light-use policy). For production set `NEXT_PUBLIC_MAP_TILES_URL` to your tile provider.

See `docs/UNDERSTANDING.md` for the product analysis and UX flow map, and `docs/BUILD_CONTRACT.md` for the internal contracts.
