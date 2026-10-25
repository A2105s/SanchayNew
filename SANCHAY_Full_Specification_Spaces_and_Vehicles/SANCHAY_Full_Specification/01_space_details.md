# 01 — Space Details Screen

## Purpose
Give citizens and authorised staff a trustworthy, complete view of one public space and let them decide whether to book it, navigate to it, request a correction, or report an operational issue.

## What is visible in the supplied screenshot
- Space: **Conference Room 1 – Civil Hospital**; ID `NT-GWL-SP-0001`.
- Description says the space is in Lashkar and supports hospital operations with managed access and traceable booking.
- Metadata: category Hospital Room; district Lashkar; department Health Department; capacity 30; status Available; area 900 sq ft.
- Actions: **Visit Application**, **Request Update**, **View on Map**.
- Photo of a hospital sign; QR panel appears broken and shows fallback/alt text rather than a rendered QR.
- About section: Civil Hospital Campus, Lashkar, Gwalior; manager Raj Kumar; operating hours 09:00–21:00 on Monday, Tuesday, Wednesday, Thursday and Friday; booking duration 1–8 hours.
- Amenities: Projector, AC, Whiteboard, WiFi. Accessibility: Lift, Wheelchair Ramp.
- Operations snapshot: rating 4.4/5, total bookings 18, maintenance 1 open, contact officer Raj Kumar and phone number.
- Booking history shows one approved booking with a purpose, date/time and no rating.
- Maintenance ticket: intermittent AC cooling, severity Medium, status Open.
- Reviews and Audit section says average rating 0.0/5 (0 reviews), while the snapshot says 4.4/5. A recent `STATUS_CHANGE` audit event is shown.

## Issues and risks
### P0 — Data trust / broken functionality
- **Rating contradiction:** 4.4/5 in Operations Snapshot conflicts with 0.0/5 and zero reviews in Reviews and Audit. Users cannot tell which figure is authoritative.
- **QR code is not rendered:** the panel displays a broken-image/fallback message. This removes the expected door-scanning workflow and makes the space ID harder to verify.
- **Availability may be misleading:** the space is labelled Available while an open AC maintenance ticket exists. Maintenance does not always mean unavailable, but the UI needs an explicit operational impact.
- **Sample-looking record:** booking history contains only one row despite 18 total bookings. It should be clear whether this is a recent item, a paginated history, or incomplete data.

### P1 — Workflow clarity
- “Visit Application” is ambiguous: does it open the booking app, an external system, or an administrative application? Use a precise action label and indicate if a new tab opens.
- “Request Update” needs a clear request form, validation, submitted state, reference number, and status tracking.
- “View on Map” must work even when the map provider is unavailable; provide a textual address and copyable coordinates/address.
- Contact officer details should support the intended action (call/email) while respecting privacy and role permissions.
- Audit information is mixed with public-facing reviews. Consider separating public reviews from restricted administrative audit history.

### P2 — Usability and accessibility
- Improve information hierarchy: status, booking action, hours, capacity, and restrictions should be easy to scan.
- Add clear labels and units to area, capacity, booking duration, and operating hours.
- Ensure status is conveyed by text and not colour alone.
- QR image needs accessible alternative text and a “Download/Print QR” action for authorised staff.
- Check mobile layout, keyboard navigation, visible focus, contrast, and screen-reader labels.

## Recommended behaviour
1. Load space metadata, availability, bookings, maintenance and reviews as separate typed data sources with clear loading/error states.
2. Generate the QR from a stable canonical space URL or signed identifier; do not rely on a static image URL that can expire.
3. Define rating semantics: calculate from published, eligible reviews only. If there are no reviews, show “No reviews yet”, not `0.0/5`.
4. Define a maintenance-to-availability policy. For example, critical maintenance blocks booking; minor issues show a warning and may remain bookable.
5. Make booking history explicitly “Recent bookings” with a “View all” route and pagination.
6. Display last-updated time and the source/owner of operational data where relevant.

## Acceptance criteria
- The QR renders reliably, points to the correct space, and is scannable from a printed or mobile display.
- All rating components use the same backend aggregation and show the same value or an explicit “No reviews” state.
- Availability reflects the configured maintenance policy and any booking conflicts.
- All three main actions have clear labels, accessible focus states, and tested success/error states.
- A user can distinguish public reviews from administrative audit events.
