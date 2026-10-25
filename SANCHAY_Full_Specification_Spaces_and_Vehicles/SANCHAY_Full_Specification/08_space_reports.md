# 08 — Space Reports

## Evidence limitation
The previous batch was described as containing a Space Reports screen. Its exact charts, filters and figures are not available in the current screenshot context, so validate the following against the implementation.

## Purpose
Give administrators reliable operational insight into space utilisation, bookings, cancellations, maintenance, approvals and demand.

## Reporting requirements
- Define each metric, numerator/denominator, date range, timezone and data source.
- Distinguish booking requests from confirmed bookings and completed usage.
- Report utilisation as occupied/available time, not simply total bookings.
- Separate cancellations by citizen, administrator and system where the data supports it.
- Include approval turnaround, rejection reasons, no-shows, maintenance downtime and recurring faults.
- Filter by district, department, category, space and date range.
- Show the last refresh time and whether data is complete.
- Provide accessible tables alongside charts and a CSV export if permitted.
- Apply row-level permissions and avoid exposing personal information in exports.

## Risks to verify
- Totals may not reconcile with My Bookings or booking history.
- Reports may include pending/cancelled requests in confirmed-booking totals.
- Missing values may be shown as zero, making absent data look like a real result.
- Charts may lack units, time zones, legends or empty states.

## Acceptance criteria
- Report definitions are documented and calculations are test-covered.
- Totals reconcile with source records for a known test dataset.
- Filters and exports use the same query semantics.
- Empty, partial, delayed and failed data states are distinguishable.
