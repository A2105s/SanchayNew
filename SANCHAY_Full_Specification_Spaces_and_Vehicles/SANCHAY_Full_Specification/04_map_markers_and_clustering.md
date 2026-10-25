# 04 — Map Markers, Clustering and Geographic Data

## Purpose
Review the second map view specifically for marker clarity, overlap, location accuracy, and behaviour at different zoom levels.

## Visible evidence
- The map contains multiple overlapping groups of markers using several colours and icons.
- Several markers appear close together, including clusters around two central areas.
- The same `API KEY REQUIRED` tile watermark is visible.
- Map controls include locate/target, fullscreen and zoom in/out.

## Risks to verify
- Marker overlap can hide facilities or make it impossible to select the intended item.
- Icon and colour semantics are unclear without a legend.
- A marker may represent a category, status, or both; mixing these meanings can be confusing.
- The tile-provider issue prevents users from interpreting the geographic context.
- The screenshot alone cannot confirm whether coordinates are accurate or whether the markers are mock data; validate against authoritative records.

## Improvements
- Implement clustering with a visible count and predictable expansion on click.
- At high zoom, use spiderfying or a selectable list for co-located markers.
- Define one consistent visual encoding: for example, icon = space category and badge/outline = operational state. Document it in a legend.
- Add marker tooltips/popovers with space name, asset ID, status and a “View details” action.
- Fit bounds to the filtered result set, not the entire database, and avoid repeatedly re-centering the map while the user interacts.
- Add coordinate validation and an administrative correction workflow for misplaced pins.
- Keep location permission optional; do not request it merely to render the map.

## Test cases
- One marker, many markers, overlapping coordinates, zero results, slow network, failed tiles, keyboard navigation, mobile touch, and a filtered result set spanning distant districts.
- Verify that each marker opens the correct space and that the count in a cluster equals the underlying visible records.
