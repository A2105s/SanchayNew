# Sanchay — 28 October 2026 update

Everything that was done tonight, in order, with enough detail to reproduce or review.

---

## 1. Project brought up and verified running

- Dev server started (`npm run dev`, Next.js 16.4.3 Turbopack) at **http://localhost:3000**.
- Verified end-to-end:
  - Root `/` and `/login` return 200; the `proxy.ts` auth gate correctly 401s unauthenticated API calls.
  - Supabase Postgres connection live: **38 stations, 149 vehicles, 77 IoT devices** seeded.
  - Login verified via `POST /api/auth/login` with the bootstrap admin credentials from `.env.local` — session cookie issued.
- One transient `Can't reach database server … :6543` appeared in the log (Supabase pooler hiccup); it recovered on its own and retests passed.

## 2. Tooling added to the workflow

- **Ponytail skill** loaded (minimal-change discipline; active all session).
- **Five skills installed from skillselion.com** (chosen by highest install counts + project fit), via `npx skills add <repo> --skill <name>` into project `.agents/skills/` and copied to `~/.agents/skills/`:
  - `tdd` (1.15M installs), `code-review` (803K), `webapp-testing` (190K), `supabase-postgres-best-practices` (462K), `prisma-client-api` (393K).
  - Security category needs were already covered by locally installed `security-and-hardening` and `security-audit`.
- **Context7 MCP** wired in and used for real lookups: confirmed the Next.js 16 `middleware → proxy` rename (the repo's `proxy.ts` is the correct v16 convention) and Prisma interactive-transaction options (`maxWait`, `timeout`, `isolationLevel`) — which we later needed for real (see §5).

## 3. Repository synced from GitHub

- Local `main` was 4 commits behind `origin/main`, no local commits ahead → **fast-forward pull, zero merge conflicts**.
- Incoming commits: corridor-routing telemetry simulation, sector fleet icons, IoT/maintenance horizontal tables with `ExpandableCard`, new `public/data/gwalior-routes.json` route dataset.
- Potential collision `Roads.kml` existed locally untracked AND in the incoming commits: compared first — **byte-identical**, backed up to temp, pulled, re-verified (only CRLF normalization difference from `core.autocrlf=true`; no data loss).
- Post-sync: pages 200, DB connected, `npm run typecheck` clean.

## 4. Original vision recovered from your ChatGPT ideation

- The share link renders client-side, so the conversation was pulled from `chatgpt.com/backend-api/share/6ae231da-d8e0-83ee-a0cd-fd8b30b78f5e` (276 messages).
- Synthesis saved to project memory. Key points:
  - **Problem:** vehicles rotting in police yards + vacant government spaces; fragmented records stop supply meeting demand.
  - **Vision:** G2G asset discovery → eligibility → request → approval → time-bound allocation → tracked return → audit trail. Not a marketplace.
  - **Critical rule (from the ideation itself):** seized vehicles are never ordinary bookable fleet; states = Restricted / Pending verification / Eligible for authorized temporary use / Eligible for authorized disposal. AI explains, never decides.
- Discovered the full **20-file spec pack** from that chat already sits in the repo (`SANCHAY_Full_Specification_Spaces_and_Vehicles/`).
- **Gap analysis result:** the fleet module had already implemented legal-status gating (`lib/cloud/eligibility.ts`, fail-closed), date-range cross-station discovery (`/vehicles/discover` + Postgres `EXCLUDE` constraint), and grounded AI. What was actually missing:
  1. **Seized-vehicle lifecycle** — no court-case linkage UI (eCourts API existed but nothing consumed it), no release-to-owner flow, no auction/GeM export (README promised it; verified absent).
  2. QR passport / QR-PWA check-in — **skipped on your instruction**.
  3. Map visibility rules — needed verification.

## 5. Seized-vehicle custody & disposal workflow (the main build)

### Schema (`prisma/schema.prisma`, pushed with `npm run db:push`)
- `Vehicle`: new `custodyState` (`IN_CUSTODY | AUCTION_READY | RELEASED | DISPOSED`, null = ordinary fleet), `custodyNote`, `custodyUpdatedAt`.
- `LegalRecord`: new eCourts linkage fields `cnr`, `caseTitle`, `caseStage`, `courtName`, `caseVerifiedAt`.

### Backend (`lib/cloud/ops/vehicles.ts`, `lib/validation/schemas.ts`, actions route)
Four new audited vehicle actions (permission `restriction.manage`, held by ORG_ADMIN / DEPT_OFFICER — deliberately **not** ADMIN, matching the platform's capability matrix):
- **`linkCourtCase`** — fetches an eCourts case by 16-char CNR (`getCaseByCnr`, cached, no billable refresh) and stores it as a `COURT_CASE` legal record with case metadata. Evidence only, never an eligibility verdict. Duplicate-open-case guard (409).
- **`refreshCourtCase`** — re-reads the cached case, updates stage/status/next hearing.
- **`releaseCustody`** — seized vehicles only. In one transaction: lifts all active `LEGAL_CUSTODY`/`COURT_ORDER` restrictions (append-only lift), closes open seizure/court records, sets `custodyState=RELEASED`, retires the asset, re-evaluates eligibility (stays INELIGIBLE — correct: it's no longer ours), recomputes station inventory, writes audit + reason.
- **`markAuctionReady`** — fleet or seized vehicles. Sets `AUCTION_READY`, retires the asset (drops it from allocation and reuse pools), audits the authorizing authority.
- Guards: closed workflows (`RELEASED`/`DISPOSED`) reject further actions (409); duplicates rejected (409); unverified vehicles can't be disposed.
- Transaction options `{ timeout: 20000, maxWait: 10000 }` added after the default 5s Prisma timeout tripped during testing (Context7-recommended pattern).

### GeM disposal export
- New report kind **`gem-disposal`** (`lib/cloud/ops/reports.ts` + `types/index.ts`): lists all `AUCTION_READY` vehicles in scope, org-tree scoped, registration masked, formula-injection guarded, audited — same pipeline as every other report.
- Served at `GET /api/cloud/exports/gem-disposal` (permission `export`) → `text/csv`.

### UI
- **Vehicle passport → Operations tab** (`components/vehicles/VehicleDetail.tsx`): new **Custody & disposal** panel — custody badge + note, warning when a seized vehicle has no linked court case, and (for officers with `restriction.manage`) inline forms for *Link court case (CNR)*, *Record custody release* (authority / released-to / reason), *Mark auction-ready*. Linked cases show CNR, stage and last-verified time with a *Refresh case* button; the legal-records list now shows authority badges and case metadata.
- **Idle & reuse page** (`app/idle/page.tsx`): new **Disposal & auction (GeM)** section — auction-ready table with disposal authorization notes, **Export GeM CSV** button (gated on `export` permission), "Disposal options" link on 30+ day idle reuse rows; retired-fleet list now excludes auction-ready vehicles. `SectionHeading` gained an optional `action` slot.

### Verification performed (runtime, not just types)
- `npm run typecheck` clean.
- End-to-end on a real seeded seized vehicle (`SCH-V-0103`, MP07-CC-1103) via the domain layer as a DEPT_OFFICER session:
  - `markAuctionReady` → state + audit OK; vehicle appeared in the gem-disposal query; duplicate attempt correctly 409.
  - `releaseCustody` → `RELEASED` + `RETIRED`, restriction lifted, seizure records closed, audit rows written; second release correctly blocked ("workflow is closed").
  - `GET /api/cloud/exports/gem-disposal` → 200 `text/csv` with correct header (export route verified live through the HTTP API as ADMIN).
- Test vehicle restored to its original state afterward (`custodyState` null, `OUT_OF_SERVICE`, restriction active again).
- **Note:** the two audit-ledger entries by user `workflow-test` (`AuctionReadyMarked`, `CustodyReleased`) remain in the audit trail for this vehicle — the ledger is append-only/hash-chained by design and cannot be edited without breaking the chain.

## 6. Map visibility rules (spec 17) — verified, no fix needed

- Code path: `getLiveDeltas` (`lib/cloud/fleet.ts`) scopes real telemetry by `orgTree(user)`.
- Runtime test with a fabricated CMHO-scoped DEPT_OFFICER session: **0 of the police org's 125 vehicles leaked** into their telemetry feed. Platform admin sees all orgs (by design). Cross-org vehicle detail masks registration/position at the API layer.
- Conclusion: the live map is already spec-compliant; the earlier "verify role-based location precision" concern is closed.

## 7. Browser-tab logo fixed

- Cause: `app/icon.png` was a **5000×5000** PNG, so Next served `<link rel="icon" sizes="5000x5000">`, which browsers reject for tabs.
- Fix: resized in place to **512×512** (original backed up to temp). Server now serves `sizes="512x512"` and the Sanchay hexagon shows in the tab.
- Added `public/Sanchay-512.png` (37 KB, from the 5000px master) for README use.

## 8. README rewritten

- New `README.md`: logo header + badges, "Why Sanchay exists" (the rotting-yards / vacant-spaces problem), module table (including the new custody & disposal module), stack line (now mentions multi-provider AI), quick start, security & governance table (including the custody workflow, EXCLUDE constraint, masking), IoT ingest example, Vercel deploy, roadmap (Phase 1 vehicles ✅ / Phase 2 spaces), spec-pack links.

## Current state

- Dev server running on http://localhost:3000 with all changes hot-loaded.
- Typecheck clean; database schema pushed; app verified.
- Not yet committed — say the word and tonight's work can be committed/pushed as one or several commits.
- Next up when you are: the **Civic Spaces module** (spec files 00–12), reusing the eligibility, request/approval, reporting and map patterns the vehicle module already has.
