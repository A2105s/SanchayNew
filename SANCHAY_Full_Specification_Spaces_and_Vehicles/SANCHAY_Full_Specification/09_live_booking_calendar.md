# 09 — Open Space Live Booking Calendar

## Evidence limitation
The earlier batch named an “Open Space Live Booking Calendar”; detailed controls and displayed records are not visible in the current set. This document defines the behaviour to validate.

## Purpose
Show availability over time and prevent double bookings while allowing users to select a valid slot.

## Required behaviour
- Use one authoritative timezone per space and display it where ambiguity is possible.
- Show operating hours, blocked periods, existing confirmed bookings and maintenance closures.
- Distinguish available, pending approval, booked, blocked and maintenance states using both text/pattern and colour.
- Make the minimum/maximum booking duration and booking window clear before submission.
- Revalidate availability on the server immediately before creating a booking.
- Handle simultaneous booking attempts transactionally so only one conflicting booking succeeds.
- Provide day/week/month views only if each is responsive and usable; default to the view best suited to slot selection.
- Include accessible list/agenda view for users who cannot use the visual grid.

## Risks to verify
- Calendar may display stale availability after another user books a slot.
- Local browser timezone may differ from the space's timezone.
- Pending requests may look confirmed.
- Maintenance windows may not block bookings consistently.
- Past slots or slots outside operating hours may remain selectable.

## Acceptance criteria
- Overlapping confirmed bookings cannot be created for the same space.
- Availability refreshes after create/cancel/approve/reject events.
- Booking duration and operating-hours constraints are enforced on the backend.
- Calendar works with keyboard navigation and a list-based alternative.
