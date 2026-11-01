# Sanchay IoT - Quick Emergency Wiring Cheatsheet

> **Purpose:** Ultra-fast, pin-to-pin wiring reference to re-wire both NodeMCU boards from scratch in under 2 minutes.

---

## Board 1: Sensor Edge Node (Radar, Climate, Motion & GPS)

> **NodeMCU USB:** Connect to independent 5V USB source.

### 1. Pin-to-Pin Quick Matrix

| Component | Sensor Pin | Connects to NodeMCU | Voltage | Critical Notes |
|:---|:---|:---|:---|:---|
| **HC-SR04** (Radar) | **VCC** | **VIN** | 5V | Needs 5V for accurate ultrasound pulses |
| | **GND** | **GND** | Ground | Common GND |
| | **TRIG** | **D3** (GPIO 0) | 3.3V | 10k pull-up to 3V3 required for boot |
| | **ECHO** | **D2** (GPIO 4) | 3.3V | **Must use divider:** 1k series + 2k to GND (protects ESP) |
| **DHT22** (Climate) | **VCC** | **3V3** | 3.3V | **DO NOT CONNECT TO VIN (3.3V ONLY)** |
| | **GND** | **GND** | Ground | Common GND |
| | **DATA** | **D4** (GPIO 2) | 3.3V | 10k pull-up resistor between DATA and 3V3 |
| **HC-SR501** (PIR) | **VCC** | **VIN** | 5V | Connect to 5V VIN rail |
| | **GND** | **GND** | Ground | Common GND |
| | **OUT** | **D0** (GPIO 16) | 3.3V | Direct input (no resistor required) |
| **NEO-M8N** (GPS) | **VCC** | **VIN** | 5V | If 3.3V module, use 3V3 rail |
| | **GND** | **GND** | Ground | Common GND |
| | **TX** | **D6** (GPIO 12) | 3.3V | GPS TX -> ESP Software RX |
| | **RX** | **D7** (GPIO 13) | 3.3V | GPS RX -> ESP Software TX |
| **RGB LED** (Sentinel) | **RED** | **D1** (GPIO 5) | 3.3V | Via 100R to MOSFET Gate / Anode |
| | **GREEN** | **D5** (GPIO 14) | 3.3V | Via 100R to MOSFET Gate / Anode |
| | **BLUE** | **D8** (GPIO 15) | 3.3V | Via 100R to MOSFET Gate / Anode (Must be LOW at boot) |
| | **COMMON** | **VIN / 3V3 / GND** | - | Depends on Common Anode (+5V) or Cathode (GND) |

---

## Board 2: Cockpit Display & Cloud Gateway Node

> **NodeMCU USB:** Connect to independent 5V USB source (e.g. Laptop COM port).

### 1. Pin-to-Pin Quick Matrix

| Component | Module Pin | Connects to NodeMCU | Voltage | Critical Notes |
|:---|:---|:---|:---|:---|
| **0.96" OLED (SPI)** | **GND** | **GND** | Ground | Common GND |
| | **VCC** | **3V3** | 3.3V | **3.3V ONLY (Connecting to VIN will burn display)** |
| | **D0 / SCK** | **D1** (GPIO 5) | 3.3V | SPI Clock signal |
| | **D1 / MOSI** | **D2** (GPIO 4) | 3.3V | SPI Data signal |
| | **CS** | **D3** (GPIO 0) | 3.3V | Chip Select (10k pull-up to 3V3 for boot) |
| | **RES** | **D4** (GPIO 2) | 3.3V | Reset (10k pull-up to 3V3 for boot) |
| | **DC** | **D8** (GPIO 15) | 3.3V | Data/Command (Must be LOW at boot) |
| **Acoustic Buzzer** | **(+) Positive** | **D0** (GPIO 16) | 3.3V | Active 3.3V buzzer (<10mA) |
| | **(-) Negative** | **GND** | Ground | Common GND |
| **RGB LED** (Sentinel) | **RED** | **D5** (GPIO 14) | 3.3V | Via 100R gate / anode |
| | **GREEN** | **D6** (GPIO 12) | 3.3V | Via 100R gate / anode |
| | **BLUE** | **D7** (GPIO 13) | 3.3V | Via 100R gate / anode |
| | **COMMON** | **VIN / 3V3 / GND** | - | Common Anode (+5V) or Cathode (GND) |

---

## Emergency 60-Second Sanity Checks

1. **Never Wire the Two Boards Together:**
   - Both NodeMCUs communicate **wirelessly over 2.4 GHz ESP-NOW**.
   - NEVER bridge the 5V (VIN) or 3.3V rails between Board 1 and Board 2.

2. **Boot Pin Rules (If NodeMCU won't start or blue LED stays dimly lit):**
   - **D3 (GPIO 0):** Must be HIGH during boot (do NOT tie to GND).
   - **D4 (GPIO 2):** Must be HIGH during boot (do NOT tie to GND).
   - **D8 (GPIO 15):** Must be LOW during boot (do NOT pull up to 3.3V).

3. **Voltage Traps:**
   - **DHT22 & OLED:** 3.3V (`3V3` pin) only.
   - **HC-SR04 & PIR:** 5V (`VIN` pin).
   - **HC-SR04 Echo:** 5V output -> Must pass through resistor divider (1k series / 2k to GND) before hitting **D2**.

---

---

## Board 3: Dual-Screen Cockpit & Judge Billboard Node

> **Sketch:** `firmware/board3_dual_display/board3_dual_display.ino`
> **Role:** Simultaneously drives the **7-Pin SPI OLED** (Telemetry sensor pages) AND the **4-Pin I2C OLED** (Executive marketing/pitch deck slides) on one NodeMCU.

### 1. Screen 1: 7-Pin SPI OLED (Live Multi-Page Telemetry)

| 7-Pin OLED Pin | Connects to NodeMCU | Voltage | Function |
|:---|:---|:---|:---|
| **GND** | **GND** | Ground | Common GND |
| **VCC** | **3V3** | 3.3V | **3.3V ONLY (Never connect to VIN)** |
| **D0** (SCK / CLK) | **D0** (GPIO 16) | 3.3V | SPI Clock signal |
| **D1** (MOSI / DATA) | **D1** (GPIO 5) | 3.3V | SPI Data signal |
| **RES** (Reset) | **D2** (GPIO 4) | 3.3V | Reset signal |
| **DC** (Data/Command) | **D3** (GPIO 0) | 3.3V | Command select |
| **CS** (Chip Select) | **D4** (GPIO 2) | 3.3V | Chip enable |

### 2. Screen 2: 4-Pin I2C OLED (Sanchay PR & Judge Pitch Billboard)

| 4-Pin OLED Pin | Connects to NodeMCU | Voltage | Function |
|:---|:---|:---|:---|
| **GND** | **GND** | Ground | Common GND |
| **VCC** | **3V3** | 3.3V | **3.3V ONLY** |
| **SDA** (Data) | **D7** (GPIO 13) | 3.3V | Software I2C Data |
| **SCL** (Clock) | **D8** (GPIO 15) | 3.3V | Software I2C Clock |

### 3. Local Climate Sensor: DHT11 (Live Interactive Demo)

| DHT11 Pin | Connects to NodeMCU | Voltage | Function |
|:---|:---|:---|:---|
| **GND** (-) | **GND** | Ground | Common GND |
| **VCC** (+) | **3V3** | 3.3V | 3.3V Rail |
| **DATA** (Out) | **D5** (GPIO 14) | 3.3V | Live temperature & humidity (judges can blow on it to test) |

---

## Physical Breadboard Pin Cheat (NodeMCU Pin Map)

```text
               +------------------+
               |     [USB PORT]   |
        [ A0 ] |                  | [ D0 ] -> Board 1: PIR Out  | Board 2: Buzzer (+)
        [ G  ] |                  | [ D1 ] -> Board 1: RGB Red  | Board 2: OLED SCK (D0)
        [ VU ] |     NODEMCU      | [ D2 ] -> Board 1: Echo     | Board 2: OLED MOSI (D1)
        [ S3 ] |      ESP8266     | [ D3 ] -> Board 1: Trig     | Board 2: OLED CS
        [ S2 ] |                  | [ D4 ] -> Board 1: DHT22    | Board 2: OLED RES
        [ S1 ] |                  | [ 3V ] -> 3.3V Rail (DHT22, OLED)
        [ SC ] |                  | [ G  ] -> Ground Rail
        [ S0 ] |                  | [ D5 ] -> Board 1: RGB Green| Board 2: RGB Red
        [ SK ] |                  | [ D6 ] -> Board 1: GPS TX   | Board 2: RGB Green
        [ G  ] |                  | [ D7 ] -> Board 1: GPS RX   | Board 2: RGB Blue
        [ 3V ] |                  | [ D8 ] -> Board 1: RGB Blue | Board 2: OLED DC
        [ EN ] |                  | [ RX ] 
        [ RST] |                  | [ TX ] 
        [ G  ] |                  | [ G  ] -> Ground Rail
        [ VIN] |                  | [ 3V ] -> 3.3V Rail
               +------------------+
```
