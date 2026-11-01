# Sanchay IoT - Visual Guide & Hardware Manual

## 1. System Overview

The **Sanchay IoT System** is a dual-node distributed proximity radar and environmental monitoring edge unit designed for the Sanchay Intelligent Fleet Platform.

```
       +------------------------------------+
       |       BOARD 1: SENSOR NODE         |
       |  - HC-SR04 Ultrasonic Radar        |
       |  - DHT22 (Temperature & Humidity)  |
       |  - HC-SR501 PIR (Motion Sensor)    |
       |  - NEO-M8 GPS (Satellites & Nav)   |
       |  - Proximity RGB LED               |
       +-----------------+------------------+
                         |
                         | ESP-NOW Wireless Broadcast (2.4 GHz)
                         | 5 Hz (Every 200 ms) | 34-byte packet
                         v
       +------------------------------------+
       |    BOARD 2: DISPLAY & CLOUD NODE   |
       |  - 0.96" SSD1306 OLED Screen       |
       |  - Environmental Guardian RGB LED  |
       |  - Proximity Warning Buzzer        |
       |  - Wi-Fi HTTP Telemetry Dispatch   |
       +-----------------+------------------+
                         |
                         | Wi-Fi (SSID: "NASA")
                         | POST /api/iot/ingest (Every 3 seconds)
                         v
       +------------------------------------+
       |      SANCHAY FLEET CLOUD APP       |
       |  - Live Patrol Vehicle Map         |
       |  - Fleet Telemetry & Readiness Desk|
       |  - Automatic Incident & SOS Logs   |
       +------------------------------------+
```

---

## 2. OLED Screen Cockpit Guide (Board 2)

The 0.96" OLED screen is engineered with a **clean, spacious, high-contrast cockpit layout**. All status labels are written in **plain English** with zero cryptic acronyms.

### Visual Screen Layout

```text
+-------------------------------------------------------+
| NODE 1: OK                           WIFI: OK         | <-- Top Radio Status Bar
+-------------------------------------------------------+
|                                                       |
|   45 cm             [ WARNING ]                       | <-- Hero Distance (Big Size 2) & Zone
|                                                       |
| [=======================                            ] | <-- Analog Radar Distance Gauge
|                                                       |
| TEMP: 26.4 C                         HUM: 54 %        | <-- Climate Readings (DHT22)
| MOTION: NO                           GPS: 8 SAT       | <-- Security (PIR) & Navigation
|                                                       |
| CLOUD: 28 PKTS SYNCED                                 | <-- Sanchay App Upload Status
+-------------------------------------------------------+
```

### Detailed Field Breakdown

| Screen Row | Display Example | What It Means |
|---|---|---|
| **Top Left** | `NODE 1: OK` | Wireless ESP-NOW connection to Board 1 is healthy. |
| | `NODE 1: LOST` | Board 1 is unpowered, out of range, or rebooting. |
| **Top Right** | `WIFI: OK` | Connected to Wi-Fi router `NASA` (2.4 GHz). |
| | `WIFI: --` | Searching for Wi-Fi router or credentials not reached. |
| **Hero Display** | **`45 cm`** | Distance to nearest obstacle in front of the ultrasonic sensor (**displayed in large text size 2** for instant readability). |
| | `CLEAR` | No obstacle detected in range (> 400 cm). |
| **Zone Badge** | `[SAFE]` | Obstacle is > 120 cm away (Safe operational buffer). |
| | `[WATCH]` | Obstacle is between 60 cm and 120 cm. |
| | `[WARN]` | Obstacle is between 30 cm and 60 cm. |
| | `[CLOSE]` | Obstacle is between 10 cm and 30 cm (Slow down!). |
| | `[STOP!]` | Obstacle is < 10 cm away or touching bumper (Critical collision risk!). |
| **Radar Bar** | `[========  ]` | Graphical analog progress bar. Expands as an obstacle gets closer. |
| **Climate Row** | `TEMP: 26.4 C` | Real-time ambient temperature from DHT22. |
| | `HUM: 54 %` | Relative humidity percentage from DHT22. |
| **Security Row** | `MOTION: NO` | PIR motion sensor area is clear. |
| | `>> MOTION DETECTED <<` | Inverted white banner flashes when human/object movement is detected by the PIR sensor. |
| **GPS Row** | `GPS: 8 SAT` | NEO-M8 has an active 3D satellite fix with 8 satellites. |
| | `GPS: SEARCH` | Satellite fix is currently acquiring. |
| **Bottom Row** | `CLOUD: SENDING DATA...` | A live telemetry packet is currently being dispatched via HTTP to Sanchay App. |
| | `CLOUD: 28 PKTS SYNCED` | Total count of confirmed telemetry packets ingested by Sanchay App. |
| | `CLOUD: OFFLINE (NO WF)`| Running in offline mode without router connection. |

---

## 3. Board 1 RGB: Proximity Radar Gradient (Ultrasonic Sensor Node)

Board 1 is dedicated to the front ultrasonic bumper radar. Rather than jumping in coarse steps, Board 1's RGB LED uses **24-bit continuous PWM interpolation** across the warm/hazard color spectrum (from 150 cm down to 8 cm). Every single centimeter change produces a smooth, fluid analog color transition:

```
Distance:   150 cm ------> 110 cm ------> 80 cm ------> 50 cm ------> 25 cm ------> < 8 cm
Visual:     [GREEN]       [LIME]        [YELLOW]      [AMBER]       [ORANGE]       [SOLID RED]
RGB:       (0,255,0)    (75,255,0)    (255,255,0)   (255,180,0)   (255,60,0)     (255,0,0)
Zone:       [SAFE]        [FAR]        [APPROACH]     [WARN]       [CAUTION]       [STOP!]
```

* **150 cm to 80 cm (Approach Zone)**: Green channel stays at `255` while Red channel smoothly ramps from `0` to `255` (Pure Green -> Lime -> Chartreuse -> Pure Bright Yellow).
* **80 cm to 8 cm (Danger Zone)**: Red channel stays at `255` while Green channel smoothly drops from `255` down to `0` (Pure Yellow -> Amber -> Warm Orange -> Red-Orange -> Deep Solid Red).
* **< 8 cm (Contact / Collision Stop)**: Pure intense Solid Red (`255, 0, 0`).
* **RF Broadcast Spark**: Micro 20 ms Cyan-White spark (`180, 255, 255`) every 1s confirming telemetry transmission to Board 2.

---

## 4. Board 2 RGB: Multi-Sensor Guardian & Security Engine

As Board 2 already features an OLED display with numerical distance hero and radar bars plus an active acoustic buzzer, **Board 2's RGB LED is completely decoupled from ultrasonic distance changes**. 

Instead, Board 2's RGB LED serves as an **Environmental Guardian, Cabin Security, and Connectivity Sentinel**:

| Priority | System Event | LED Visual Color | What It Means |
|---|---|---|---|
| **1 (Highest)**| **RF Link Lost** | **Solid Blue** (`0, 0, 255`) | Board 1 is unpowered, out of range, or rebooting. |
| **2** | **Intruder / PIR Motion** | **Vibrant Magenta** (`255, 0, 200`) | Movement detected by PIR sensor while vehicle or area is monitored. |
| **3a** | **High Temperature Hazard** | **Fire Red** (`255, 0, 0`) | Cabin / enclosure temperature $\ge 35^\circ\text{C}$ (Overheating risk). |
| **3b** | **Freezing / Cold Hazard** | **Ice Cyan** (`0, 220, 255`) | Ambient temperature $\le 16^\circ\text{C}$ (Frost / freezing warning). |
| **3c** | **High Humidity Hazard** | **Deep Violet** (`60, 0, 255`) | Ambient humidity $\ge 85\%$ (Condensation / moisture hazard). |
| **4a** | **Nominal + GPS Locked** | **Solid Green** (`0, 255, 0`) | All systems nominal, full satellite lock acquired! |
| **4b** | **Nominal + GPS Searching** | **Warm Amber** (`220, 160, 0`) | All systems nominal, searching for GPS satellites. |

---

## 5. Connectivity LED Blip Signatures

To provide rich real-time communication feedback without obscuring the steady status color, the RGB LEDs feature **micro-pulse blip overlays**:

| Blip Signature | Board | Duration & Style | Connectivity Event Indicated |
|---|---|---|---|
| **Cloud Sync Blip** | Board 2 | **50 ms Dark Blip** (Turns OFF briefly) | Telemetry packet delivered and accepted by Sanchay App (`POST /api/iot/ingest`). Gives instant visual confirmation of each cloud sync! |
| **RF Reception Spark** | Board 2 | **20 ms Cyan-White Spark** (`180, 255, 255`) | Confirms live ESP-NOW wireless telemetry packet received from Board 1 (fires every 1s). |
| **RF Broadcast Spark** | Board 1 | **20 ms Cyan-White Spark** (`180, 255, 255`) | Confirms live ESP-NOW wireless telemetry broadcast dispatched from Board 1 (fires every 1s). |
| **Wi-Fi Search Tick** | Board 2 | **35 ms Blue Tick** (`0, 0, 255`) | Periodic tick (every 2.5s) indicating device is searching for router `NASA`. Disappears when connected! |

---

## 6. High-Precision Dynamic Acoustic Buzzer (Board 2)

The active buzzer on Board 2 has been upgraded to a **continuous automotive parking radar curve**. Instead of 3 coarse steps, the beep cadence scales smoothly from 150 cm down to 8 cm:

| Distance Measured | Beep Period | Pulse Width (ON time) | Acoustic Cadence & Pitch |
|---|---|---|---|
| **> 150 cm** | Infinite | 0 ms | **Completely Silent** |
| **150 cm – 100 cm** | 900 ms – 520 ms | 65 ms | **Slow Periodic Tick** (1 to 2 Hz) |
| **100 cm – 60 cm** | 520 ms – 280 ms | 55 ms | **Steady Radar Beep** (~3 Hz) |
| **60 cm – 20 cm** | 280 ms – 90 ms | 40 ms | **Rapid Warning Pulse** (4 to 10 Hz) |
| **20 cm – 8 cm** | 90 ms – 35 ms | 20 ms | **Ultra-Rapid Staccato** (Geiger-counter buzz!) |
| **< 8 cm (Contact)** | Continuous | Solid ON | **Solid Continuous Tone** (Collision stop!) |

---

## 7. Sanchay Cloud Integration & Telemetry Pipeline

### Network Configuration
* **Wi-Fi SSID**: `"NASA"` (2.4 GHz)
* **Wi-Fi Password**: `"9936@Pari"`
* **Local Sanchay Server**: `http://192.168.1.33:3000`
* **Ingest API Endpoint**: `POST /api/iot/ingest`
* **Device Authentication**:
  * `X-Device-Code`: `SANCHAY-IOT-001`
  * `Authorization`: `Bearer sk_sanchay_iot_edge_2026`
  * **Bound Patrol Vehicle**: `MP07-DG-6386` (Gwalior District Police Fleet)

### Telemetry Ingestion Payload
```json
{
  "lat": 26.218300,
  "lng": 78.182800,
  "speedKmph": 24.5,
  "heading": 90,
  "ignition": true,
  "fuelPercent": 85,
  "signalDbm": -62,
  "sos": false
}
```
* If an obstacle enters `ZONE_CRITICAL` (< 10 cm), the device automatically sets `"sos": true`, opening an immediate safety incident ticket in the Sanchay command center!

---

## 8. Demonstration Walkthrough Script

1. **Power Up**:
   * Plug USB power into Board 2 first: Observe the animated `SANCHAY` logo and progress bar on the OLED.
   * Screen displays `NODE 1: LOST` and RGB turns **Blue** (proving the wireless watchdog works).
2. **Bring Sensor Node Online**:
   * Plug USB power into Board 1: Within 200 ms, Board 2's screen immediately transitions to `NODE 1: OK`.
   * Board 2 RGB transitions to **Solid Green** (or Amber while GPS acquires).
3. **Test Proximity Radar**:
   * Move your hand towards Board 1's ultrasonic sensor:
     * Observe the **Large Size 2 distance numbers** (`85 cm`, `42 cm`, `15 cm`, `8 cm`).
     * Watch the **analog radar progress bar** fill up.
     * Hear the **buzzer pulses** speed up from 1 Hz to continuous tone.
     * Board 1 RGB shifts `Green -> Yellow -> Orange -> Red`.
4. **Test Security Motion Sensor**:
   * Wave hand over Board 1's PIR sensor:
     * Board 2 OLED flashes `>> MOTION DETECTED <<` in high-contrast inverted white video!
     * Board 2 RGB lights up in **Vibrant Magenta**!
5. **Verify Sanchay Cloud Sync**:
   * Notice Board 2's bottom screen row: `CLOUD: SENDING DATA...` then increments `CLOUD: 12 PKTS SYNCED`.
   * Notice the Green RGB LED **blips off for 50 ms** on each transmission.
   * Open the Sanchay Web App at `http://localhost:3000/iot`:
     * Device `SANCHAY-IOT-001` shows `ONLINE`, live telemetry freshness, and patrol vehicle `MP07-DG-6386` updates on the live map!

