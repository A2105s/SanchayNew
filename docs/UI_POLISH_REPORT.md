# Sanchay vs EasyLife — UI Polish Audit

**Date:** 2026-10-25
**Reference app:** `C:\Users\Parikshit\Desktop\Professional Apps\EasyLife`
**Target app:** `C:\Users\Parikshit\Desktop\Hackathons\SanchayNew`
**Audit type:** Read-only source, CSS, component, and runtime inspection. No files were modified during the audit.
**Method:** Five parallel agents audited the two codebases independently, then findings were cross-checked against the live repo and the running dev server.

---

## 1. Verdict in one paragraph

Sanchay does **not** look worse because the template is bad. The four foundation stylesheets (`globals.css`, `theme.css`, `controls.css`, `cloud-status.css`) are **byte-identical** to EasyLife. The problem is everything built on top of that foundation: EasyLife has ~4,950 lines of page-level polish CSS plus a complete analytics/dashboard kit that it actually uses; Sanchay has a thinner page layer, and the polish kit it inherited (`analytics.css` + `AnalyticsKit.tsx`) is **copied but never used by any page**. On top of that, the app currently has **46 TypeScript errors**, the dashboard references data that no longer exists, several navigation targets are dead, and the local database has no schema, so the first screen a tester sees is a large blank error state. The app is not "less designed" so much as **unfinished and visually unmanaged** — the base is premium, the pages are prototype-grade.

**Overall polish score: 3.5 / 10** (base design system alone would score ~8/10).

---

## 2. Scorecard

| Dimension | EasyLife | Sanchay | Gap |
|---|---|---|---|
| Base design tokens | 8 | 8 | None (shared) |
| Information architecture | 8 | 4 | Flat 18-item nav, dead routes |
| Dashboard hierarchy | 9 | 3 | No sectioning, no deltas, broken data |
| Data visualization | 9 | 3 | Full chart kit exists but unused |
| Typography discipline | 7 | 4 | Uppercase override, 15/16/17/18px icon drift |
| Spacing & density consistency | 8 | 5 | Page-by-page padding/eyebrow drift |
| Motion & feedback | 8 | 5 | Toasts pop out, invisible keyboard selection |
| Loading / empty / error states | 8 | 2 | Giant blank error page, skeleton-forever bug |
| First-run experience | 8 | 1 | Empty DB renders "Cloud data is not available" |
| Runtime/build health | 9 | 2 | 46 TS errors, dashboard crashes on load |
| **Perceived polish** | **8.5** | **3.5** | **~5 points** |

---

## 3. The foundation is not the problem

All four shared stylesheets hash-match exactly:

| File | EasyLife | Sanchay | SHA-256 |
|---|---|---|---|
| `app/globals.css` | 188,119 B | 188,119 B | identical |
| `app/theme.css` | 13,740 B | 13,740 B | identical |
| `app/controls.css` | 6,938 B | 6,938 B | identical |
| `app/cloud-status.css` | 3,616 B | 3,616 B | identical |

Both apps therefore share the same:

- Brand teal `#0a7f8c`, dark-mode teal `#1596a6`
- 14px root type scale, Inter + JetBrains Mono
- 4/6/8/999px radii and 4–32px spacing scale
- Panel shadow `0 12px 28px rgba(29,69,77,0.08)`
- 264px dark sidebar, 60px glass top bar
- Button hover lift, skeleton shimmer, page-enter animation
- Global reduced-motion kill switch
- Modal focus trap, toast entry animation, table hover rail

**Implication:** every visible difference below comes from the app-specific layer, not from a broken theme. Rebuilding the theme is not required; finishing the page layer is.

---

## 4. Root cause #1 — the polish layer was inherited but not wired up

Sanchay imports `analytics.css` in `app/layout.tsx` and contains a byte-identical copy of EasyLife's `components/analytics/AnalyticsKit.tsx`.

Verification:

- `app/analytics.css` SHA-256 matches EasyLife exactly.
- `components/analytics/AnalyticsKit.tsx` SHA-256 matches EasyLife exactly.
- No Sanchay page imports `AnalyticsKit`. The only references to `KpiCard`, `ChartCard`, `SectionHeading`, `RankedList`, `DeltaChip`, or `buildDelta` are inside `AnalyticsKit.tsx` itself.
- No Sanchay page uses the `an-*` class system outside that dead file.

In other words, Sanchay is shipping the polished dashboard system as dead code while its real dashboard uses simpler primitives.

### What EasyLife's kit provides that Sanchay's dashboard does not

| Capability | EasyLife | Sanchay |
|---|---|---|
| KPI card with previous-period delta | `KpiCard` + `DeltaChip` (`AnalyticsKit.tsx:57-108`) | `MetricTile` — value + detail only (`components/ui/MetricTile.tsx`) |
| Card status chip beside label | `meta` prop | none |
| Section headings between bands | `SectionHeading` | panels stacked flat |
| Chart card with header/footer/tooltip | `ChartCard`, `BarTrend` | `InlineBars` SVG strip (`components/ops/DashParts.tsx:37-57`) |
| Ranked list with measured gradient bars | `RankedList` (solid fill, 500ms width animation) | `BarList` — 8% tinted background rows (`components/ui/BarList.tsx:12-20`) |
| Donut with legend columns and hover stroke | `DonutChart` | `Donut` — plain segmented ring (`components/ui/Donut.tsx`) |
| Analytics-shaped skeleton | `AnalyticsSkeleton` | generic blocks |
| Sparkline | not needed | 120×32 polyline (`components/ui/Sparkline.tsx`) |

### The dashboard composition problem

`app/dashboard/page.tsx:246-266` renders **six** `MetricTile`s into a grid defined as `repeat(4, minmax(0, 1fr))` (`app/globals.css:821-825`).

Result: a 4 + 2 layout with **two empty cells on the right**, at desktop width. This is the single most visible "unfinished" tell on the main screen. EasyLife groups its KPIs into intentional bands and never leaves grid holes.

Additional dashboard issues:

- No page eyebrow, no section headings, no delta chips, no "last updated" line.
- `href="/bookings"` on the "Pending approvals" tile (`app/dashboard/page.tsx:266`), but `/bookings` no longer exists.
- The same tile reads `snapshot.bookings`, which was removed from `FleetSnapshot` (`types/index.ts:604-621`). This throws at runtime once the snapshot loads.
- `ROLE_FOCUS` omits `ORG_ADMIN` (`app/dashboard/page.tsx:45-51`), so the subtitle becomes `"undefined"` for organization admins.
- `stats.inService` reads `v.lifecycle`, a property that no longer exists on `VehicleView` (`app/dashboard/page.tsx:75`).
- The "Pending approvals" logic uses permissions `booking.review` / `booking.create` that no longer exist (`app/dashboard/page.tsx:128, 368`), so the related action buttons never render.

**Consequence:** even if the data loaded, the hero screen of the product is structurally flat and partially broken.

---

## 5. Root cause #2 — the page layer is ~37% of EasyLife's, and less consistent

App-specific CSS volume:

| App | Stylesheets | Lines | Bytes |
|---|---|---|---|
| EasyLife | analytics, imports, settings, register | 4,952 | ~106.9 KB |
| Sanchay | sanchay-ui, vehicles, ops | 1,845 | ~39.6 KB |

Sanchay's three sheets are not equivalent replacements for EasyLife's four: they style a different domain, and they do it with fewer reusable patterns. The visible result is that Sanchay pages are composed mostly from raw global classes and inline styles, while EasyLife pages use purpose-built presentation systems.

### Inline-style drift

- Sanchay: **285** `style={{...}}` occurrences and **99** inline `fontSize` declarations.
- Most common inline sizes: `0.82rem` ×32, `0.8rem` ×20, `0.85rem` ×13.
- `Donut`, `Sparkline`, `ProgressBar`, `MetricTile`, and `Pagination` all rely on inline dimensions/colors, so CSS cannot theme them consistently.
- `SearchField` re-declares container and clear-button styles inline (`components/ui/SearchField.tsx:62,100`), overriding `controls.css:81-150`. Future fixes in the shared stylesheet will not reach this component.

### Off-scale and literal values

- Radii of 7, 8, 9, 10, and 12px appear across `ops.css` and `vehicles.css` while the base scale is 4/6/8/999.
- `ops.css` hardcodes light-only status colors: `#fef2f2/#dc2626`, `#fffbeb/#d97706`, `#eff6ff/#2563eb`, `#16a34a`, `#fef2f2` (`app/ops.css:55-64, 117-119, 206-211`).
- `.ops-hero` uses a fixed `#eff6ff → #f0f9ff` gradient (`app/ops.css:336-343`); `.ops-teaser` uses `#eff6ff → #fff` (`:381-390`). Neither has a dark-mode override, so those surfaces stay pale blue in dark theme.
- `sanchay-ui.css:44-53` hardcodes the "Soon" nav badge to light-on-dark colors.

---

## 6. Root cause #3 — navigation and information architecture

### 6.1 Flat, oversized sidebar

`components/layout/Sidebar.tsx:43-64` defines **18** flat items:

Dashboard, Fleet, Discover, Live map, Requests, Allocations, Operations, Stations, Transfers, Compliance, Maintenance, Idle & reuse, Incidents, IoT hub, Reports, Audit, Settings, Spaces.

EasyLife has **8** items. Sanchay's nav is more than twice as long with **no group headings**, so it reads as a list of features rather than a product structure.

To fit 18 rows, `sanchay-ui.css:719-722` overrides the shared sidebar rhythm:

- sidebar gap 12px
- nav gap 2px
- row min-height 38px (down from 42px)
- `overflow-y: auto`

Consequence: denser, scrollable navigation that no longer matches the calm rhythm of the rest of the template.

### 6.2 Dead and duplicate destinations

| Link | Location | Status |
|---|---|---|
| `/operations` | `Sidebar.tsx:58`, `CommandPalette.tsx:22` | No page exists |
| `/notifications` | `NotificationBell.tsx:207` | No page exists |
| `/bookings` | `app/dashboard/page.tsx:266, 368` | Removed; `/requests` replaced it |
| Discover vs Live map | `Sidebar.tsx` | Near-duplicate icons/mental model |
| Requests vs Allocations | `Sidebar.tsx` | Two items for one workflow |

A polished app never exposes a nav item that 404s. This alone makes the product feel like a hackathon build.

### 6.3 Icon repetition and motion

- Three pairs of nav items share near-identical icons: Dashboard/Operations (activity), Discover/Live map (map/search), Requests/Allocations (clipboard/key).
- Active items pass `isHovered={hoveredHref === item.href || active}` (`Sidebar.tsx:155`). Because `AnimatedRadio` repeats infinitely (`components/ui/AnimatedIcons.tsx:200-205`), the IoT icon pulses **permanently** while that route is active. Hover animation becomes ambient noise.
- Collapsed mode hides all link `span`s (`globals.css:3872-3874`), which also hides the "Soon" badge, and hides the footer entirely (`:3876-3878`), so the user identity/role disappears.

### 6.4 Top bar crowding

EasyLife top bar: 2 controls (theme, cloud status).
Sanchay top bar: 4 controls (command palette, notifications, theme, cloud status) — `AppShell.tsx:268-288`.

The shared mobile rule `.top-nav__action { display: none; }` (`globals.css:3401-3403`) targets a class **no component uses**; the real class is `.top-nav__actions`. Consequence: Sanchay keeps all four controls on phones while the title is absolutely centered, producing a crowded, collision-prone header at ≤820px.

### 6.5 Command palette

- Keyboard selection sets `is-active` (`CommandPalette.tsx:162,181`), but there is **no `.cmdk__item.is-active` rule**; only `:hover` is styled (`sanchay-ui.css:514`).
- Consequence: arrow keys move the item that Enter will open, but the user sees no highlight. This feels broken even though it works.
- No Tab focus trap and no listbox/`aria-selected` semantics.

---

## 7. Root cause #4 — typography and control inconsistency

### 7.1 The uppercase button override

`globals.css:5624-5636` redefines `.button` **after** the variant blocks:

```css
.button {
  ...
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.8rem;
}
```

Every button in the app is therefore uppercase and smaller than the base design intends. EasyLife has the same inherited block, but its pages are visually tuned around it. Sanchay combines it with 15/16/17/18px icons and 0.7–0.76rem meta text, so the interface reads as "small caps everywhere" rather than a clear type hierarchy.

### 7.2 Icon size drift

Static `size={N}` counts:

| Size | EasyLife | Sanchay |
|---|---|---|
| 15px | 42 | 52 |
| 16px | 113 | 50 |
| 17px | 2 | 18 |
| 18px | 62 | 29 |

EasyLife standardizes on 16px for controls and 18px for navigation. Sanchay splits almost evenly between 15/16/17/18, so visually identical controls differ by a pixel or two across pages. That is the kind of detail users cannot name but can feel.

### 7.3 Missing base input style

There is **no `.input` base rule** in `globals.css`, `sanchay-ui.css`, or `controls.css`. Inputs are styled only inside `.field` (`globals.css:2460-2480`).

Consequence:

- `app/reports/page.tsx:166,170` uses bare `<input className="input" type="date">` outside `.field`, so the date controls fall back to browser defaults, ignore the dark theme, and do not match the rest of the form language.
- Vehicle detail and registration use several bare `className="input"` instances and mix native `<select>` with the custom `Select` component.

### 7.4 Stale settings field

`app/settings/page.tsx:172-177` still binds `telemetryStaleMinutes`, but `FleetSettings` now has `telemetryFreshMinutes` (`types/index.ts:595`). The field renders blank and saving can strip or reject the value. This is both a visual bug (empty input) and a functional one.

---

## 8. Root cause #5 — motion and feedback

| Interaction | EasyLife | Sanchay | Visible consequence |
|---|---|---|---|
| Toast exit | 220ms fade via `toast-inline--leaving` | removed immediately (`components/ui/Toast.tsx:46-69`) | Toasts pop out; feels abrupt |
| Toast placement | in page flow | fixed bottom-right stack | Less contextual, can cover content |
| Command palette selection | n/a | `is-active` has no CSS | Invisible keyboard cursor |
| Status dot | subtle | `status-pulse 1.5s infinite` (`sanchay-ui.css:179-181`) | Multiple pulsing dots create visual noise |
| Nav icon | hover only | active item animates forever | Ambient distraction |
| Page enter | 300ms `applePageEnter` | same (shared) | Parity |
| Skeleton | content-shaped analytics skeleton | generic rectangles | Layout jumps when real content arrives |
| Chart bars | 500ms width growth | static tinted rows | Dashboard feels inert |

Dead animation code also exists in Sanchay:

- `@keyframes toast-in` (`sanchay-ui.css:353-362`) — never referenced.
- `@keyframes status-pulse-dot` (`sanchay-ui.css:708-716`) — never referenced.
- `@keyframes apple-page-enter` (`sanchay-ui.css:680-689`) — duplicates the real `applePageEnter` and is never referenced.

---

## 9. Root cause #6 — loading, empty, and error states are the weakest area

This is the category where Sanchay looks most unfinished, and it is exactly what the current screenshot shows.

### 9.1 The first-run screen is a blank error page

The running app at `localhost:3000/settings` shows:

- Page title area replaced by a small centered "Could not load settings"
- Subtitle "Cloud data is not available."
- A Retry button
- Top-right "Cloud offline" pill
- Everything else blank

Cause: the local Postgres instance is running, but the schema has not been pushed. Prisma reports:

```
The table `public.Operator` does not exist in the current database.
```

API verification while logged in:

```
/api/cloud/health   -> 503
/api/cloud/settings -> 500
/api/cloud/snapshot -> 503
```

Fix (not a design change):

```powershell
npx prisma db push
npm run db:seed
```

But the design lesson is separate: **an empty database should not produce a dead-end error page.** A polished app would show a first-run/setup state with context ("No fleet data yet — load demo data"), the exact command or a button, and a link to Settings → Data. Sanchay shows a generic error with no explanation, so every new tester's first impression is "the app is broken."

### 9.2 Error and empty states are inconsistent

- Some pages use `EmptyState` with icon/title/description/action; others use raw muted text (vehicle detail tabs).
- `DataCloudPanel` sets its summary to `null` on API failure (`components/ops/SettingsParts.tsx:316-325`), and `null` is also the loading sentinel, so a failed request leaves a **permanent skeleton** with no error message.
- Notification empty state uses `.empty-state { min-height: 420px }` inside a panel capped at 460px including header/footer (`NotificationBell.tsx:152,162`), so the empty state overflows its own container.
- Login demo list shows usernames but no password or usable guidance, and several usernames are wrong (see §10).

### 9.3 Loading states do not match content

Dashboard loading renders six generic 92px skeletons (`app/dashboard/page.tsx:214-218`) but the real grid contains 116px tiles with rails, icons, labels, and details. The swap is visibly jumpy. EasyLife's `AnalyticsSkeleton` mirrors its KPI/chart layout.

---

## 10. Root cause #7 — content trust signals

Small copy details make the product feel like an internal prototype rather than a finished system:

| Issue | Location |
|---|---|
| "Simulated placeholder" badge in the IoT hero | `app/iot/page.tsx:155` |
| Every gateway card labeled "Simulated", even real devices | `app/iot/page.tsx:175` |
| "Simulated / placeholder devices" metric | `app/iot/page.tsx:185` |
| "Sim" chip on device rows | `app/iot/page.tsx:229` |
| "Soon" badge in primary navigation | `Sidebar.tsx:63` |
| Literal `{serverJobs.failed}` in sync banner | `components/layout/AppShell.tsx:211` |
| Literal `{waiting}` in sync banner | `components/layout/AppShell.tsx:218` |
| Login lists `station.officer`, `field.staff`, `auditor` | `app/login/page.tsx:15` |
| Seed actually creates `org.police`, `org.health`, `station.kotwali`, `driver.demo`, `auditor.demo` | `lib/seed/gwalior.ts:14-21` |
| Login password is not shown anywhere on screen | `app/login/page.tsx:150-159` |

The literal template strings are especially damaging: they appear only during sync failures, but when they do, the app shows raw JavaScript instead of a number. That is the definition of "unpolished."

---

## 11. Root cause #8 — the build and runtime are currently red

This is the biggest reason the app "looks shit" in practice: several screens cannot render correctly at all.

`npx tsc --noEmit --incremental false` currently reports **46 errors**. The highest-impact ones:

| Error | File | Effect |
|---|---|---|
| `Property 'bookings' does not exist on type 'FleetSnapshot'` | `app/dashboard/page.tsx:129,266` | Dashboard throws once snapshot loads |
| `href="/bookings"` | `app/dashboard/page.tsx:266,368` | Dead navigation |
| Missing exports `utilizationPct`, `complianceHealthPct`, `canReviewTransfer`, `InlineBars` | `app/dashboard/page.tsx:27-32` | Dashboard cannot compile |
| `Property 'lifecycle' does not exist on VehicleView` | dashboard, idle, maintenance | Vehicle-derived stats and filters break |
| Stale permissions `fleet.write`, `booking.create`, `booking.review` | dashboard, settings, compliance, idle | Buttons and tabs silently disappear |
| `ROLE_LABEL` missing `ORG_ADMIN` | dashboard, settings | Role badge renders `undefined` |
| `telemetryStaleMinutes` does not exist | settings | Policy field blank / save fails |
| Missing `transferStatusTone`, `canReviewTransfer` | transfers page and parts | Transfers UI cannot compile |

Consequences visible to a tester:

- The dashboard is the first page after login, and it is the most broken page.
- Settings shows an error page because the database is empty; even with data, parts of it reference removed types.
- The sidebar advertises three destinations that 404.
- `/bookings` redirects to `/requests`, but the dashboard still links to the old path.

**No amount of CSS polish fixes a page that throws.** Build health is therefore the first item in the remediation plan, not a footnote.

---

## 12. Page-by-page consistency matrix

| Page | Eyebrow | Description | Panel framing | Empty/error state | Notable issue |
|---|---|---|---|---|---|
| Dashboard | No | Yes | Yes | Yes | 6 tiles in 4-col grid, broken `bookings` data |
| Fleet registry | No | No | Table lacks panel frame | Partial | Filters refetch without debounce; no loading overlay |
| Vehicle detail | No | No | Mixed | Raw text in tabs | 9 tabs overflow; duplicate "Re-evaluate" |
| Live map | No | No | Full-bleed | No | Filters do not filter map data |
| Settings | No | No | Yes | Error page | Stale permission list, blank telemetry field |
| Reports | No | No | Yes | Partial | Bare date inputs; export ignores filters |
| IoT | No | No | Yes | Partial | "Simulated placeholder" copy everywhere |
| Login | n/a | n/a | Card | n/a | Wrong demo usernames, no password hint |
| Requests / Allocations | Yes (newer pages) | Yes | Yes | Yes | More polished than the older pages |

The inconsistency itself is a signal: the newest pages were built with the newer `PageTitle`/`Panel`/`EmptyState` conventions, while the older flagship pages were not retrofitted. The product looks like several design generations stitched together.

---

## 13. Why EasyLife feels more premium — the short list

1. **It uses its own polish system.** AnalyticsKit + analytics.css are wired into the dashboard and used consistently.
2. **Every page is composed, not assembled.** Section headings, chart cards, KPI bands, and ranked lists create hierarchy.
3. **Its information architecture fits its nav.** 8 items, no scrolling, no dead links, no "Soon."
4. **Its data has movement.** Deltas, animated bars, hoverable donuts, and chart tooltips make the UI feel alive.
5. **Its states are designed.** Analytics skeletons mirror content; empty states have icons and actions; toasts fade out.
6. **It is not currently broken.** No visible type errors, no removed-data references, no literal template strings.
7. **Its type and icon scales are disciplined.** 16px controls, 18px nav, one button height.
8. **Its page styles use tokens.** Dark mode stays coherent because status surfaces are not hardcoded.

Sanchay has the same foundation but violates 1–8 almost everywhere.

---

## 14. Prioritized remediation plan

### P0 — Make the app render before touching aesthetics (1–2 days)

1. Fix all 46 TypeScript errors. Start with `app/dashboard/page.tsx` because it is the post-login landing page.
2. Replace `snapshot.bookings` with `snapshot.requests` / `snapshot.allocations` and point "Pending approvals" at `/requests`.
3. Restore or remove `/bookings` links; implement or remove `/operations` and `/notifications`.
4. Update `ROLE_LABEL` and `ALL_PERMISSIONS` everywhere to the current role/permission model.
5. Fix `telemetryStaleMinutes` → `telemetryFreshMinutes`.
6. Fix the literal `{serverJobs.failed}` / `{waiting}` strings in `AppShell.tsx:211,218`.

### P1 — Fix the first-run experience (half day)

1. Make `prisma db push` + `db:seed` part of local setup documentation and onboarding.
2. Replace the dead-end error state with a setup-aware empty state:
   - Detect "schema missing" vs "no data" vs "network offline."
   - Show the exact recovery action (button or command).
   - Keep the shell and page title visible so it does not look like a crash.
3. Fix `DataCloudPanel` so an API error shows an error, not a permanent skeleton.
4. Add a "Load demo data" action to the empty state.

### P2 — Adopt the polish kit you already have (2–3 days)

1. Use `AnalyticsKit` on the dashboard: `KpiCard` with deltas, `ChartCard`, `SectionHeading`, `RankedList`, `DonutChart`, `AnalyticsSkeleton`.
2. Replace the six-tile 4-column grid with intentional bands (e.g., 4 primary KPIs, then 3 operational KPIs) so there are no empty cells.
3. Give the dashboard a clear hierarchy: page title → KPI band → attention/alerts → trends → activity.
4. Add previous-period deltas and "last updated" metadata to KPIs.
5. Replace generic skeletons with content-shaped ones.

### P3 — Rebuild the information architecture (2 days)

1. Group the 18 nav items into sections: **Overview** (Dashboard), **Fleet** (Fleet, Discover, Live map), **Operations** (Requests, Allocations, Stations, Transfers), **Governance** (Compliance, Maintenance, Idle, Incidents, IoT), **Insights** (Reports, Audit), **Admin** (Settings).
2. Remove or clearly mark unfinished destinations. No nav item should 404.
3. Merge near-duplicates: Discover/Live map, Requests/Allocations.
4. Move "Spaces" out of the primary nav until it ships.
5. Fix the command palette active state and add focus trap/ARIA listbox semantics.
6. Fix the mobile top bar: hide low-priority controls behind an overflow menu.

### P4 — Design-system cleanup (2–3 days)

1. Add a real `.input` base rule and remove bare `className="input"` usage.
2. Remove the uppercase `.button` override or scope it to a deliberate variant.
3. Normalize icon sizes to 16px (controls) and 18px (navigation).
4. Replace hardcoded ops colors with semantic tokens; add dark-mode overrides for `ops-*` surfaces.
5. Normalize radii to the 4/6/8/999 scale.
6. Define or remove the missing custom properties (`--color-accent`, `--color-border-hover`, `--color-border-light`, `--color-border-strong`, `--color-surface-raised`, `--color-text`, `--height-input`).
7. Fix contrast: muted text on primary is ~3.66:1; white on brand is ~3.53:1.
8. Restore pinch zoom (`userScalable: false` violates WCAG 1.4.4).

### P5 — Motion and feedback polish (1–2 days)

1. Add a toast exit animation (fade/slide 180–220ms) instead of instant removal.
2. Animate chart bars and donut strokes on mount.
3. Stop infinite pulsing on active nav icons; reserve pulse for live status only.
4. Add hover/active states to command palette rows.
5. Make table row loading visible (overlay or skeleton rows), not just `aria-busy`.
6. Replace "Simulated placeholder" copy with a single, well-designed simulation banner.

### P6 — Visual QA gate (ongoing)

1. Add `npm run typecheck` + `npm run lint` + `npm run build` to CI and block merges.
2. Add a screenshot regression check for the 6 core screens (dashboard, fleet, detail, map, settings, login).
3. Do one pass per page against a checklist: eyebrow, title, description, actions, panel framing, empty state, loading state, error state, dark mode, mobile.

---

## 15. Appendix A — Key evidence index

| Claim | Evidence |
|---|---|
| Base CSS identical | SHA-256 match for `globals.css`, `theme.css`, `controls.css`, `cloud-status.css` |
| Analytics kit unused | `components/analytics/AnalyticsKit.tsx` exists; no page imports it |
| Analytics CSS unused | `app/analytics.css` imported in `app/layout.tsx`; no `an-*` classes used outside the dead kit |
| 6 tiles in 4-col grid | `app/dashboard/page.tsx:246-266`; `app/globals.css:821-825` |
| Dashboard reads removed data | `app/dashboard/page.tsx:129,266`; `types/index.ts:604-621` |
| Dashboard links to removed page | `app/dashboard/page.tsx:266,368` |
| Dead nav routes | `Sidebar.tsx:58`; `CommandPalette.tsx:22`; `NotificationBell.tsx:207` |
| Literal template strings | `AppShell.tsx:211,218` |
| Button uppercase override | `app/globals.css:5624-5636` |
| Undefined accent token | `app/globals.css:339`; no `--color-accent` definition anywhere |
| No `.input` base rule | No `.input` selector in `globals.css`, `sanchay-ui.css`, or `controls.css` |
| Bare date inputs | `app/reports/page.tsx:166,170` |
| Stale settings field | `app/settings/page.tsx:172-177` vs `types/index.ts:595` |
| Toast pops out | `components/ui/Toast.tsx:46-69` |
| Command palette invisible selection | `CommandPalette.tsx:162,181`; no `.cmdk__item.is-active` in `sanchay-ui.css` |
| Wrong demo usernames | `app/login/page.tsx:15` vs `lib/seed/gwalior.ts:14-21` |
| IoT placeholder copy | `app/iot/page.tsx:155,175,185,229` |
| Hardcoded light colors | `app/ops.css:55-64,117-119,206-211,336-343,381-390` |
| Off-scale radii | `app/ops.css`, `app/vehicles.css` (7/9/10/12px) |
| 46 TypeScript errors | `npx tsc --noEmit --incremental false` |
| DB schema missing | Prisma: `The table public.Operator does not exist`; API health 503, settings 500, snapshot 503 |
| App-specific CSS ratio | EasyLife ~4,952 lines vs Sanchay ~1,845 lines |

## 16. Appendix B — Local runtime state at audit time

- Dev server: `http://localhost:3000` is up.
- Login: `admin` / `Sanchay@Demo1` (bootstrap admin from `.env.local`; verified `POST /api/auth/login` returns 200).
- Embedded Postgres: running on `127.0.0.1:54329`, database `sanchay`.
- Database schema: **not pushed**. `public.Operator` does not exist.
- Result: snapshot/health/settings APIs fail, so every page that depends on the fleet snapshot shows an error or empty state.

To get a fully populated app locally:

```powershell
npx prisma db push
npm run db:seed
```

Then refresh. The seeded demo accounts are `admin`, `org.police`, `org.health`, `dept.officer`, `dept.health`, `station.kotwali`, `driver.demo`, `auditor.demo`, all with the password printed by the seed CLI (currently `Sanchay@Demo1` in `lib/seed/gwalior.ts:14`).

## 17. Appendix C — Audit coverage

**Agents deployed:** 5 parallel read-only audits.

1. EasyLife design system (tokens, typography, color, motion, shell, primitives, charts).
2. Sanchay design system (same dimensions).
3. EasyLife page-level craft (dashboard, lists, details, forms, states, navigation).
4. Sanchay page-level craft (same dimensions, plus reasons the UI feels unpolished).
5. Component-by-component diff (shell, tokens, primitives, icons, CSS architecture, fonts, motion, missing components).

**Files sampled:** `app/layout.tsx`, `app/template.tsx`, `app/globals.css`, `app/theme.css`, `app/controls.css`, `app/cloud-status.css`, `app/analytics.css`, `app/sanchay-ui.css`, `app/vehicles.css`, `app/ops.css`, all `components/ui/*`, `components/layout/*`, `components/analytics/*`, `components/ops/*`, `components/vehicles/*`, dashboard/settings/reports/iot/login pages, `types/index.ts`, `lib/seed/gwalior.ts`, plus EasyLife's `DashboardOverview.tsx`, `AnalyticsKit.tsx`, `AppShell.tsx`, and page stylesheets.

**Limitations:** The repo changed during the audit window (new routes `/requests`, `/allocations`, notification API, `sanchay-ui.css`), so line numbers reflect the latest read. Findings were re-verified against the current tree where possible. No rendered screenshots beyond the user-provided Settings screen were captured. No code was modified.
