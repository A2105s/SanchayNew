# Sanchay AI Automation Blueprint: Transitioning Municipal Administrators from Operators to Managers

**Author**: Antigravity AI Architecture Team  
**Scope**: Sanchay Public Asset Intelligence Platform (`SanchayNew`)  
**Target Roles**: `ADMIN`, `ORG_ADMIN`, `DEPT_OFFICER` (Approvers), `STATION_OFFICER` (Fleet Managers)  
**Status**: Architecture & Implementation Specification  

---

## 1. Executive Summary & Vision

Currently, government municipal administrators and station officers spend significant hours on manual paperwork: typing vehicle registration details from physical smartcards, cross-checking PUC and fitness validity, calculating seating capacity versus passenger lists, following up on overdue vehicle returns, and managing civic space booking spreadsheets.

This blueprint outlines how Sanchay's **existing zero-dependency, server-only AI subsystem** (comprising Google Gemini, Groq Cloud, NVIDIA NIM, and Mistral AI) can be transformed into an **Autonomous Operational Layer**.

Instead of acting as a manual clerk, the administrator acts as an **Executive Manager**:
- The system automatically detects compliance expirations, idle assets, and maintenance anomalies.
- AI pre-screens requests, checks municipal rules, audits spatial ratios, and prepares **1-click decision cards**.
- Mobile photos of certificates and handover sheets are automatically parsed via vision models.
- The human officer simply **supervises, reviews, and clicks to commit** auditable database transactions.

```
                      OLD PARADIGM: MANUAL OPERATOR
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Paperwork &    │ ──> │ Manual Data     │ ──> │ Manual Cross-   │
│  Phone Calls    │     │ Entry & Typing  │     │ Verification    │
└─────────────────┘     └─────────────────┘     └─────────────────┘

                     NEW PARADIGM: EXECUTIVE MANAGER
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ AI Background   │ ──> │ Pre-Drafted     │ ──> │ 1-Click Human   │
│ Automation      │     │ Action Cards    │     │ Approval/Commit │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## 2. Core AI Foundation Already Implemented in Sanchay

The Sanchay platform already contains a robust, server-side AI architecture (`lib/ai/` and `app/api/ai/`):

### 2.1 Multi-Provider Cascade & Resilient Routing (`lib/ai/providers.ts`)
The platform implements an automated fallback chain (`['groq', 'nvidia', 'mistral', 'openrouter', 'gemini']`):
1. **Groq Cloud (`qwen/qwen3.8-27b`)**: Ultra-fast (~290ms) inference. Ideal for real-time natural language drafting and sub-second approver triage.
2. **NVIDIA NIM (`nemotron-3.5-super-vl-120b-a12b`)**: Complex multimodal reasoning (~1400ms). Ideal for multi-variable policy verification and fire-safety capacity audits.
3. **Mistral AI (`pixtral-12b-2409`)**: High-accuracy vision OCR (~1180ms). Reads noisy Indian vehicle RC smartcards, PUC slips, and insurance policies.
4. **Google Gemini (`gemini-3.8-flash`)**: Extended context window (~1480ms). Fleet-wide health synthesis and long audit summaries.
5. **OpenRouter**: Redundant community fallback.

*Key Characteristics*:
- **Automatic Retry**: Built-in 1-retry handling on HTTP `429` and `>=500`.
- **Zero Downtime Degradation**: Returns `{ degraded: true }` with deterministic summaries if all providers fail; never crashes API handlers.
- **Strict Boundary Guardrails (`lib/ai/prompts.ts`)**: AI is strictly advisory. The model explains, summarizes, drafts, and suggests, but **cannot directly mutate state, approve requests, or override backend eligibility checks**.

### 2.2 Active AI Services
- **Pulse (`/api/ai/pulse`)**: High-level operational digest of fleet health, overdue returns, and prioritized navigation links.
- **Copilot (`/api/ai/copilot`)**: Conversational Q&A scoped to the caller's organization (`buildAiContext`).
- **Extract-Document (`/api/ai/extract-document`)**: Vision model extracting registration, chassis, make/model, fuel, seating, and expiry dates from uploaded photos.
- **Draft-Request (`/api/ai/draft-request`)**: Converts natural language sentences into structured `AssetRequest` drafts and searches candidate vehicles.
- **Polish (`/api/ai/polish`)**: Structure-preserving professional rewrites for incident logs, maintenance tickets, handovers, returns, and request justifications.

---

## 3. Administrative Persona Mapping

Sanchay enforces strict separation of duties (`lib/auth/roles.ts`). AI automations are tailored to each administrative level:

| Role in Codebase | Former Operator Bottleneck | Modern Managerial Experience |
| :--- | :--- | :--- |
| **`STATION_OFFICER`**<br>*(Unit Fleet Manager)* | Manually tracks certificate dates; types RC/PUC numbers; writes return inspection logs from scratch. | **Autonomous Monitoring**: Proactive push notifications for expiring certificates; snaps photo of renewed slip to auto-fill renewal modal; AI pre-diffs return checklists. |
| **`DEPT_OFFICER`**<br>*(Approving Officer)* | Manually calculates passenger-to-vehicle fit, checks maintenance history, and validates department justification. | **Smart Triage Copilot**: Pre-screened request cards with 1-click approvals or auto-drafted change requests. |
| **`ORG_ADMIN`**<br>*(Department / Muni Head)* | Coordinates cross-department bookings, identifies forgotten idle assets, handles hall relocations manually. | **Executive Pulse & Rebalancer**: Auto-detects 14+ day idle civic spaces and vehicles; 1-click inter-departmental transfers and GeM surplus flagging. |
| **`ADMIN`**<br>*(Platform Administrator)* | Manually audits error logs, tracks telemetry stale rates, monitors multi-tenant compliance. | **System Health Synthesis**: Real-time AI provider routing monitor, automated anomaly detection, centralized audit digests. |

---

## 4. Vehicle & Fleet Operational Automations

```
                     CRON TRIGGER (Daily 06:00 IST)
                      GET /api/cloud/sync-jobs/process
                                    │
                                    ▼
                     [ReevaluateEligibility SyncJob]
                      lib/cloud/eligibility.ts:271
                                    │
                ┌───────────────────┴───────────────────┐
                ▼                                       ▼
     [Compliance Expiry Check]               [Idle Asset Scan]
      checkDoc('PUC', 'Ins', 'Fit')           lib/fleet/idle.ts
      daysUntil <= 30 (warn)                  idleDays >= 7 (reallocate)
      daysUntil <= 7  (critical)              idleDays >= 30 (GeM surplus)
                │                                       │
                ▼                                       ▼
     [Idempotent Notification]               [AI Redistribution Recommender]
      eventKey: compliance:<id>:<doc>         Identifies starved stations
      Pushes to STATION_OFFICER               Auto-drafts TransferRequest
                │                                       │
                ▼                                       ▼
     [Mobile Vision Upload]                  [Manager Approval Card]
      POST /api/ai/extract-document           1-Click Review & Commit
      Auto-fills renewal modal                Executes DB Transaction
```

### 4.1 Proactive Compliance & 1-Click Vision Renewal
- **Background Scanner**: Augment the existing `ReevaluateEligibility` sync job (`lib/cloud/sync-jobs.ts#L71`). When `daysUntil(expiry) <= 30` (warning) or `<= 7` (critical), trigger `notify()` (`lib/cloud/notifications.ts#L27`).
- **Idempotent Event Keys**: To prevent duplicate alerts, construct deterministic keys:
  ```ts
  const eventKey = `compliance:${vehicle.id}:${doc}:${severity}:${expiry.toISOString().slice(0, 10)}`;
  ```
- **Vision-Assisted Renewal**:
  1. Officer receives notification: *"PUC for MP07-GA-1034 expires in 5 days."*
  2. Clicking the alert opens the renewal modal with `<DocumentScanPanel />` (`components/ai/DocumentScanPanel.tsx`).
  3. Officer captures/uploads the mobile photo of the new slip.
  4. `/api/ai/extract-document` extracts the new expiry date and validates the registration number.
  5. Officer verifies the pre-filled form with high confidence score and clicks **"Renew & Verify"** (calling `renewCompliance()` in `lib/cloud/ops/vehicles.ts`).

### 4.2 Intelligent Request Triage & "Smart Approver Copilot"
- **On-Demand Triage Route**: `POST /api/ai/requests/[id]/triage` (permission: `request.review`).
- **Validation Engine (Groq / NVIDIA NIM)**:
  - **Passenger & Class Match**: Flags if passenger count exceeds vehicle capacity (e.g., 6 officers requested for a 4-seater patrol car).
  - **Compliance Verification**: Checks that PUC/Insurance/Fitness will remain valid across the entire requested trip window.
  - **Utilization Balance**: Suggests an equivalent idle vehicle if the requested vehicle has high wear/mileage.
- **UI Integration (`components/requests/RequestDetail.tsx`)**:
  - Displays a **Smart Approval Card**:
    > *"AI Recommendation: **APPROVE** (Confidence 97%). Vehicle SCH-V-0042 is fully compliant through Dec 2026, fits 3 passengers, and has 0 open maintenance tickets."*
  - If discrepancies exist, AI pre-populates the exact comment for `requestChanges()` or `rejectRequest()`, allowing the approver to act with 1 click.

### 4.3 Post-Return Discrepancy Auditing & Incident Hold
- During return inspection (`lib/cloud/ops/allocations.ts#L159-L182`):
  1. The officer records return notes and odometer/fuel readings.
  2. The system calls `/api/ai/polish` (kind: `'return'`) to compare `HandoverRecord.checklist` against `ReturnRecord.conditionNotes`.
  3. Detects anomalies: fuel drop inconsistent with kilometers driven, reported scratches, missing stepney/jack.
  4. If clean: pre-selects `decision: 'ACCEPTED'` (transitions allocation to `COMPLETED`).
  5. If discrepancies exist: pre-selects `decision: 'DISPUTED'`, automatically places the vehicle on `INCIDENT_HOLD` (`lib/cloud/ops/allocations.ts#L175-L176`), and drafts an `IncidentReport`.

### 4.4 Inter-Station Fleet Balancing & GeM Surplus Advisor
- Background scanner evaluates `StationInventory` (`lib/cloud/ops/transfers.ts#L39-L58`) against station demand.
- If Station A has 0 available patrol cars and 5 pending urgent requests, while Station B has 3 patrol cars idle for > 7 days (`lib/fleet/idle.ts`), AI prepares a recommended `TransferRequest`.
- Vehicles with `idleDays >= 30` are automatically highlighted in the ORG_ADMIN dashboard as candidates for the Government e-Marketplace (GeM) surplus/auction pool.

---

## 5. Civic Spaces Module (`/spaces`): Automation Blueprint

The Civic Spaces module manages government halls, auditoriums, training centers, and community rooms (`prisma/schema.prisma#L798-L925`). Currently, it possesses robust database structures and booking logic, but **lacks AI automation and notification wiring**.

```
       ┌────────────────────────────────────────────────────────┐
       │              Civic Spaces AI Subsystem                 │
       └───────────────────────────┬────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
[/api/ai/spaces/draft]   [/api/ai/spaces/triage]   [/api/ai/spaces/pulse]
 • Natural language       • Capacity sanity check   • 14+ day idle facilities
   booking assistant      • Department mandate fit  • Maintenance conflict
 • Auto IST translation   • Overcrowding auditor      relocation agent
 • Matches via            • Auto-drafts approval    • Inter-department venue
   searchSpaces()           or rejection comments     sharing recommender
```

### 5.1 Natural Language Space Booking Assistant (`/api/ai/spaces/draft-booking`)
- **Operator Problem**: Booking currently requires browsing categories, checking seat numbers, manually translating dates/times into IST operating hours, and checking calendar slots.
- **Automated Workflow**:
  1. Organizers type in plain language:
     > *"Need a hall with projector and AC for 70 election training officers next Tuesday 10:00 to 14:00."*
  2. `POST /api/ai/spaces/draft-booking` translates the query to IST ISO-8601 timestamps and structured filters (`category: 'TRAINING_HALL'`, `minCapacity: 70`, `amenities: ['projector', 'ac']`).
  3. Automatically queries `searchSpaces()` (`lib/cloud/ops/spaces.ts#L97-L158`) and validates against `bookingPolicyRejection()` (`lib/fleet/spaces.ts#L62-L92`).
  4. Pre-fills the booking modal on `/spaces` and `/spaces/bookings` with the highest-ranked available venue.

### 5.2 Civic Space Approver Copilot & Safety Ratio Auditor
- **Location**: `app/spaces/bookings/page.tsx` review queue (`lib/cloud/ops/space-bookings.ts#L173-L200`).
- **AI Triage Capabilities**:
  - **Fire Safety & Spatial Ratio**: Checks `areaSqft / attendees`. If an organizer requests 300 people in a 1,200 sq ft hall (4 sq ft/person), AI flags: *"Critical overcrowding risk: municipal safety guidelines mandate >= 10-12 sq ft per person."*
  - **Department Mandate Check**: Validates if the stated purpose aligns with the requesting department.
  - **Pre-Drafted Action Notes**: 1-click approval with generated confirmation note, or 1-click rejection with polite policy citation.

### 5.3 Emergency Maintenance Relocation Agent
- **Trigger**: When emergency maintenance is raised on a space (`blocksBooking: true` in `lib/cloud/ops/spaces.ts#L236-L252`).
- **Automated Action**:
  1. Queries all confirmed future bookings (`status: 'CONFIRMED'`) affected by the maintenance window.
  2. Autonomous venue finder searches for equivalent unbooked spaces in the same campus/zone matching capacity and amenities.
  3. Staged on the manager's dashboard as a **Displacement Resolution Task**:
     > *"Chamber Hall is blocked for electrical repair on 12-Nov. Alternative found: Conference Hall B (capacity 80, AC). [1-Click Confirm Relocation]"*
  4. With 1 click, the admin commits the venue reassignment and notifies affected organizers.

### 5.4 Facility Operations Pulse & Idle Facility Activation (`/api/ai/spaces/pulse`)
- Integrates with `spaceIdleDays()` (`lib/fleet/spaces.ts#L122`) and `idleAlertDays: 14` (`lib/cloud/ops/space-settings.ts#L15`).
- Generates periodic facility insights:
  - Highlights spaces idle for more than 14 days.
  - Identifies upcoming demand hotspots.
  - Recommends inter-departmental venue sharing (e.g., offering an idle Revenue Department auditorium to District Education for teacher seminars).

### 5.5 Space Registration Spec Polisher & Validator
- Mounted inside the space registration modal (`app/spaces/page.tsx`).
- Polishes space description and rules using `kind: 'space-spec'`.
- Audits sanity of inputted parameters (capacity, square footage, air conditioning feasibility) before submission.

---

## 6. End-to-End System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js UI Layer (App Router)                   │
│   • /dashboard (AiPulseSlot)            • /spaces (SpacePulseSlot)     │
│   • /requests/[id] (AiTriageCard)       • /spaces/bookings (Triage)    │
│   • /compliance (DocumentScanModal)     • Modals (PolishButton)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP Fetch / Server Actions
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Middleware & Security Layer                      │
│   • lib/ai/route.ts (aiRoute): Session Auth + Permission Check         │
│   • lib/ai/guard.ts: enforceAiRateLimit (20/min) + redactSecrets       │
│   • lib/ai/settings.ts: Runtime provider routing & feature toggles     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         lib/ai Orchestrator                            │
│   • lib/ai/context.ts: buildAiContext() [Minimization, Scoping]        │
│   • lib/ai/prompts.ts: BOUNDARIES + strict JSON mode system prompts    │
│   • lib/ai/providers.ts: generate() with auto-retry & provider chain   │
└───────────────┬───────────────────┬───────────────────┬────────────────┘
                │                   │                   │
         Groq Cloud            NVIDIA NIM          Mistral AI
       (qwen/qwen3.8)        (nemotron-3.5)      (pixtral-12b)
     [Fast Triage / Draft]  [Deep Policy Audit]  [Vision OCR]
                │                   │                   │
                └───────────────────┼───────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Transactional Data & Governance Store                  │
│   • Prisma ORM -> Supabase PostgreSQL (Server-Only Access)             │
│   • Sync Queue (SyncJob: ReevaluateEligibility, ExpireRequests)        │
│   • Idempotent Notifications (Deterministic eventKey format)           │
│   • Append-only Audit Ledger (writeAudit with correlationId)           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Model Allocation Matrix

| Task / Automation | Primary Engine | Fallback Engine | Rationale |
| :--- | :--- | :--- | :--- |
| **Request & Space NL Drafting** | **Groq Cloud** (`qwen3.8-27b`) | NVIDIA NIM | Sub-second latency (~290ms) provides real-time form population while typing |
| **Document Scanning (RC/PUC/Fitness)** | **Mistral AI** (`pixtral-12b`) | Gemini 3.8 Flash | Highest visual fidelity on low-resolution scanned Indian stamp papers and receipts |
| **Approver Policy Triage** | **NVIDIA NIM** (`nemotron-3.5`) | Groq Cloud | Multi-variable reasoning across compliance rules, capacity limits, and past incidents |
| **Operations Pulse Digest** | **Groq Cloud** | Gemini 3.8 Flash | Inexpensive background synthesis; deterministic JSON output |
| **Text Polishing & Discrepancies** | **Groq Cloud** | Mistral AI | Fast grammar/structure alignment without inventing facts |

---

## 8. Implementation Roadmap

### Phase 1: Proactive Compliance & Document Scanning (Fleet)
- [ ] Add compliance notification dispatch logic to `ReevaluateEligibility` in `lib/cloud/sync-jobs.ts`.
- [ ] Embed `<DocumentScanPanel />` into the compliance renewal modal (`app/compliance/page.tsx`) and `VehicleDetail.tsx`.

### Phase 2: Smart Approver Copilot & Triage Cards
- [ ] Implement `POST /api/ai/requests/[id]/triage` wrapped by `aiRoute` with `'request.review'`.
- [ ] Mount the AI Triage Recommendation Card in `components/requests/RequestDetail.tsx`.

### Phase 3: Civic Spaces AI Core Routes & Booking Assistant
- [ ] Implement `POST /api/ai/spaces/draft-booking` with `'space.book'` permission.
- [ ] Build `<DraftSpaceBookingPanel />` and mount on `app/spaces/page.tsx` and `app/spaces/bookings/page.tsx`.
- [ ] Wire `notify()` into `space-bookings.ts` and `space-requests.ts` so space events trigger in-app notifications.

### Phase 4: Facility Pulse & Maintenance Relocation Agent
- [ ] Implement `POST /api/ai/spaces/pulse` to digest spaces idle >= 14 days per `SpaceSettings`.
- [ ] Add the Emergency Relocation handler to `raiseMaintenance` in `lib/cloud/ops/spaces.ts`.

