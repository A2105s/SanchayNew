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

---

# Addendum (same night): Civic Spaces module — Phase 2 build

## Schema (`prisma/schema.prisma`, pushed via `npm run db:push`)
- **`Space`** — assetCode `SCH-SP-####`, name, category (MEETING_ROOM / TRAINING_HALL / AUDITORIUM / OFFICE / COMMUNITY_HALL / STORE / OTHER), org ownership, building/address/district, lat+lng, capacity, areaSqft, `operationalState` (AVAILABLE | IDLE | RESTRICTED | RETIRED — "Booked" is derived from live bookings, "Maintenance" from blocking tickets), amenities/accessibility (JSON arrays), per-weekday IST operating hours, min/max booking hours, booking lead days, manager/contact.
- **`SpaceBooking`** — bookingCode `SB-YYYY-####`, purpose, attendees, startAt/endAt, status `PENDING | CONFIRMED | REJECTED | CANCELLED | COMPLETED`, review/rejection/cancellation metadata.
- **`SpaceMaintenance`** — severity LOW→CRITICAL, OPEN/IN_PROGRESS/RESOLVED, `blocksBooking` flag (CRITICAL defaults to blocking).
- **`SpaceRequest`** — REGISTER / UPDATE proposals, status `SUBMITTED | UNDER_REVIEW | NEEDS_INFO | APPROVED | REJECTED | WITHDRAWN`, reviewer fields, `appliedAt` idempotency marker.

**Database-level guarantees** (`prisma/post-push.sql`, applied): a PostgreSQL `EXCLUDE USING gist` constraint makes two overlapping live bookings on one space impossible even under concurrent requests (PENDING also blocks, preventing double-holds); period validity and CHECK constraints on every enumerated state.

## Booking engine (`lib/fleet/spaces.ts` pure policy + `lib/cloud/ops/space-bookings.ts`)
- Pure policy functions: IST (UTC+5:30, fixed offset) operating-hours window checks, same-day enforcement, min/max duration, lead-time window, capacity, slot states `available / pending approval / booked / blocked / maintenance` (text-encoded, spec 09).
- `createSpaceBooking`: full policy re-validation server-side, slot re-check inside the transaction, then auto-CONFIRM if duration ≤ the configurable threshold, else PENDING for review. The EXCLUDE constraint is the final concurrency guard (violation → friendly 409 "slot just taken").
- Review actions: approve (re-validates slot availability first), reject (reason), cancel (requester or reviewing officer), complete. **Self-review is always blocked** (separation of duties). Every transition is audited.
- Calendar endpoint: per-space live bookings + maintenance-blocked flag.

## Request center (`lib/cloud/ops/space-requests.ts`, spec 11)
- REGISTER and UPDATE proposals with duplicate-open-request guard.
- Reviewer actions: start review, request info, approve (idempotent apply), reject, withdraw (requester only). Stored payloads are **re-validated against the space field schema at apply time** — persisted JSON is never trusted. Approved UPDATEs write before/after audit entries; approved REGISTERs create the space in the **requester's** organization with a fresh asset code.

## Settings (`/spaces/settings`, admin only)
- `approvalThresholdHours` (0 = all bookings need review), `bookingWindowDays`, `idleAlertDays`; every change audited with old/new values and a required reason.

## Reports
- New report kinds in the existing audited report/export pipeline: `space-bookings` (list, CSV exportable) and `space-utilization` (booked hours + booking counts per space).

## API routes (all `requirePermission`, zod-validated, `{success,data}` envelope)
`GET/POST /api/cloud/spaces` · `GET /api/cloud/spaces/[id]` · `POST /api/cloud/spaces/[id]/actions` (update / setState / raiseMaintenance / updateMaintenance) · `GET /api/cloud/spaces/[id]/calendar` · `GET/POST /api/cloud/space-bookings` · `POST /api/cloud/space-bookings/[id]/actions` · `GET/POST /api/cloud/space-requests` · `POST /api/cloud/space-requests/[id]/actions` · `GET/PUT /api/cloud/space-settings`

## Permissions
New capabilities `space.manage` (ORG_ADMIN, DEPT_OFFICER), `space.book` (+ STATION_OFFICER, FIELD_STAFF), `space.review` (ORG_ADMIN, DEPT_OFFICER) added to the authoritative matrix in `lib/auth/roles.ts`.

## UI (EasyLife patterns, light/dark, scoped to role)
- **`/spaces`** — KPI row (in scope / bookable now / in use / idle 14+ d), search (name/address/asset ID), category & state filters, min-capacity and bookable-only filters, card grid with per-card booking rules explained (spec 02: disabled CTAs explain why), registration request modal.
- **`/spaces/[id]`** — full passport: about, amenities/accessibility, operating hours panel, MiniMap when coordinates exist, maintenance tickets (raise/update for managers), recent bookings, booking dialog with live policy hints (duration vs allowed range, lead date, slot-conflict messaging).
- **`/spaces/bookings`** — my bookings (upcoming/pending/completed/cancelled/rejected buckets) + review-queue mode with approve/reject/cancel dialogs.
- **`/spaces/requests`** — my requests + review queue with the full state machine, proposed-changes viewer, withdraw.
- **`/spaces/settings`** — booking policy form.
- Sidebar + command palette wired; the old `/spaces` placeholder is replaced.

## Seed + verification
- 6 demo spaces seeded across District Administration, Police, CMHO, GMC, PWD and Election orgs with realistic operating hours and amenities.
- Runtime-verified end-to-end (domain + HTTP):
  1. valid 2 h booking → **auto-CONFIRMED** (≤ 4 h threshold)
  2. overlapping request → **409 "slot just taken"**
  3. after-hours request → **422 policy rejection**
  4. 5 h request → **PENDING** review
  5. requester approving own booking → **blocked**
  6. reviewer approval → CONFIRMED, audit rows written
  7. HTTP smoke: spaces search, detail, utilization report, bookings CSV export all 200 through the running server.
- Typecheck and ESLint clean across all new files. Test bookings cleaned from the DB afterward.

## Deliberate scope notes (for the next iteration)
- Full map dashboard with clustering (spec 03/04): detail page uses the existing MiniMap; a dedicated spaces map view is the first follow-up.
- Public citizen signup (spec 05): intentionally not built — Sanchay stays an internal operator platform; spaces reuse the same session/role system.
- Print/QR passport for spaces and notifications on status changes are not wired yet.

---

# Addendum 2: Police-station logins & the IAS oversight narrative

Per the operational model: the requesting loop runs **between two police stations** (or any two government bodies), while senior officials (IAS / District Magistrate) oversee as platform admins **and** act as the court-side approving authority in the seized-vehicle custody workflow. The Spaces module intentionally keeps department-level logins — no station identity needed there.

## What was added

1. **A station-officer login for every police station** — username `ps.<station>` (e.g. `ps.kotwali`, `ps.antri`, `ps.bahodapur`…), display name "Station Incharge — <station>", shared demo password. Created live (37 stations) and added to the seed for fresh installs (`lib/seed/gwalior.ts`).
2. **`dm.gwalior`** — "District Magistrate, Gwalior (IAS) — approving authority", ADMIN role under the District Administration org. Added to the seed too. In the demo narrative this is the higher official: oversees the whole platform as admin, and the court-judge authority is exercised in the custody workflow (release/auction record the authorising authority, e.g. "CJM Gwalior order").
3. **`GET /api/auth/stations`** — public, read-only directory (station name + login username only) that powers the login page. Added to the `proxy.ts` public allowlist.
4. **Login page** — new "Police station login" dropdown listing all stations by name; picking one fills the username and demo password. Demo-account list now leads with `dm.gwalior` and the hint explains the station-to-station loop.

## Verified live
- `ps.kotwali` logs in and sees only its station-scoped fleet (3 vehicles, 1 org).
- Random station (`ps.bahodapur`) logs in via the directory credentials.
- `dm.gwalior` logs in as platform admin.
- Station directory endpoint 200 with 39 station logins after the proxy allowlist change.

## How the demo loop plays out
1. Sign in as **Station A** (e.g. `ps.kotwali`) → `/vehicles/discover` → find an eligible vehicle at **Station B** for a date range → request it.
2. Sign in as **Station B**'s officer (or `dept.officer`) → `/requests` → approve (atomic allocation) → handover → return.
3. Sign in as **`dm.gwalior`** (IAS) → dashboard/audit oversight; for seized vehicles, record release or auction authorisation in the custody workflow citing the court order.
4. Spaces flows run at department level (`dept.health`, `org.police`, `dm.gwalior` for policy) — no station logins, by design.

---

# Addendum 3: Landing page, fixed station picker, station profile

## 1. Landing page (`/`, public)
- The root no longer redirects unauthenticated visitors to /login — it renders a proper **section chooser**: the Sanchay logo, a one-line mission statement, and two large cards:
  - **Vehicles** — "Station sign-in" → `/login?mode=vehicles` (with live-map, custody/court-cases, idle-reuse highlights).
  - **Civic Spaces** — "Department sign-in" → `/login?mode=spaces` (with booking calendar, request center, idle-activation highlights).
- Authenticated visitors still go straight to `/dashboard`.

## 2. Login page — mode-aware, dropdown rebuilt
- **The broken native `<select>` is gone.** Replaced with a custom searchable **StationPicker** (`components/login/StationPicker.tsx`): themed to the login card, with a search box, scrollable list, checkmark on selection, and keyboard-friendly focus. 37 stations are easy to navigate now.
- `?mode=vehicles` → "Station sign-in": station picker + password only.
- `?mode=spaces` → "Department sign-in": username + password (labelled for departments), demo accounts list.
- No mode → both fields + a "Choose a section instead" link back to the landing page.
- Each mode shows its own demo helper (station list vs department accounts).

## 3. Station profile page (`/station`)
- New sidebar entry **"My station"** (visible only to operators attached to a station — station officers and field staff; hidden for department/platform roles).
- Shows: station identity (code, zone, district, incharge, contact, coordinates), fleet mix KPIs (patrol cars / motorcycles / vans / heavy from `StationInventory`), registered vehicle count, active allocations, officers list.
- **Logout lives in the page** (Session panel) — posts to `/api/auth/logout` and returns to the landing page. The sidebar's existing logout remains as well.
- Backed by `GET /api/cloud/station/profile` (session-scoped; 404 with a friendly page for accounts without a station).

## Verified live
- `/` renders both cards; `/login?mode=vehicles|spaces` render; station profile returns Kotwali's real data (3 vehicles, 3 officers); `dm.gwalior` gets the graceful "no station" state; logout works. Typecheck + ESLint clean.

---

# Addendum 4: real logo everywhere, separated sections, sidebar profile

1. **Logo**: `public/logo.png` (the silver "S" mark, transparent) is now the single logo everywhere — favicon (`app/icon.png`), landing page, README, sidebar and login (which already used it). The hexagon (`Sanchay.png` copy) was removed from all surfaces and `public/Sanchay-512.png` deleted.
2. **Vehicles and Spaces fully separated in the sidebar**: spaces now live under their own **"Spaces"** heading (Spaces · Space bookings · Space requests · Booking policy — the policy page is now reachable from the nav for admins). The "More" group is back to Settings + My station. The landing page was already two separate cards, and a bare `/login` now redirects back to the landing chooser so the two logins are never shown merged.
3. **Sidebar profile redone**: the footer is now a proper profile block — initials avatar, operator name, role, and (for station logins) a clickable "Station profile" link that opens `/station`; the logout is an icon button beside it. Station officers therefore have two clear paths to their profile: the nav item and the footer profile.
4. Runtime-verified: landing uses `/logo.png`, favicon serves the S mark, all spaces pages render, station profile returns Kotwali's live inventory (1 patrol car, 1 motorcycle), DM gets the booking-policy page. Typecheck + ESLint clean.

---

# Addendum 5: hard module separation — no more cross-content

1. **Fleet dashboard**: removed the "Civic Spaces — next module" teaser tile; the dashboard is vehicles-only.
2. **Command palette (Ctrl+K)**: every page entry is tagged `vehicles` / `spaces` / `shared`; the palette now shows only the current module's pages plus shared ones (Audit, Settings, Notifications), and vehicle search only appears while browsing the vehicles module.
3. **Sidebar**: fully module-scoped. A **module switcher** (Vehicles ⇄ Spaces tabs) sits under the brand; the nav below shows only the active module's groups — fleet groups (Fleet / Requests / Oversight / Insights) in the vehicles module, the Spaces group in the spaces module; shared groups (Governance/Audit, More/Settings) always show. Groups themselves are domain-tagged so headings never leak.
4. **Login destination**: signing in from the Spaces card now lands on `/spaces`; from the Vehicles card on the fleet dashboard.
5. Fixed an `initials()` helper bug (regex had lost its backslash) spotted during the rework. Typecheck + ESLint clean (remaining palette warnings pre-exist).

---

# Addendum 6: login-driven modules + Supabase-style shell

1. **Switcher buttons removed.** The module is now decided by **where you logged in**: the Vehicles card sets a `sanchay_module=vehicles` preference cookie, the Spaces card sets `spaces` (UI-only cookie — authorization still comes from the session role). The sidebar, header title, and Ctrl+K palette all read that cookie (`lib/client/useModule.ts`). A station officer who logged in through the Vehicles card never sees Spaces navigation, and vice versa.
2. **Supabase-style chrome:**
   - **Sidebar is an icon rail by default** (~72px: icons only) that **expands on hover** to the full 264px with labels, group headings, and the profile block — pure CSS, overlays the content like Supabase. The hamburger still pins it open if you prefer. (The existing `is-collapsed` mode is now the default.)
   - **Header redesigned**: brand moved from the sidebar-center to the header — logo mark + module name ("Vehicles" or "Civic Spaces") on the left, actions (Ask AI, Ctrl+K, notifications, theme, cloud status) on the right, mirroring Supabase's logo + org header.
   - Group headings (Fleet, Requests, Oversight, Spaces…) finally have proper styling (they had none), and hidden content in the collapsed rail (badges, headings, profile) reappears on hover.
3. Typecheck + ESLint clean (remaining warnings pre-exist in AppShell's subscription effects). All shell pages verified 200 with both module cookies.

---

# Addendum 7: sidebar profile restyled ZCode-style

- The profile block at the sidebar's bottom is now a **flat row** — circular initials avatar, name, and role — with no card background; the foot gets a subtle top separator instead.
- The "STATION PROFILE" label is gone: for station logins the **whole row is the link** to `/station` (light hover state); for department/platform roles the row is static identity.
- Logout is a quiet ghost icon on the row's right. In the collapsed rail only the avatar shows; the logout icon appears on hover, matching the rail behavior.

---

# Addendum 8: actual fix for vehicles content leaking into the Spaces sidebar

**Root cause found:** when I domain-tagged the navigation, only the Spaces/shared entries got explicit domains — every vehicle item had `domain: undefined`, and the sidebar filter only rejected items whose domain was *explicitly different*. Undefined passed the filter, and the "append unassigned items" fallback then added the rest — so the Spaces sidebar still showed Fleet, Discover, Live map, Stations, Requests, Allocations, Transfers, Operations, Compliance, Maintenance, Idle, Incidents, IoT hub, Reports, Dashboard and My station.

**Fix:** untagged items now default to the `vehicles` domain (`item.domain ?? 'vehicles'`), so in the Spaces module the sidebar shows only the Spaces group plus the shared entries (Audit, Settings). The Vehicles module is unaffected. Typecheck + lint clean; all Spaces pages verified 200.

---

# Addendum 9: NationTrack-style fleet map from the provided KMZ/KML files

**Simulation status:** the cars simulation itself is healthy — 148 of 149 vehicles are `SIMULATED`, 87 arterial corridors load from the Roads.kml-derived `public/data/gwalior-routes.json`, and the 5-second tick loop drives the A⇄B⇄A motion with dwell parking. No sim code change was needed; the map layer around it is what was rebuilt.

## KMZ/KML files now in use
- **`Police Station.kmz`** → extracted and converted to `public/data/gwalior-map.geojson` (**31 red station pins** with exact KMZ coordinates; raw KML preserved at `public/data/kml/police-stations.kml`).
- **`gwalior.kmz`** → the **city boundary ring** (142-point line) rendered as a blue dashed outline around Gwalior, exactly like the old NationTrack map.
- **`Roads.kml`** → already drives the car simulation corridors (unchanged).

## Live map rebuilt (components/vehicles/LiveMap.tsx)
- **Red teardrop pins for every police station** with the **vehicle count inside** the pin, drop-shadowed like NationTrack. Counts are matched **geographically**: each DB station contributes its vehicles to the nearest KMZ pin within 1.2 km (KMZ names differ from DB names, so the match is spatial, not textual).
- **Hover tooltip** on each pin: "<Station name> | Parked: N" — the NationTrack wording.
- **Click a pin** flies to it at street zoom.
- **Search box now finds stations too**: type "kotwali" and matching stations appear in the panel with their parked counts; clicking flies to the pin.
- **Map controls bottom-right**: zoom buttons, geolocate ("use my location" with user dot) — joining the existing fullscreen toggle.
- The blue dashed **boundary ring** renders on every theme.

Verified: `/vehicles/map` 200, geojson served (31 pins + boundary), 87 sim corridors served; typecheck + ESLint clean (also fixed a pre-existing `any` lint error in the vehicle-marker map).
