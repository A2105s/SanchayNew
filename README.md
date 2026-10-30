<p align="center">
  <img src="public/logo.png" alt="Sanchay logo" width="120" />
</p>

<h1 align="center">Sanchay — Public Asset Intelligence</h1>

<p align="center">
  <strong>A Government-to-Government platform that turns idle public assets into productive public resources.</strong><br/>
  Fleet-first operations platform for Gwalior: register, discover, request, approve, allocate, return — with a full audit spine.
</p>

<p align="center">
  <img alt="stack" src="https://img.shields.io/badge/Next.js%2016%20·%20React%2019%20·%20TypeScript-000?logo=vercel&logoColor=white" />
  <img alt="db" src="https://img.shields.io/badge/Prisma%20·%20Supabase%20Postgres-3ECF8E?logo=supabase&logoColor=white" />
  <img alt="maps" src="https://img.shields.io/badge/MapLibre%20GL%20·%20IoT%20telemetry-4B5563" />
</p>

---

## Why Sanchay exists

Valuable government assets sit unused while other departments spend money acquiring the same things:

- **Vehicles rot in police-station yards.** Seized, impounded and idle vehicles occupy premises for years, lose value, and end up scrapped — worth crores across the state.
- **Government spaces stay vacant.** Rooms, halls and offices in one department's building while another department rents space elsewhere.

Sanchay connects that supply with legitimate government demand: every registered body keeps control of its own assets, and every authorized body can **discover eligible assets across the network and request them for a specific period** — subject to eligibility checks, approval routing and a tamper-evident audit trail.

> The core rule: **seized ≠ bookable.** Legal status is enforced server-side (fail-closed); the AI can explain but never decide; restricted assets are never allocatable.

## Modules

| Module | What it does |
|---|---|
| **Dashboard** | Ranked "needs attention", KPIs, fleet status, utilization, live pulse, AI operations summary |
| **Fleet registry** `/vehicles` | Filters, saved quick filters, bulk actions, validated CSV import, 4-step registration wizard with AI document scan |
| **Vehicle passport** `/vehicles/[id]` | Eligibility & restrictions, documents, trips, compliance renewals, maintenance, legal records, eCourts case linkage, custody & disposal, incidents/SOS, fuel, devices, audit trail |
| **Discovery** `/vehicles/discover` | Cross-station browse-and-book: search other organizations' eligible fleet by date range with per-vehicle availability |
| **Requests & allocations** | Requisition wizard → conflict-checked approval → `RESERVED → AWAITING_HANDOVER → ACTIVE → RETURNED_PENDING_INSPECTION → COMPLETED` |
| **Live map** `/vehicles/map` | Clustered live vehicles, trails, corridor routing, station and incident layers |
| **Custody & disposal** | Seized-vehicle lifecycle: link eCourts case (CNR) → record release or mark auction-ready → **GeM disposal CSV export** |
| **Idle & reuse** `/idle` | Tiered suggestions (review / reallocate / GeM surplus), auction-ready board, disposal export |
| **IoT hub** `/iot` | Device registry, provisioning, gateway health, simulated↔live telemetry with real hardware ingest |
| **Reports, Audit, Settings** | Scoped reports with CSV export, hash-chained verifiable ledger, fleet policy & operators |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · vanilla-CSS design tokens (light + dark) · Prisma 5.22 · Supabase PostgreSQL (server-side only) · MapLibre GL · multi-provider AI (Gemini/NVIDIA/OpenRouter/Groq/Mistral with failover) · zod. Deploys to Vercel.

## Quick start

```bash
npm install                      # also runs prisma generate + copies the MapLibre worker
cp .env.example .env.local       # fill DATABASE_URL / DIRECT_URL (Supabase), SANCHAY_AUTH_SECRET, admin creds
npm run dev                      # boots local Postgres if needed, pushes schema, seeds an empty DB, then starts Next
```

`npm run dev` manages the local database automatically: when `DATABASE_URL` points at `postgresql://postgres:postgres@localhost:54329/sanchay`, it starts the embedded Postgres (no Docker), applies the schema, and seeds the Gwalior demo fleet only when the database is empty. Set `SANCHAY_SKIP_SEED=1` to skip seeding. Use `npm run dev:next` to run Next.js without the database bootstrap.

For Supabase: point `DATABASE_URL` / `DIRECT_URL` at your project, run `npm run db:push`, `npm run db:seed`, then `npm run db:rls` (recommended: enable RLS + revoke anon/authenticated server-only access).

Demo operators (created by the seed, shared password printed by the seed CLI):
`admin`, `dept.officer`, `station.kotwali`, `driver.demo`, `auditor.demo`.

Checks: `npm run typecheck` · `npm run lint` · `npm run build` · `npm test`

## Security & governance model

| Concern | Implementation |
|---|---|
| Auth | HMAC-signed `sanchay-session` cookie, `proxy.ts` gate + `requirePermission` on every route, scrypt hashes, brute-force throttle |
| Roles | Admin, org admin, dept officer, station officer, field staff, auditor — capability matrix in `lib/auth/roles.ts` |
| Eligibility | Server-side, fail-closed (`lib/cloud/eligibility.ts`): seized/custody → never allocatable; DB-level CHECK as backstop |
| Reservations | Overlap blocked by a PostgreSQL `EXCLUDE` constraint + `SELECT … FOR UPDATE` re-check in the approval transaction |
| Governance | Hash-chained `AuditLog` (verified on `/audit`), backend event log, `SyncJob` retry queue |
| Privacy | Cross-org vehicle data is masked (registration, position); telemetry is org-tree scoped; exports are formula-injection guarded and audited |
| Offline | Incident capture queues in the browser and syncs when back online |

## IoT / GPS

Simulated devices drive the Gwalior road network in the browser (clearly badged "Simulated"). Real hardware plugs in through `POST /api/iot/ingest`:

```bash
curl -X POST https://<your-host>/api/iot/ingest \
  -H "Authorization: Bearer $SANCHAY_IOT_INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '{"deviceCode":"GPS-00085","lat":26.2183,"lng":78.1828,"speedKmph":42,"heading":90,"ignition":true}'
```

The first accepted packet flips the device from simulated to live; real data then overrides the simulator.

## Deploy to Vercel

1. Create the Supabase project; copy pooler (6543, `?pgbouncer=true`) and direct (5432) URLs into Vercel env vars.
2. Set `SANCHAY_AUTH_SECRET`, `SANCHAY_ADMIN_USERNAME`, `SANCHAY_ADMIN_PASSWORD`, `SANCHAY_IOT_INGEST_TOKEN`, `CRON_SECRET`.
3. Run `npx prisma db push` and `npm run db:seed` once, then `npm run db:rls`.
4. Basemap defaults to OpenStreetMap tiles (light-use policy); set `NEXT_PUBLIC_MAP_TILES_URL` for production.

See [`docs/UNDERSTANDING.md`](docs/UNDERSTANDING.md) for the product analysis and UX flow map, and [`docs/BUILD_CONTRACT.md`](docs/BUILD_CONTRACT.md) for internal contracts. The full two-module specification pack lives in [`SANCHAY_Full_Specification_Spaces_and_Vehicles/`](SANCHAY_Full_Specification_Spaces_and_Vehicles/SANCHAY_Full_Specification).

## Roadmap

- **Phase 1 — Vehicles (this repo)**: fleet, custody & disposal, telemetry, governance ✅
- **Phase 2 — Civic Spaces**: registry, availability calendars, booking, idle activation (`/spaces` placeholder today)

---

<p align="center"><sub>Pilot: Gwalior, Madhya Pradesh · Built by team PARAKRAM</sub></p>
