# 02 — All Spaces Listing

## Purpose
Help users discover a suitable public space by searching and filtering a catalogue, comparing availability and capacity, and opening details or starting a booking.

## What is visible
- Search field with prompt to search by space name, address or asset ID.
- Filters for Type, District, and minimum capacity.
- A three-column card grid with space photo/placeholder, asset ID, name, department/location, capacity and area.
- Cards show status badges such as Available, Idle, Booked, Maintenance and Restricted; rating and category labels; some show Featured and Verified Account badges.
- Actions include View Details and Book Now; some booking actions appear disabled or restricted.
- Several cards show `imgbb.com service unavailable`; many others use a generic “NATION TRACK” placeholder image.
- Some ratings appear as `0.0`, while others are non-zero. This should be checked against the details-page discrepancy.

## Issues and risks
### P0 — Broken or placeholder imagery
- Broken third-party image hosting produces large error panels and makes the directory look unfinished.
- Generic placeholders obscure the identity and type of the space. Avoid implying that the placeholder is a real photograph.

### P1 — Search/filter and status semantics
- Filter labels should be consistent with the actual data model. “Min capacity” is a threshold, not an exact capacity.
- Define whether “Idle” means not currently booked, unused for a defined period, or not operational. These are different concepts.
- “Verified Account” appears to describe an account, not necessarily the space or the physical location. Clarify the verified entity.
- Featured and verification badges need tooltips or a concise explanation.
- Booking CTA states need a consistent rule: Available → Book Now; Restricted → explain eligibility; Booked → show next available slot; Maintenance → explain impact.

### P2 — Discoverability and scale
- Add sort controls (nearest, capacity, rating, name, next available) if supported by reliable data.
- Show result count and active-filter chips, with a one-click clear-all action.
- Add pagination or virtualisation for larger catalogues.
- Keep card heights, image aspect ratios, badge placement and CTA alignment consistent.
- Ensure search and filters are usable on mobile and with keyboard/screen readers.

## Recommended behaviour
- Search by normalised name/address/asset ID, with debouncing and a visible clear button.
- Update results and result count when filters change; preserve filters when navigating back from details.
- Use a consistent status enum and a separate operational/maintenance indicator.
- Store image URLs in a controlled asset system; validate URLs and show a local fallback on failure.
- Provide a useful empty state with suggestions to remove filters or try a broader query.

## Acceptance criteria
- No broken third-party image errors are visible in the normal flow.
- Search works for name, address and asset ID; filters can be combined and cleared.
- Every status and badge has a documented meaning.
- Cards expose the same core metadata and booking rules as the detail page.
- Disabled booking actions explain why they are unavailable.
