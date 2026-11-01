# Identified Technical Gaps & Current Hurdles — Sanchay Platform

## 1. IoT Telemetry, Power Management & Hardware Disparity

### A. Parasitic Battery Drain in Long-Idle and Yard-Seized Assets
* **The Hurdle**: Standard AIS-140 telematics units draw active parasitic current (45–120 mA) from vehicle 12V/24V lead-acid batteries. In municipal yards and police station holding grounds, seized or surplus vehicles sit idle for 14 to 90+ days without engine ignition to recharge the accumulator. This leads to deep-discharge battery degradation within 10–14 days, cutting off telemetry transmission entirely.
* **Technical Solution Underway**: Developing firmware-level deep sleep states (< 2 mA) with accelerometer-driven **wake-on-motion interrupts**, paired with secondary solar-trickle photovoltaic toppers or modular LiFePO4 auxiliary battery packs for long-custody yard monitoring.

### B. Urban Multi-Path Reflection & Dead-Reckoning Drift in Dense Topography
* **The Hurdle**: Operating across historical municipal sectors (e.g., Gwalior's Maharaj Bada, Morar, and Kampoo) introduces severe GPS multi-path signal reflections off dense masonry, high stone facades, and narrow alleys. This produces dilution of precision (DOP > 5.0) and "jitter" where stationary vehicles falsely appear to be moving or jumping across adjacent city blocks.
* **Technical Solution Underway**: Implementing Extended Kalman Filtering (EKF) combined with road-network map-matching algorithms at the ingest layer to snap noisy latitude/longitude streams to the nearest drivable OpenStreetMap corridor.

### C. Heterogeneous Sensor Fusion Across Tracking Tiers
* **The Hurdle**: The platform must ingest telemetry from three disparate hardware tiers:
  1. *Tier 1*: Hardwired AIS-140 GPS tracking units (continuous 1–5s stream with ignition and CAN-bus metrics).
  2. *Tier 2*: Basic battery-backed OBD-II/cellular plug-ins (30–60s intermittent sampling).
  3. *Tier 3*: Driver smartphone PWA GPS check-ins (event-based polling).
  Normalizing these varying data rates, timestamps, and packet reliabilities without triggering false-positive "Stale Telemetry" warnings requires adaptive freshness heuristics.

---

## 2. External G2G Enterprise Integrations & Asynchronous Webhooks

### A. Direct National VAHAN / SARATHI API Integration
* **The Hurdle**: Sanchay currently uses a server-side Vision OCR pipeline (Mistral/NVIDIA models) to extract registration, fitness, and PUC data from uploaded physical certificates. While highly accurate (~94%), this is fundamentally an offline emulation.
* **Remaining Challenge**: Direct, real-time programmatic integration with the Ministry of Road Transport and Highways (MoRTH) National VAHAN/SARATHI database is gated by national G2G security clearance protocols and lack of outbound push Webhook support for real-time compliance cancellations or impoundment updates.

### B. eCourts Judicial Status Synchronization Latency
* **The Hurdle**: Legal custody tracking is linked via eCourts CNR (Case Natural Number). However, district court dockets lack standardized real-time Webhook infrastructure to broadcast case disposals, vehicle release orders (Superdari), or interim stay attachments.
* **Remaining Challenge**: Sanchay currently relies on scheduled pull-polling rather than instantaneous event-driven release triggers, introducing a latency window between court dismissal and platform asset release.

### C. Programmatic End-to-End GeM (Government e-Marketplace) Dispatch
* **The Hurdle**: Long-idle and condemned vehicles (30+ days idle) are currently compiled into formula-injection-safe, RFC-4180 CSV auction manifests for manual upload into the GeM disposal portal.
* **Remaining Challenge**: Transitioning from export manifests to bidirectional, automated GeM API dispatch requires escrow settlement hooks and institutional API access under the Government e-Marketplace procurement protocol.

---

## 3. Edge Resiliency & Network Disruption Handling

### A. Burst Replay Reconciliation in Cellular Dead Zones
* **The Hurdle**: Municipal waste trucks and patrolling police vehicles regularly operate in peripheral rural zones and basement depots with prolonged cellular blackout.
* **Remaining Challenge**: When an offline unit reconnects and dumps hundreds of back-buffered telemetry frames in a single burst, the ingestion gateway (`POST /api/iot/ingest`) must process `recordedAt` vs `receivedAt` timestamps out-of-order without triggering historical geofence breaches or skewing speed-anomaly calculation algorithms.

### B. Degraded Document OCR on Weathered Physical Certificates
* **The Hurdle**: Indian transport documents (handwritten fitness inspection slips, weathered PUC receipts exposed to rain and engine heat, faded laminated smartcards) present severe OCR noise: glare, crease artifacts, faded dot-matrix print, and low contrast.
* **Remaining Challenge**: Achieving 99.9% deterministic extraction without human supervisor fallback requires fine-tuning lightweight, edge-quantized vision models specifically on Indic transport documentation layouts.

---

## 4. Civic Spaces Hardware Infrastructure (Phase 2 Scaling)

* **The Hurdle**: Scaling the asset intelligence paradigm to **Civic Spaces** (conference halls, municipal auditoriums, department training centers) requires physical presence detection.
* **Remaining Challenge**: Deploying, calibrating, and networking non-intrusive PIR (passive infrared) motion sensors or smart sub-metering IoT devices across legacy government buildings with thick stone walls and limited Wi-Fi coverage, requiring mesh networking (LoRaWAN) validation.

