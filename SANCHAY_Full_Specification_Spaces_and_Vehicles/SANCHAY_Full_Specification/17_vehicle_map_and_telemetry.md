# Vehicle Map, GPS, IoT Telemetry, and Freshness

## Map behavior
Show only vehicle locations the current user is authorized to see. Apply location precision and visibility rules by role, organization and vehicle sensitivity. Provide a list-based alternative and accessible text for map-only information. Clustering should not obscure status or eligibility semantics.

## Telemetry data contract
Separate the vehicle’s authoritative registry record from device telemetry. Suggested telemetry fields: vehicle/device ID, event type, latitude/longitude if available, device event timestamp, server ingestion timestamp, source/device identity, accuracy where provided, and validation status. Enforce authenticated device ingestion, payload validation, replay protection where feasible and rate limits.

## Freshness
Define freshness thresholds as configuration, not scattered hard-coded constants. Display “last updated” and stale/unknown state when data exceeds the threshold. A missing or stale GPS point does not prove that a vehicle is inactive, unavailable, lost, or located at its last reported position. Do not interpolate or fabricate positions.

## Data trust and security
- Validate coordinate ranges and timestamps; reject malformed events.
- Authenticate device identity and scope each device to allowed assets.
- Keep ingestion credentials server-side; never embed privileged Supabase keys in firmware or browser bundles.
- Prevent one device from writing telemetry for arbitrary vehicle IDs.
- Minimize retention and location precision according to verified policy; location data may be sensitive.
- Do not allow telemetry to set legal eligibility, approve requests, or override the vehicle registry.

## Hackathon/demo mode
If physical IoT hardware is unavailable, label generated data explicitly as simulated/demo telemetry in the UI and test fixtures. Never present simulated GPS as live real-world data. Include a test case where stale telemetry produces a warning and the system does not infer inactivity or availability.

## Acceptance tests
- Fresh valid event updates the displayed last-known position and timestamp.
- Stale event is visibly stale and does not change eligibility.
- Invalid coordinates or unauthorized device writes are rejected.
- Map and API responses respect organization/role permissions.
