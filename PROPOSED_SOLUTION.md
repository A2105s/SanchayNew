# Explanation of Proposed Solution — Technical Breakdown

## 1. System Architecture & Functioning Principles

**Sanchay** is an enterprise-grade Government-to-Government (G2G) Public Asset Intelligence and Autonomous Operations Platform. It addresses a systemic public sector failure: crores of rupees in capital assets (government vehicles, impounded/seized yard vehicles, and vacant civic spaces) sit idle or rotting across departments, while other administrative bodies duplicate public expenditure by procuring or leasing identical resources.

Sanchay operates on a **zero-trust, fail-closed, multi-tier reactive architecture**:

* **Application & Edge Layer**: Next.js 16 (App Router) with React 19 and TypeScript in strict mode, utilizing server components and streaming primitives. Edge security routing (`proxy.ts`) enforces strict Content Security Policy (CSP), CSRF defenses, and cryptographically verified HMAC session authentication.
* **Database & Persistence Spine**: PostgreSQL managed via Supabase and Prisma ORM. Database-level integrity is guaranteed through PostgreSQL GiST `EXCLUDE` range constraints (mathematically preventing temporal allocation collisions) and immutable, append-only transaction tables.
* **Real-Time GIS & Telemetry Hub**: MapLibre GL rendering engine paired with dual-cartography: vector Google Maps/Dark Matter schemas and high-resolution ESRI World Imagery raster layers. Ingests AIS-140 GPS telemetry packets via authenticated, throttled hardware endpoints (`POST /api/iot/ingest`).
* **Multi-Provider Resilient AI Subsystem**: A server-only, zero-dependency AI layer utilizing a self-healing cascade (`Groq Cloud [Qwen 2.5]` → `NVIDIA NIM [Nemotron]` → `Mistral AI [Pixtral Vision]` → `Google Gemini 3.8 Flash`). AI is strictly sandboxed as an advisory synthesis copilot; all mutation, eligibility, and authorization decisions are enforced by deterministic backend engines.

---

## 2. System Inputs and Outputs

```
┌────────────────────────────────────────┐         ┌────────────────────────────────────────┐
│             SYSTEM INPUTS              │         │             SYSTEM OUTPUTS             │
├────────────────────────────────────────┤         ├────────────────────────────────────────┤
│ • IoT / AIS-140 Telemetry Packets      │         │ • Sub-second Real-time Operations Map  │
│ • Optical Images (RC/PUC/Insurance)    │ ──────> │ • 1-Click AI Approver Decision Cards   │
│ • Natural Language Requisitions        │ Sanchay │ • Pre-screened Cross-Org Allocations   │
│ • eCourts Legal CNR & Custody Data     │ Engine  │ • GeM Auction & Surplus Manifests (CSV)│
│ • Departmental Fleet & Spatial Quotas  │         │ • Hash-chained Cryptographic Audit Log │
└────────────────────────────────────────┘         └────────────────────────────────────────┘
```

### Inputs
1. **IoT & Edge Telemetry**: Serialized JSON/NMEA packets containing device hardware code, latitude, longitude, speed, heading, ignition state, and battery metrics.
2. **Multimodal Document Uploads**: High-resolution camera captures of Registration Certificates (RC smartcards), Pollution Under Control (PUC) slips, fitness certificates, and insurance policies.
3. **Natural Language Asset Requests**: Unstructured departmental requests (e.g., *"Need a 7-seater ambulance tomorrow from 9 AM to 6 PM for a pulse polio drive in Morar"*).
4. **Judicial & Legal Metadata**: Centralized eCourts CNR case numbers, judicial detention orders, case disposal dates, and bailiff release certificates.

### Outputs
1. **Live Spatial Operations Stream**: Clustered geospatial fleet map featuring real-time vehicle orientations, radar sweep animations, breadcrumb paths, and planned corridor trajectories.
2. **1-Click Approver Decision Cards**: AI-synthesized policy briefs detailing passenger-to-capacity ratios, maintenance risk indices, and compliance clearances.
3. **Disposal & Re-allocation Manifests**: RFC-4180 and formula-injection-safe CSV exports formatted specifically for the Government e-Marketplace (GeM) auction portal for 30+ day condemned/surplus assets.
4. **Cryptographic Verification Proofs**: Tamper-evident ledger receipts containing SHA-256 hash chains connecting every mutation to its preceding state.

---

## 3. Algorithmic and Mechanical Workflows

### A. Fail-Closed Eligibility & Restriction Engine (`evaluateEligibility`)
The platform implements a deterministic rule engine where legal, physical, and operational constraints are evaluated before any asset can be viewed or reserved:

$$\text{Allocatable} = (\text{Ownership} == \text{GOV\_FLEET}) \land (\text{Status} == \text{ACTIVE}) \land \neg \text{Restricted} \land \neg \text{Seized} \land \text{ComplianceValid}$$

1. **Rule 1 (Custody Isolation)**: If an asset is marked as `SEIZED_IMPOUNDED` or tied to an active police yard custody record, it is immediately marked `INELIGIBLE` with a blocking `SEIZED_CUSTODY` flag. Seized assets can never be booked.
2. **Rule 2 (Judicial Restrictions)**: Any active stay order, court attachment, or inquiry locks the asset into a `RESTRICTED` state.
3. **Rule 3 (Compliance Thresholds)**: PUC, fitness, and insurance expiries are checked dynamically against configurable warning ($\le 30\text{ days}$) and critical ($\le 7\text{ days}$) thresholds. Expired documents immediately trigger blocking compliance failure.
4. **Rule 4 (Data Scoping & Masking)**: Non-eligible or restricted assets owned by foreign stations return HTTP 404 rather than 403, preventing unauthorized intelligence gathering regarding station inventory.

### B. Two-Phase Atomic Reservation & Allocation State Machine
To completely eliminate race conditions and double-booking during peak inter-departmental requisition:

```
[SUBMITTED] ──> [UNDER_REVIEW] ──> [APPROVED (RESERVED)] ──> [AWAITING_HANDOVER] ──> [ACTIVE] ──> [INSPECTION] ──> [COMPLETED]
                                         │
                                         └── PostgreSQL EXCLUDE GiST Constraint (Locks time range)
```

1. **Concurrency Lock**: When an approver commits an allocation, the backend executes an atomic PostgreSQL transaction utilizing `SELECT ... FOR UPDATE` row locks on the vehicle.
2. **Mathematical Range Collision Guard**: Overlapping date reservations are blocked at the database engine level via a GiST index on `tstzrange(allocated_from, allocated_to)` using the `EXCLUDE` constraint. Any overlapping transaction fails instantly with HTTP 409 (`Conflict`).
3. **Custody Handover Lifecycle**: Assets transition through strict operational phases: `RESERVED` $\rightarrow$ `AWAITING_HANDOVER` $\rightarrow$ `ACTIVE` (odometer/fuel logged) $\rightarrow$ `RETURNED_PENDING_INSPECTION` $\rightarrow$ `COMPLETED`. An asset cannot become active without physical handover confirmation.

### C. Autonomous Operational Synchronization & Idle Asset Reclamation (`SyncJobs`)
A background orchestration job executes periodic state scans:

1. **Idle Asset Scanner**: Computes utilization variance over rolling 7-day, 14-day, and 30-day windows. Assets idle for $\ge 14\text{ days}$ generate automated inter-departmental transfer recommendations; assets idle $\ge 30\text{ days}$ are classified as condemned/surplus and auto-prepared for GeM auction disposition.
2. **Vision Document Extraction Pipeline**: Uploaded vehicle documents are pre-processed and sent through OCR vision models. The model extracts registration numbers, chassis numbers, seating capacity, and expiration dates, automatically pre-filling registration fields while requiring human verification before database commit.
3. **AI Triaging & Operations Pulse**: Summarizes fleet anomalies (unreturned allocations, expiring fitness certificates, active SOS incidents) into prioritized managerial actions.

### D. Verifiable Cryptographic Audit Ledger
Every state mutation (approvals, handovers, compliance updates, telemetry anomalies) writes to an immutable `AuditLog` table. Each entry computes:

$$\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} \parallel \text{Timestamp} \parallel \text{ActorID} \parallel \text{Action} \parallel \text{EntityID} \parallel \text{Payload})$$

The `/audit` dashboard provides one-click cryptographic chain verification, guaranteeing non-repudiation and transparency for public administrative oversight.

