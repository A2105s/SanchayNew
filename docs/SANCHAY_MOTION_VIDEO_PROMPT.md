# Sanchay — Motion Design Explainer: Master Prompt

**Deliverable:** 75-second, 16:9, English-VO product film.
**Production method:** real Sanchay screens + motion graphics. Not a text-to-video render.
**Source of truth:** the running app. If a shot needs a state the app does not have, cut the shot.

> How to use this file: paste the whole thing into the editing agent / motion designer's brief. Sections 1–9 are the instruction. Section 10 is the shoot list. Section 11 is what gets rejected. Section 12 is the QC gate.

---

## 1. Role and mission

You are a senior motion designer and editor who makes product films for government and enterprise software. You have taste: restrained, confident, information-first. You do not decorate. You make a complex back-office product feel like infrastructure that already works.

Your job: cut a 75-second film that makes a district administrator understand, in one watch, **what Sanchay is, how a vehicle request actually travels from ask to keys, and why the live map can be trusted** — using real recordings of the Sanchay interface, composited with typography and motion graphics.

**Audience:** district collectors, department heads, police station officers, and a demo-day judging panel. They are sceptical of dashboards. They have seen fake ones.

**The one sentence the film must land:**
> Idle public assets become productive public resources — and every step is legal, conflict-checked, and auditable.

**Tone:** calm authority. A control room, not a startup launch. No hype words, no exclamation marks, no stock footage of shaking hands.

---

## 2. Hard rules (non-negotiable)

1. **Never invent UI.** Every pixel of interface comes from a real 1920×1080 (or 2560×1440 downscaled) capture of Sanchay. Do not redraw panels, do not retype labels, do not "clean up" a table by removing columns. If the capture shows a scrollbar, keep it.
2. **Do not fabricate features.** This app has no map clustering, no chat, no mobile app screens, no live SMS. Do not animate any of them.
3. **Simulated telemetry must stay labelled.** The map reads `N live · M simulated · T total`. That counter must be legible in at least two frames. This is a credibility asset, not a flaw to hide.
4. **Never animate fake numbers.** Every figure on screen (fleet count, freshness, odometer, request code) must come from the seeded demo data in the capture. You may hold, scale, or mask-reveal a real number. You may not count up to an invented one.
5. **Scrub personal data.** Replace officer names and phone numbers in recordings with demo values (`Officer R. Sharma`, `9XXXXXXXX0`). No real PII in a public video.
6. **Enhance light, never geometry.** You may add glow, vignette, grain, a soft shadow, a moving highlight. You may not bend, stretch, re-time, or re-layout the interface.
7. **One idea per shot.** If a shot needs two captions to explain it, it is two shots.

---

## 3. Format and deliverables

| | |
|---|---|
| Master | 1920×1080, 30 fps, ProRes 422 or DNxHR HQ |
| Delivery | H.264 MP4, 12 Mbps, AAC 320 kbps |
| Captions | Burned-in + separate `.srt`, English |
| Audio | −16 LUFS integrated, −1 dBTP true peak |
| Safe area | 5% title-safe on all sides; captions inside 8% bottom |
| Runtime | 75.0 s ± 1.0 s |

---

## 4. Art direction

**Palette** (sampled from the product's own design tokens — do not invent brand colours):

| Role | Hex | Use |
|---|---|---|
| Ink | `#0C1517` | Video background, negative space |
| Brand teal | `#0A7F8C` | Accents, rules, active states |
| Teal wash | `#DFF4F6` | Low-emphasis fills |
| Success | `#25824F` | Available / active |
| Warning | `#B86413` | Awaiting handover / stale |
| Danger | `#C8433F` | Conflict / rejected |
| Info | `#245CC6` | Submitted / in review |
| Plate green | `#10B981` | Breadcrumb trail |
| Route sky | `#38BDF8` | Planned corridor |
| UI ink | `#17202A` | Type on light |
| Muted | `#7B8794` | Secondary type |

**Treatment:** the light UI is presented as a floating "screen card" (8 px radius, 1 px `#1E2C2F` border, soft 60 px shadow, 2.5% inset from a 4:3-ish frame) against the ink background. The UI stays light-mode. Never invert it to dark; the contrast of light software on dark surround is the whole visual idea.

**Type:** Inter for everything spoken or named; JetBrains Mono for numbers, plates, timestamps, state names. At 1080p: hero 96–120 px / 700 / −2% tracking; section head 56–64 px / 700; body 32–36 px / 500; caption 26–28 px / 500. **Nothing below 24 px.** Tabular numerals everywhere.

**Grade:** cool neutral, slight teal lift in the shadows, 6% vignette, 1.5% fine grain. No orange-and-teal. No lens flares. No 3D camera orbits around flat UI.

**Logo:** the silver Sanchay mark sits at 40 px, bottom-right, 32 px inset, at 60% opacity on every narrative beat. Full lockup only on the open and the end card.

---

## 5. Motion grammar

The app's own motion tokens are the house style. Use them, not your defaults:

- Entrances and scene transitions: `cubic-bezier(0.22, 1, 0.36, 1)` (soft spring-out), 500–800 ms.
- UI reveals (panels, cards, steppers): `cubic-bezier(0.32, 0.72, 0, 1)`, 240 ms.
- Micro (badge pop, tick, hover): 120–160 ms, `cubic-bezier(0.4, 0, 0.2, 1)`.
- Camera moves: 2D translate + scale only. Max scale 1.35×. Max settle 900 ms. Never rotate the UI more than 2°.
- One overshoot, exactly once — the confirmation on request submit.

**Discipline:** per shot, one primary motion and at most two secondary. Everything else is a hold. Cut on motion, not after it. If the viewer can feel the easing, it is too slow.

**Transition vocabulary** (use only these three):
1. **Push-through** — the outgoing screen scales to 1.06 and fades under the incoming caption wipe.
2. **Mask reveal** — a 12 px vertical edge wipes left-to-right, tied to `0.22,1,0.36,1`.
3. **Hard cut on a state change** — the moment a badge flips from `Submitted` to `Approved`, cut, don't dissolve. State changes are the story.

---

## 6. Audio

- **Music:** minimal, mid-tempo, 90–100 BPM, single sustained pad + a soft pulse. Think infrastructure documentary, not trailer. It must duck −12 dB under VO and resolve on the end card.
- **Foley, used sparingly:** a soft UI tick on submit and on each lifecycle step (5 total, not 40); a low sub hit on the conflict beat; a paper-slide for the audit ledger. Nothing else.
- **VO:** male or female, 35–50, measured, low energy, no upward inflection. ~2.6 words/second. Record dry, no reverb.
- **Silence is a tool.** Drop music for 800 ms at 0:00 and again at the conflict beat.

---

## 7. Beat sheet

| # | TC | Dur | Picture | Purpose |
|---|---|---|---|---|
| 01 | 0:00–0:04 | 4 s | Ink. One teal dot pulses. | Cold open |
| 02 | 0:04–0:10 | 6 s | Kinetic type over slow parallax: three cost lines | The problem |
| 03 | 0:10–0:14 | 4 s | Logo reveal + one-line thesis | The turn |
| 04 | 0:14–0:24 | 10 s | **Map, wide** — Gwalior at city scale | Hero: the fleet is visible |
| 05 | 0:24–0:38 | 14 s | **Map, deep** — one vehicle, trail, corridor, freshness | Hero: the map tells the truth |
| 06 | 0:38–0:45 | 7 s | Seized passport → absent from discovery | Eligibility is a gate |
| 07 | 0:45–0:55 | 10 s | Requisition wizard → approval timeline | The ask |
| 08 | 0:55–1:05 | 10 s | Conflict → reservation → handover | The guarantee |
| 09 | 1:05–1:11 | 6 s | Return → inspect → audit ledger | The spine |
| 10 | 1:11–1:15 | 4 s | End card | Close |

### Shot-by-shot

**01 · Cold open (0:00–0:04)**
Ink. A single teal dot at centre pulses twice, then a whisper-thin line extends from it. Music absent.
> VO: "Idle vehicles. Idle rooms. Public money spent twice."

**02 · The cost of idle (0:04–0:10)**
Three lines of kinetic type stack in, one per beat, each pushing the last up 40 px:
`Seized vehicles lose value for years.` → `Empty government rooms stay empty.` → `Another department rents what the state already owns.`
Bottom-right: a small mono counter ticking from `₹0` to `₹ crores` — **only if the app's Idle module surfaces a real figure in the capture. Otherwise delete the counter.**
> VO: "Seized vehicles lose value for years. Empty rooms stay empty. Meanwhile, another department rents what government already owns."

**03 · The turn (0:10–0:14)**
Silver mark scales from 0.92 to 1.0, wordmark masks in. Thesis line beneath, mono, letter-spaced:
`PUBLIC ASSET INTELLIGENCE`
> VO: "Sanchay turns idle public assets into productive public resources."

---

## 8. Chapter A — The map (0:24–0:38). This is the centre of the film.

**What this chapter must prove:** the map is not a decorative GPS widget. It shows only what you are authorised to see, it separates "where it has been" from "where it is going", and when the signal is old it *says so* instead of guessing.

Shoot the interaction live at `/vehicles/map`. Do not build a simulation. Real marker motion, real fly-to.

| Sub-beat | TC | Action on the real screen | Motion treatment | Caption |
|---|---|---|---|---|
| 05a | 24.0–25.5 | Wide shot: Gwalior, stations visible | Slow 1.0 → 1.08 push. Hold. | `Every vehicle you're authorised to see.` |
| 05b | 25.5–27.0 | Click a patrol car in the left `Fleet (N)` panel | Map `flyTo` at native speed. Right detail card slides in 240 ms. | — |
| 05c | 27.0–29.0 | Breadcrumb trail renders behind the marker | **Trace the trail with a light sweep** left-to-right, `#10B981`, 8 px glow, 2 px core. Do not re-draw it faster than it exists. | `Where it has been.` |
| 05d | 29.0–31.0 | Planned corridor renders ahead; route card shows `A → B`, distance, progress bar | Trace in `#38BDF8`. Progress bar fills. | `Where it's going.` |
| 05e | 31.0–33.0 | Detail card: status, operational, eligibility, freshness badge, speed, heading | Punch-in 1.0 → 1.25 on the badge cluster, 600 ms, `0.22,1,0.36,1` | `It never guesses.` |
| 05f | 33.0–35.0 | Click a station shield → side panel: `YOUR ASSIGNED STATION`, CUG contact, `Vehicle Inventory Breakdown` with Available / Maintenance counts | Panel slides 320 px from the right, 240 ms. Numbers stay static; a single 1 px rule wipes beneath the header. | `Stations, not pins.` |
| 05g | 35.0–36.5 | Open Layers popover: `Fleet Overlays` → toggle `Trails & Routes` off, `Stations & Depots` on. Switch to Satellite. | Cut, do not dissolve. Satellite tiles must already be loaded before the cut. | — |
| 05h | 36.5–38.0 | Pull to wide. All trails off. Live counter visible: `N live · M simulated · T total` | 1.25 → 1.0 over 900 ms, then dead hold for 500 ms. | `Simulated is labelled. Always.` |

**Voiceover for the whole chapter (24 s of picture across shots 04–05, 61 words — already timed to fit):**
> "This is the live fleet map for Gwalior. Every vehicle you are authorised to see, in one place, by station. Select one and the map tells the truth. The green line is where it has been. The blue corridor is where it is going. Speed, heading, driver — and freshness. When the signal is old, it says old. Stale never means inactive."

**Map direction to respect:**
- The basemap stays locked. Do not animate tiles floating or the camera orbiting. All life comes from the markers, the two routes, and the incident pulses.
- Station markers are police-shield crests with a vehicle count and a gold star. Treat them as the aggregation layer — **there is no cluster bubble in this product.** Do not invent one.
- Open incidents pulse. Let one pulse once, off-centre, while the camera pulls back. Do not call it out in VO; it is texture.
- The stale-state line `Last position may be stale. This does not mean the vehicle is inactive or unavailable.` — show it verbatim for at least 1.5 s, unmodified. This single line is the most credible moment in the film.

---

## 9. Chapter B — The request (0:38–1:11)

**What this chapter must prove:** a request cannot be double-booked, approved by its own author, or faked optimistically in the browser. Approval is not handover. The audit trail cannot be quietly edited.

| Sub-beat | TC | Action on the real screen | Caption / note |
|---|---|---|---|
| 06a | 38.0–39.5 | `/vehicles/discover` — filter by class + date range, results populate | `Cross-station discovery.` |
| 06b | 39.5–42.5 | **Passport of a seized vehicle**, tab `Eligibility & restrictions`, panel `Eligibility decision`: `INELIGIBLE`, with three blocking reason badges — `SEIZED_CUSTODY` / "Vehicle is seized/impounded and in legal custody; never allocatable.", `ACTIVE_RESTRICTION` / "Active LEGAL_CUSTODY restriction by District Court Gwalior (SEIZED).", `OUT_OF_SERVICE` | `Seized is never bookable.` Hold 2.5 s — let it be read. |
| 06c | 42.5–44.0 | Cut back to discovery, same class, same date window — that vehicle is simply **absent**. Land on the empty space where a row would be. | `It never enters the marketplace.` |
| 06d | 44.0–45.0 | Click `Request` on an eligible row → wizard opens, plate prefilled | — |
| 07a | 45.0–47.5 | Wizard fields fill top-to-bottom: Purpose, Destination, Passengers, Window, Accountable officer + 10-digit phone, Contact | 40 ms stagger per field, type-on at native typing speed. Caption: `Purpose. Window. Accountable officer.` |
| 07b | 47.5–49.0 | Availability badge resolves (advisory only) | `Availability here is advisory. The real check happens at approval.` |
| 07c | 49.0–50.5 | `Submit` → toast: `Request REQ-•••• submitted` | The one permitted overshoot, 1.02 scale. Caption: `Submitted.` |
| 07d | 50.5–52.5 | Request detail — `Approval timeline`, step 1 pending, org name in the step title | `It routes to the right approver, from the org hierarchy.` |
| 07e | 52.5–54.0 | Approver view: `Approve request` modal with optional comment | Note: an approver cannot act on their own request. Hold on the disabled state if the capture shows it. |
| 08a | 54.0–56.0 | **Conflict beat.** Second request for the same window: inline danger, vehicle no longer available, state unchanged | Hard cut. Music out for 800 ms. Sub hit. Caption: `Not "unlikely". Impossible.` |
| 08b | 56.0–57.5 | Successful approval on the free window → `Approved` | Badge flip, no dissolve. Caption: `Approval creates a reservation — not a handover.` |
| 08c | 57.5–59.5 | Allocation stepper: `Reserved` → `Awaiting handover` | Steps light in sequence, 120 ms apart. |
| 08d | 59.5–62.5 | `Record handover` modal: Received by, Condition notes, Odometer (km), Fuel (%), Discrepancies, Checklist ticks, Evidence reference | Camera stays still. Let the checklist tick. Caption: `Handover creates custody.` |
| 08e | 62.5–63.5 | Status flips to `Active` | Cut to Chapter A's plate, now moving on the map — 1 s callback. |
| 09a | 63.5–65.5 | `Record return` → `Returned - pending inspection` | `The vehicle isn't free until it's inspected.` |
| 09b | 65.5–67.5 | `Inspect` → `Completed` | — |
| 09c | 67.5–71.0 | Audit ledger: rows stream in; draw the hash-chain links between entries as thin teal connectors, 60 ms apart | `Every step, hash-chained.` |

**Voiceover, chapter B (33 s of picture across shots 06–09, 67 words — leave the gaps; do not rush it):**
> "Discovery is network-wide. Eligibility is not. An officer raises a requisition — purpose, window, accountable officer. It routes to the right approver, and no one approves their own. Approval does not mean booked: a conflict check runs inside the database, so double-booking is impossible, not unlikely. Approval creates a reservation. Handover creates custody. Return, inspect, close — every step written to an audit trail no one can quietly edit."

---

## 10. Shoot list

Record at 60 fps, 2560×1440, then downscale. Hide browser chrome. Use the seeded Gwalior demo data. Do not touch the DB mid-take.

| # | Route | State to capture | Notes |
|---|---|---|---|
| 1 | `/vehicles/map` | Wide, all overlays on | 20 s static hold + one slow pan |
| 2 | `/vehicles/map` | Select a `POLICE_PATROL` car | Capture the fly-to, card slide, trail draw, corridor draw |
| 3 | `/vehicles/map` | Select a station shield | `YOUR ASSIGNED STATION` chip + inventory breakdown |
| 4 | `/vehicles/map` | A `STALE` or `UNKNOWN` freshness vehicle | The stale warning line must be readable |
| 5 | `/vehicles/map` | Layers popover open; satellite on | Pre-load satellite tiles |
| 6 | `/vehicles/[id]` (a seized one), then `/vehicles/discover` | `Eligibility & restrictions` tab on the seized passport; then discovery filtered to the same class with that vehicle absent | Capture the passport first. Discovery **cannot** show it — `search.ts` filters to `GOVERNMENT_FLEET + ELIGIBLE + ACTIVE` regardless of filters |
| 7 | Request wizard | Empty → filled → submitted | Type slowly enough to be readable at 1× |
| 8 | `/requests/[id]` | `Submitted`, approval timeline visible | |
| 9 | `/requests/[id]` | **409 conflict** inline error | Record this twice; it is the hero moment |
| 10 | `/requests/[id]` | `Approved` | |
| 11 | `/allocations/[id]` | Stepper `Reserved` → `Awaiting handover` | |
| 12 | `/allocations/[id]` | `Record handover` modal, checklist ticking | |
| 13 | `/allocations/[id]` | `Active` | |
| 14 | `/allocations/[id]` | `Record return` → `Inspect` → `Completed` | |
| 15 | `/audit` | Ledger with chain verification | |
| 16 | `/dashboard` | KPIs: Fleet in scope, Available now, Pending decisions, Telemetry freshness | Optional 2 s insert |

---

## 11. Do not

- Do not generate UI with an AI video model. It will hallucinate a plausible-looking fake interface, and a government audience will notice.
- Do not stage a restricted vehicle as a row inside the discovery table. The search API hard-filters to eligible government fleet; showing a seized row there is a lie about the product.
- Do not add map clustering, 3D buildings, animated traffic flows, or "live GPS" imagery that the product does not draw.
- Do not count numbers up to values that are not on screen in the capture.
- Do not use the words *revolutionary*, *seamless*, *game-changing*, *AI-powered* (the AI is a drafting assistant — say so or say nothing).
- Do not show AI approving anything. AI drafts; a human decides. If the AI panel appears at all, it appears for ≤ 2 s and is captioned `Drafts only.`
- Do not put a caption over a table row, button, or badge. Park captions in the ink margin.
- Do not use stock footage, handshakes, drone shots of cities, or a smiling officer at a laptop.
- Do not end on a slow logo fade with music swell. End on the line.

---

## 12. QC gate (block release until all pass)

- [ ] Every UI frame is traceable to a real capture; no redrawn panels, no retyped labels.
- [ ] The seized vehicle is shown **only** on its passport, never staged as a row inside the discovery table. Discovery cannot return it — do not fake that.
- [ ] `N live · M simulated · T total` legible in ≥ 2 frames.
- [ ] Stale-state warning shown verbatim, ≥ 1.5 s, unmodified.
- [ ] No invented numbers anywhere on screen.
- [ ] No PII: names and phone numbers are demo values.
- [ ] All captions ≥ 24 px and readable when the file is watched at 50% size on a phone.
- [ ] Contrast ≥ 4.5:1 for all type over the ink background.
- [ ] VO intelligible with music muted; music −12 dB under VO.
- [ ] Lifecycle states in the film match the product exactly: `Reserved` → `Awaiting handover` → `Active` → `Returned - pending inspection` → `Completed`.
- [ ] Conflict beat lands in under 2 seconds of screen time.
- [ ] Runtime 74–76 s; audio −16 LUFS.
- [ ] End card holds ≥ 2.5 s of silence before the cut to black.

---

## 13. If any abstract b-roll is still wanted

Only for shots 01–03 (no interface on screen). Prompt for a video model:

> Macro abstract: a single point of teal light (`#0A7F8C`) in near-black space `#0C1517`, thin veils of brushed silver drifting slowly like machined metal, shallow depth of field, soft volumetric haze, no text, no logos, no people, no lens flare, no particles spray, camera virtually static with a 1.08× slow push, cinematic, 24 fps, desaturated cool grade, quiet and institutional.

Everything after 0:14 is real software. No exceptions.
