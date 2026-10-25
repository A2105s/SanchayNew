# Vehicle Inventory, Listing, Search, and Discovery

## Inventory listing
Provide a searchable, paginated inventory of vehicles visible to the current user under server-enforced organization and role permissions. The listing should support useful operational scanning without disclosing restricted fields.

Recommended fields (subject to actual source UI and policy):
- Fleet/asset identifier; registration number only where disclosure is permitted.
- Vehicle type/class, make/model, and a thumbnail or neutral placeholder.
- Owning/controlling organization and permitted location granularity.
- Operational status, eligibility state, and availability summary.
- Next known maintenance/inspection date where appropriate.
- Last record/telemetry update time and data freshness indicator.

## Filters and search
Support exact identifier search plus filters for vehicle class/type, organization (within authorized scope), permitted geographic region, operational state, eligibility, date-range availability, and maintenance/restriction flags. Filters must be validated server-side. Search results must not reveal the existence or sensitive details of records the user is not allowed to discover.

## Result semantics
- Clearly distinguish “eligible and available for requested dates” from “registered but unavailable,” “restricted,” “under verification,” and “telemetry stale.”
- A vehicle can be operational but unavailable due to an allocation; it can be physically present but legally restricted; it can have stale telemetry while its registry status remains known.
- Availability results must include the checked date range and an as-of timestamp where useful.
- Do not claim live GPS position unless a fresh, valid telemetry event supports it.

## Detail entry points
Selecting a vehicle opens a detail view that separates identity/specification, ownership/control, legal eligibility, operations/maintenance, reservations/allocations, telemetry, documents and audit history. Sensitive identifiers/documents must be masked or withheld unless authorized.

## Data quality and validation
- Normalize registration/asset identifiers without destroying the original recorded value.
- Enforce uniqueness at the appropriate organization or jurisdiction scope; confirm applicable rules before choosing global uniqueness.
- Validate dates, odometer readings, capacities and enumerated states using typed schemas on the server.
- Flag duplicate candidates for review; do not silently merge records.
- Never treat demo data, placeholder images, missing GPS or stale records as confirmed real-world facts.

## Reliability
Use server-side pagination and bounded queries. Provide retry behavior only for safe/idempotent operations. Preserve filters across navigation where practical. Empty states should distinguish “no vehicles match these filters” from “no vehicles are accessible” and from an actual data-loading failure.
