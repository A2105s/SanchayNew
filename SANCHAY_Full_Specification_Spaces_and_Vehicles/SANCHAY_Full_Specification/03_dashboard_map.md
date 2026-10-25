# 03 — Dashboard Map View

## Purpose
Provide a geographic overview of registered spaces and help users locate facilities by area, category, and operational state.

## What is visible
- Navigation for Dashboard, Available Spaces, My Bookings, Calendar, Notifications, Reports and Settings.
- Search spaces input over the map.
- Many coloured markers clustered in several groups.
- Dashed geographic boundaries.
- Map attribution referencing Leaflet, OpenStreetMap contributors and CARTO.
- Repeated `API KEY REQUIRED` watermarking across the map tiles, indicating that the configured tile service is not loading as intended.

## Issues and risks
### P0 — Map tile provider configuration
- The repeated API-key watermark makes the map unusable as a polished geographic interface. Verify the selected tile provider, required credentials, allowed domains, billing/plan status and production environment variables.
- Never put a secret provider key in public source code. If the provider requires a browser key, restrict it by domain and permitted APIs; use a server-side proxy only when the provider's terms and architecture require it.

### P1 — Map meaning and interactions
- Marker colours/icons are not self-explanatory. Add a legend for each category/status and ensure colours are not the only distinction.
- Dense clusters overlap, making individual spaces hard to select. Cluster markers at low zoom and expand/spiderfy at higher zoom.
- Search appears separate from map markers; confirm that searching filters the map and that selecting a result pans/zooms to its marker.
- A boundary line without a label or legend can be mistaken for an administrative boundary or an error.

### P2 — Accessibility and fallback
- Map interactions should be keyboard-accessible where feasible, but the map must not be the only way to discover a space.
- Provide an accessible list view and a “Use my location” control only with a clear permission prompt.
- Add a useful fallback if map tiles fail: list spaces with address and district.

## Recommended behaviour
1. Centralise map configuration and validate provider settings during deployment.
2. Show tile loading, provider error and offline states.
3. Use marker clustering and stable marker identity; clicking a marker opens a concise summary and a link to details.
4. Synchronise map bounds, search and filters.
5. Provide list/map toggle and keep the same filters in both modes.

## Acceptance criteria
- No API-key watermark appears in supported production environments.
- Map attribution is visible and complies with the provider's terms.
- Marker clusters remain performant with the full dataset.
- Every mapped item is also accessible through a searchable list.
- Provider failure does not block the core space-discovery workflow.
