# Sanchay IoT - Wiring and Bring-Up Plan

Companion to `smart_proximity_monitoring_project_plan.md`.

> **Pin layout is frozen in `FINAL_PINOUT.md`.** The integrated ESP-NOW
> firmware is in `firmware/board1_main` (sensor/sender) and
> `firmware/board2_main` (display/receiver).

Goal: connect every module safely, prove each one works on its own, then flash
the final firmware and run the full demo.

Rule of the build: **one module at a time.** Wire it, test it, power down, then
wire the next one. Do not wire the whole system and power it up in one shot.

## Build order at a glance

- [ ] Identify the RGB wires, voltage, and anode/cathode configuration
- [ ] Identify the GPS module voltage and the buzzer type
- [ ] Run all pre-power resistance checks (Gate A)
- [ ] Board #1: wire DHT22, test it
- [ ] Board #1: wire HC-SR04 with divider, test it
- [ ] Board #1: wire PIR, test it
- [ ] Board #1: wire GPS, test it
- [ ] Board #2: wire OLED, test it
- [ ] Board #2: wire buzzer, test it
- [ ] Board #2: wire RGB driver, test it (Gate B)
- [ ] Run the ESP-NOW link test (Gate C)
- [ ] Flash the integrated firmware
- [ ] Run the 14-point integration matrix and 10-minute soak (Gate D)

---

## 0. Final architecture (decided)

| Board | Role | Talks to |
|---|---|---|
| NodeMCU #1 | Sensor node: DHT22, HC-SR04, PIR, GPS | Sends readings over ESP-NOW |
| NodeMCU #2 | Display/alert node: OLED, RGB driver, buzzer | Receives over ESP-NOW |

The boards are **not** wired to each other. Each has its own USB power.
Communication is wireless (ESP-NOW), so no common ground between boards.

### Pin map (final)

**NodeMCU #1 - Sensor node**

| Module | Module pin | NodeMCU pin | GPIO | Notes |
|---|---|---|---|---|
| DHT22 | VCC | 3V3 | - | 3.3 V only |
| DHT22 | DATA | D4 | GPIO2 | 10 kOhm pull-up to 3V3 |
| DHT22 | GND | GND | - | |
| HC-SR04 | VCC | VIN | - | 5 V |
| HC-SR04 | TRIG | D3 | GPIO0 | 10 k pull-up to 3V3 for boot |
| HC-SR04 | ECHO | via divider | D2 / GPIO4 | **mandatory divider** |
| HC-SR04 | GND | GND | - | |
| HC-SR501 PIR | VCC | VIN | - | 5 V (more stable than 3.3 V) |
| HC-SR501 PIR | OUT | D0 | GPIO16 | Output is 3.3 V, safe |
| HC-SR501 PIR | GND | GND | - | |
| NEO-M8 GPS | VCC | VIN or 3V3 | - | Read the module label first |
| NEO-M8 GPS | TX | D6 | GPIO12 | Soft-serial RX |
| NEO-M8 GPS | RX | D7 | GPIO13 | Soft-serial TX |
| NEO-M8 GPS | GND | GND | - | |
| RGB driver R | Gate | D1 | GPIO5 | via 100 Ohm, 10 k to GND |
| RGB driver G | Gate | D5 | GPIO14 | via 100 Ohm, 10 k to GND |
| RGB driver B | Gate | D8 | GPIO15 | via 100 Ohm, 10 k to GND |

All GPIOs on board #1 are now used. The RGB is driven locally from the
distance reading. The two RGB lights (one per board) use the same alert zone,
computed on board #1 and sent in the ESP-NOW packet.

**NodeMCU #2 - Display/alert node**

| Module | Module pin | NodeMCU pin | GPIO | Notes |
|---|---|---|---|---|
| OLED 7-pin (SPI) | GND | GND | - | |
| OLED 7-pin (SPI) | VCC | 3V3 | - | 3.3 V only |
| OLED 7-pin (SPI) | D0 / SCK | D1 | GPIO5 | Clock (software SPI) |
| OLED 7-pin (SPI) | D1 / MOSI | D2 | GPIO4 | Data (software SPI) |
| OLED 7-pin (SPI) | CS | D3 | GPIO0 | Add 10 k pull-up (idles high at boot) |
| OLED 7-pin (SPI) | RES | D4 | GPIO2 | Add 10 k pull-up (idles high at boot) |
| OLED 7-pin (SPI) | DC | D8 | GPIO15 | Onboard pull-down holds it low at boot; harmless |
| RGB driver R | Gate | D5 | GPIO14 | via 100 Ohm, 10 k to GND |
| RGB driver G | Gate | D6 | GPIO12 | via 100 Ohm, 10 k to GND |
| RGB driver B | Gate | D7 | GPIO13 | via 100 Ohm, 10 k to GND |
| Buzzer | + | D0 | GPIO16 | direct drive; 3.3 V active buzzer only |
| Buzzer | - | GND | - | |

All GPIOs on board #2 are now used. The OLED is **SPI, not I2C**; the
Adafruit_SSD1306 I2C constructor will not work.

### Why these pins

- D1/D2 are used as software SPI clock/data for the OLED on board #2.
- On board #1, D1/D5/D8 are the three RGB channels. D8 (GPIO15) must be LOW at
  boot, and the MOSFET gate pull-down provides that. D3 (GPIO0) must be HIGH at
  boot; it drives the HC-SR04 TRIG with a 10 k pull-up, and TRIG is high
  impedance so there is no conflict.
- D4 (GPIO2) must be HIGH at boot; on board #1 the DHT pull-up provides that,
  and on board #2 it drives OLED RES with a pull-up.
- On board #2, D3 drives OLED CS and D8 drives OLED DC; the CS pull-up and the
  D8 pull-down match the required boot states.

---

## 1. Safety rules (read before touching hardware)

1. **ESP8266 GPIOs are 3.3 V only.** 5 V on any GPIO destroys the pin or the
   board. The HC-SR04 ECHO divider is not optional.
2. **Never power the RGB bulb from the NodeMCU 3V3 pin.** It draws far more
   than the regulator can supply.
3. **Never drive a 5 V or high-current buzzer, or any RGB channel, directly
   from a GPIO.** The only exception is a verified 3.3 V active buzzer drawing
   10 mA or less, wired + to D0 and - to GND. GPIO limit is about 12 mA.
4. **Common ground is required inside each board's power domain.** If the RGB
   bulb has its own supply, its GND must connect to NodeMCU #2 GND.
5. **Do not connect the two NodeMCUs' 5 V or 3V3 rails together.** They are
   independent USB-powered nodes.
6. **Power off / unplug USB before changing any wiring.** Do not hot-plug.
7. **Do not open or probe a mains-voltage bulb.** If the RGB bulb is a sealed
   mains unit, stop and use a 5 V or 12 V RGB module instead.
8. **Verify the ECHO divider with a multimeter before connecting it to D2.**
9. Keep the GPS antenna away from the ESP8266, buzzer, and power wires.
10. Use a multimeter, not guesswork, for every polarity and voltage decision.

---

## 2. Tools and extra parts to arrange

- Multimeter (must have resistance and DC voltage modes)
- 2 x breadboard, jumper wires, header pins
- Resistors: 1 kOhm x2, 2 kOhm x1, 10 kOhm x4, 100 Ohm x3
- 3 x logic-level N-channel MOSFET (IRLZ44N, IRL540N, or AO3400 for low current)
- 1 x 2N2222 or BC547 NPN transistor
- 1 x 1N4007 diode
- 5 V 1 A USB adapters or power banks (one per board)
- External supply for the RGB bulb, only after its voltage is identified
- Optional: USB current meter, heat-shrink, small screwdriver
- Tape and marker for labelling boards and wires

Colour convention: red = 5 V, orange = 3.3 V, black = GND, everything else =
signal. Label both ends of every jumper.

---

## 3. Phase 1 - Identify the hardware before wiring

Write the answers in the test record sheet at the end.

### 3.1 NodeMCU boards

- Confirm both are ESP8266 NodeMCU boards and note the model (v2 / v3 / LoLin).
- Check the pin labels printed on the board (D0..D8, 3V3, VIN, GND).
- With a USB cable only, confirm each board powers up (LED on) and is detected
  as a COM port on the PC.

### 3.2 RGB bulb / light - the most important identification

The four wires are described as red, black, blue, green. **Do not assume red is
the red channel and black is ground.** Identify them physically.

Power-off diode-test procedure:

1. Set the multimeter to diode / continuity mode.
2. Probe every pair of wires in both directions. Record which pairs show a
   forward drop (roughly 1.6-3.4 V) and which show open circuit.
3. A wire that shows a forward drop to **all three** other wires is the
   **common** wire.
4. The other three wires are the R, G, B channels. Confirm channel colour with
   a current-limited test (1 kOhm series resistor) from a supply matching the
   bulb rating.
5. Record: common wire colour, channel wire colours, rated voltage, and
   common-anode vs common-cathode.

Interpretation:

| Finding | Meaning | Driver needed |
|---|---|---|
| Common wire is positive (+) | Common anode | N-MOSFET low-side per channel |
| Common wire is negative (-) | Common cathode | P-MOSFET high-side per channel |
| Bulb rated 5 V | 5 V supply | MOSFET or NPN driver, external 5 V |
| Bulb rated 12 V | 12 V supply | Logic-level N-MOSFET + 12 V supply |
| No identifiable LED junctions | Bulb has internal driver | Do not connect; use a plain RGB module |

If common cathode with 12 V, do not use an N-MOSFET low-side driver. Use a
P-channel high-side driver or replace the bulb with a common-anode type.

### 3.3 HC-SR501 PIR

- Jumper: set to **H** (repeatable trigger) so motion status stays live.
- Turn the delay potentiometer (Tx) fully counter-clockwise for the shortest
  hold time (about 3 s) for testing.
- Set sensitivity (Sx) to the middle position.
- Expect a 30-60 s warm-up with false triggers after power-on. This is normal.

### 3.4 NEO-M8 GPS module

- Read the silkscreen: `3.3V only` or `3.3-5V`.
- If it says 3.3 V only, power it from 3V3. If it says 3.3-5 V, VIN is fine.
- The TX/RX pins are 3.3 V logic in both cases.
- Note whether it has a ceramic patch antenna and a backup battery.
- First fix needs sky view; indoors it may never fix.

### 3.5 Buzzer

- Apply 3.3 V briefly through a 100 Ohm resistor.
- Continuous tone = **active** buzzer (drive with digitalWrite).
- Only a click = **passive** buzzer (drive with `tone()`).
- Record the rated voltage printed on it (5 V or 12 V).

### 3.6 DHT22, HC-SR04, OLED

- DHT22: confirm 3 pins (VCC, DATA, GND). If it is a bare sensor, the 10 kOhm
  pull-up is required. If it is a 3-pin module, the pull-up is usually onboard
  but adding 10 kOhm does no harm.
- HC-SR04: confirm 4 pins (VCC, TRIG, ECHO, GND) and that it is the 5 V type.
- OLED: confirm 7 pins labelled GND, VCC, D0/SCK, D1/MOSI, RES, DC, CS. This is
  an SPI panel. If your module uses different labels, map them by function
  (clock, data, reset, data/command, chip select), not by the D0/D1 names.

**Gate 1: do not wire anything until the RGB common wire and voltage are known.**

---

## 4. Phase 2 - Power architecture

```
                 NodeMCU #1                        NodeMCU #2
              micro-USB 5 V                      micro-USB 5 V
                   |                                  |
        +----------+----------+            +----------+----------+
        |                     |            |                     |
      VIN (5 V)            3V3           VIN (5 V)            3V3
        |                     |            |                     |
  PIR VCC               DHT22 VCC     (spare)             OLED VCC
  HC-SR04 VCC           GPS VCC*
  GPS VCC*              DHT pull-up
  RGB PSU #1 (GND common with board #1)   RGB PSU #2 (GND common with board #2)
```

- Use one USB supply per board, rated at least 1 A.
- VIN is the 5 V rail when the board is USB-powered. On some boards it measures
  about 4.7 V due to a protection diode; that is fine for these modules.
- If VIN measures below 4.5 V under load, power the 5 V sensors from a separate
  5 V supply and connect its GND to the NodeMCU GND.
- **Never connect 12 V to VIN.** The RGB bulb gets its own supply.
- Total load per board is well under 250 mA, so a 1 A USB source is enough.

---

## 5. Phase 3 - Wire NodeMCU #1 (sensor node)

Power off / unplug USB before each step. Wire one module, then run its test
sketch from Phase 7 before adding the next module.

### Step 1 - DHT22

```
DHT22 VCC  ──────────────  3V3
DHT22 DATA ──────┬───────  D4 (GPIO2)
                 │
               [10 k]
                 │
DHT22 VCC ───────┘   (pull-up between DATA and 3V3)

DHT22 GND  ──────────────  GND
```

### Step 2 - HC-SR04 with ECHO divider

```
HC-SR04 VCC  ────────────  VIN (5 V)
HC-SR04 GND  ────────────  GND
HC-SR04 TRIG ──┬─────────  D3 (GPIO0)
               │
             [10 k]
               │
              3V3

HC-SR04 ECHO ──[1 k]──┬── D2 (GPIO4)
                      │
                    [2 k]
                      │
                     GND
```

The 10 k pull-up on TRIG holds D3 (GPIO0) HIGH at boot, which the ESP8266
requires. TRIG is a high-impedance input, so the pull-up does not interfere.

Divider output = 5 V x 2k / (1k + 2k) = **3.33 V**. Verify with a multimeter
with the sensor powered before connecting the junction to D2.

### Step 3 - HC-SR501 PIR

```
HC-SR501 VCC ────────────  VIN (5 V)
HC-SR501 GND ────────────  GND
HC-SR501 OUT ────────────  D0 (GPIO16)
```

GPIO16 is a digital input here; it does not need PWM or interrupts. Poll it.

### Step 4 - NEO-M8 GPS

```
GPS VCC ─────────────────  VIN (if label says 3.3-5 V)
                           or 3V3 (if label says 3.3 V only)
GPS GND ─────────────────  GND
GPS TX  ─────────────────  D6 (GPIO12)   <- module TX to ESP RX
GPS RX  ─────────────────  D7 (GPIO13)   <- module RX to ESP TX
```

The TX/RX crossing is intentional. During first upload, leave the GPS TX wire
disconnected if the upload misbehaves, then reconnect it.

### Step 5 - RGB driver (second light)

Same common-anode N-MOSFET driver as board #2, but on board #1 pins:

```
External +V ────────────── RGB common (anode)

RGB channel (R/G/B) ────── D (drain)
                            S (source) ── GND
ESP D1 / D5 / D8 ──[100 R]─ G (gate)
                 G ──[10 k]── GND
```

| Channel | NodeMCU pin | GPIO |
|---|---|---|
| R | D1 | GPIO5 |
| G | D5 | GPIO14 |
| B | D8 | GPIO15 |

The external supply GND must connect to NodeMCU #1 GND. If both RGB lights
share one supply, all grounds become common; that is fine. Never tie the two
boards' 5 V or 3V3 rails together.

### NodeMCU #1 wiring sketch

```
                    ┌───────────────────────────┐
 DHT22 DATA ────────┤ D4  GPIO2                 │
 HC-SR04 TRIG ──────┤ D3  GPIO0  (10 k to 3V3)  │
 ECHO divider ──────┤ D2  GPIO4                 │
 PIR OUT ───────────┤ D0  GPIO16                │
 GPS TX ────────────┤ D6  GPIO12                │
 GPS RX ────────────┤ D7  GPIO13                │
 RGB R gate ────────┤ D1  GPIO5                 │
 RGB G gate ────────┤ D5  GPIO14                │
 RGB B gate ────────┤ D8  GPIO15                │
                    │ 3V3 ─ DHT VCC, GPS VCC*   │
                    │ VIN ─ PIR, HC-SR04, GPS*  │
                    │ GND ─ all grounds         │
                    └───────────────────────────┘
```

**Gate 2A:** board #1 has no shorts, all grounds connected, divider verified.

---

## 6. Phase 4 - Wire NodeMCU #2 (display/alert node)

Power off before each step.

### Step 1 - 7-pin SPI OLED

Important: the OLED's `D0` and `D1` labels are **not** NodeMCU D0/D1.

```
OLED GND ───────────  GND
OLED VCC ───────────  3V3

OLED D0 / SCK ──────  D1 (GPIO5)      clock
OLED D1 / MOSI ─────  D2 (GPIO4)      data

OLED CS ────────────  D3 (GPIO0)
OLED CS ──[10 k]────  3V3            boot pull-up

OLED RES ───────────  D4 (GPIO2)
OLED RES ──[10 k]───  3V3            boot pull-up

OLED DC ────────────  D8 (GPIO15)    low at boot, harmless
```

- Module `D0` is the SPI clock and goes to NodeMCU `D1`.
- Module `D1` is SPI MOSI (data) and goes to NodeMCU `D2`.
- The 10 k pull-ups on CS and RES keep D3/D4 at their required high boot
  state. The OLED inputs are high impedance, so they do not fight the ESP.
- CS is active low. With the pull-up it idles high and the display is not
  selected until the firmware drives it.
- DC on D8 is low at boot because of the ESP8266's onboard pull-down. No SPI
  clock is running at that moment, so this cannot affect the display.

### Step 2 - Buzzer (direct drive)

```
Buzzer (+) ──────────  D0 (GPIO16)
Buzzer (-) ──────────  GND
```

- Only use this direct connection for a **3.3 V active buzzer rated at 10 mA
  or less**. If it is a 5 V buzzer, or draws more than 10 mA, use the
  transistor driver below instead.
- Test the buzzer alone first: `+` to `3V3`, `-` to `GND` through 100 Ohm. A
  continuous tone means active; a single click means passive.
- Code: `digitalWrite(16, HIGH)` sounds it, `LOW` silences it. For a passive
  buzzer use `tone(16, 2700)` instead.

If the buzzer is 5 V or high-current, use this safer driver:

```
VIN (5 V) ──────────── Buzzer (+)
                         │
                       [1N4007]  cathode to +5 V, anode to collector
                         │
Buzzer (-) ─────────── C  2N2222 / BC547
ESP D0 ────[1 k]────── B
                      E ───────── GND
```

The diode is required for magnetic buzzers. For a small piezo it can be
omitted, but fit it if you have one.

### Step 3 - RGB driver

This example is for a **common-anode** bulb with its own supply. Repeat the
channel circuit three times.

```
External +V ────────────── RGB common (anode)

RGB channel (R/G/B) ────── D (drain)   Q1 IRLZ44N
                            S (source) ── GND
ESP D5/D6/D7 ──[100 R]──── G (gate)
                 G ──[10 k]── GND
```

- External supply voltage = the voltage identified in Phase 3.2.
- External supply GND **must** connect to NodeMCU #2 GND.
- Add a 470-1000 uF electrolytic capacitor across the external supply if the
  bulb causes resets or flicker.
- If the bulb is common **cathode**, use a P-channel high-side driver instead,
  or replace it with a common-anode bulb. Do not guess.

### NodeMCU #2 wiring sketch

```
                    ┌───────────────────────────┐
 OLED SCK/D0 ───────┤ D1  GPIO5                 │
 OLED MOSI/D1 ──────┤ D2  GPIO4                 │
 OLED CS ───────────┤ D3  GPIO0  (10 k to 3V3)  │
 OLED RES ──────────┤ D4  GPIO2  (10 k to 3V3)  │
 OLED DC ───────────┤ D8  GPIO15                │
 RGB R gate ────────┤ D5  GPIO14                │
 RGB G gate ────────┤ D6  GPIO12                │
 RGB B gate ────────┤ D7  GPIO13                │
 Buzzer + ──────────┤ D0  GPIO16                │
 Buzzer - ──────────┤ GND                       │
                    │ 3V3 ─ OLED VCC            │
                    │ GND ─ OLED, buzzer, PSU   │
                    └───────────────────────────┘
```

**Gate 2B:** board #2 has no shorts, external supply ground is common, RGB
channels are correctly identified.

---

## 7. Phase 5 - Pre-power verification (Gate A)

Do all of this with everything unplugged.

### 7.1 Resistance checks (multimeter, power off)

| Check | Expected |
|---|---|
| 5 V rail to GND | Not a dead short (more than about 100 Ohm; capacitors may make it read low briefly) |
| 3.3 V rail to GND | Not a dead short |
| DHT DATA to 3V3 | About 10 kOhm |
| ECHO wire to GND | About 2 kOhm |
| ECHO wire to D2 | 0 Ohm (continuity) |
| Each MOSFET gate to GND | About 10 kOhm |
| Each MOSFET gate to its GPIO | About 100 Ohm |
| RGB channel wires to each other | Open circuit |
| Buzzer + to D0 | Continuity; no short to 5 V or 3V3 |
| Buzzer - to GND | Continuity |

### 7.2 First power-up (board by board, USB only)

1. Plug in only NodeMCU #1, with no external supply connected.
2. Check the board LED and COM port.
3. Measure VIN to GND: about 4.7-5.0 V. Measure 3V3 to GND: about 3.3 V.
4. With the ultrasonic sensor idle, ECHO and the divider junction are both
   0 V; the 3.33 V level only appears during a pulse. The definitive divider
   test is the ultrasonic test sketch, so verify the resistor values and
   continuity now and confirm distance readings in Phase 7.
5. If anything smells hot, discolours, or the current meter shows a sustained
   draw well above 500 mA (brief peaks near 350 mA during Wi-Fi transmission
   are normal), unplug immediately.
6. Repeat for NodeMCU #2 with the RGB external supply **off**.

**Gate A: all checks pass. Only now begin flashing test sketches.**

---

## 8. Phase 6 - Arduino IDE setup

1. Install Arduino IDE 2.x.
2. Add the ESP8266 board URL in Preferences:
   `https://arduino.esp8266.com/stable/package_esp8266com_index.json`
3. Install the `esp8266` board package by ESP8266 Community (3.x).
4. Install libraries:
   - DHT sensor library (Adafruit)
   - Adafruit Unified Sensor
   - Adafruit SSD1306
   - Adafruit GFX Library
   - TinyGPSPlus (or TinyGPS++)
5. Board settings:
   - Board: NodeMCU 1.0 (ESP-12E Module)
   - Upload speed: 115200 (drop to 74880 if upload fails)
   - CPU frequency: 80 MHz
   - Flash size: 4 MB
   - Erase flash: "All Flash Contents" for the first upload only
6. Select the correct COM port. If upload fails, hold the FLASH button while
   the upload starts, or disconnect the GPS TX wire on board #1.

ESP-NOW on ESP8266 uses `#include <espnow.h>` (not `<esp_now.h>`), plus
`WiFi.mode(WIFI_STA)` and `WiFi.disconnect()` before `esp_now_init()`.

### Reference pin definitions for the firmware

```cpp
// Board #1 - sensor node (use GPIO numbers, not D-numbers)
const uint8_t PIN_DHT_DATA = 2;   // D4
const uint8_t PIN_TRIG     = 0;   // D3
const uint8_t PIN_ECHO     = 4;   // D2
const uint8_t PIN_PIR      = 16;  // D0
const uint8_t PIN_GPS_RX   = 12;  // D6 (module TX -> this pin)
const uint8_t PIN_GPS_TX   = 13;  // D7 (module RX <- this pin)
const uint8_t PIN_RGB_R    = 5;   // D1
const uint8_t PIN_RGB_G    = 14;  // D5
const uint8_t PIN_RGB_B    = 15;  // D8

// Board #2 - display/alert node
const uint8_t PIN_OLED_SCK  = 5;   // D1
const uint8_t PIN_OLED_MOSI = 4;   // D2
const uint8_t PIN_OLED_CS   = 0;   // D3
const uint8_t PIN_OLED_RES  = 2;   // D4
const uint8_t PIN_OLED_DC   = 15;  // D8
const uint8_t PIN_RGB_R     = 14;  // D5
const uint8_t PIN_RGB_G     = 12;  // D6
const uint8_t PIN_RGB_B     = 13;  // D7
const uint8_t PIN_BUZZER    = 16;  // D0
```

SPI OLED constructor (software SPI, arbitrary pins):

```cpp
Adafruit_SSD1306 display(128, 64,
                         PIN_OLED_MOSI, PIN_OLED_SCK,
                         PIN_OLED_DC, PIN_OLED_RES, PIN_OLED_CS);
```

The argument order is `mosi, clk, dc, rst, cs`.

> Warning: always use the GPIO number, not the D-number, inside `pinMode()`
> and `digitalWrite()`. D4 is GPIO2; D2 is GPIO4. Getting this backwards is
> the most common wiring bug.

---

## 9. Phase 7 - Individual module tests (Gate B)

Flash and run these in order. Power down before moving wires. Record results.

Test sketches to create under `firmware/tests/`:

| # | Sketch | What it proves | Pass criteria |
|---|---|---|---|
| 1 | `test_oled_spi` | 7-pin OLED SPI wiring | "SPI OK" visible, no garbled pixels |
| 2 | `test_oled` | OLED full layout | All fields render without flicker |
| 3 | `test_dht22` | DHT22 wiring/pull-up | Plausible temp/humidity every 2 s; humidity rises when you breathe on it |
| 4 | `test_ultrasonic` | HC-SR04 + divider | Ruler at 10/30/60/100/150 cm reads within +/-2 cm |
| 5 | `test_pir` | PIR output | After 60 s warm-up, hand wave shows MOTION within 2-3 s |
| 6 | `test_gps` | GPS UART | Raw NMEA visible at 9600; parsed satellites/fix/lat/lon when outdoors |
| 7 | `test_buzzer` | Buzzer direct drive | Silent / 1 Hz / 3 Hz / continuous, no reset |
| 8 | `test_rgb` | RGB driver | Clean red, green, blue, white; no flicker or MOSFET heating |
| 9 | `test_espnow_tx` | Transmit path | Prints its MAC; sends a counter + fake data at 5 Hz |
| 10 | `test_espnow_rx` | Receive path | Prints its MAC; receives packets with increasing sequence numbers |

Board assignment: tests 3-6 on board #1, tests 1-2 and 7-8 on board #2,
tests 9-10 on both boards.

A combined board #1 bring-up sketch is already provided at
`firmware/board1_test/board1_test.ino`. It tests DHT22, HC-SR04, PIR, GPS and
the local RGB, and prints each reading on the serial monitor.

### Test details worth knowing

- **DHT22:** never sample faster than every 2 s. The library blocks interrupts
  for a few milliseconds; that is normal. If readings are NaN, check the pull-up
  and power, then try a 4.7 kOhm pull-up. Some NodeMCU boards have an onboard
  LED on GPIO2 (D4); this normally does not stop the DHT22, but if readings
  remain unreliable, move DATA to D0 (GPIO16) and update both the wiring and
  the firmware constant.
- **Ultrasonic:** use `pulseIn(echoPin, HIGH, 30000)` with a timeout. Treat
  0 cm (no echo/blocked) as CRITICAL and light the RGB red. Treat readings
  above 400 cm as invalid and turn the RGB off. Keep the sensor wires short.
  The ECHO divider must be in place before connecting D2.
- **PIR:** allow 30-60 s warm-up. Ignore motion during warm-up. Set the jumper
  to H first.
- **GPS:** first fix can take 1-5 minutes outdoors. Indoors, expect zero
  satellites. Put the antenna near a window or outside. TX of the module goes
  to D6, not D7. The default baud is usually 9600; if the raw NMEA test shows
  garbage, try 38400 (some u-blox modules ship at that rate).
- **OLED (7-pin SPI):** use the software SPI constructor and pass
  `mosi=D2/GPIO4`, `clk=D1/GPIO5`, `cs=D3/GPIO0`, `rst=D4/GPIO2`,
  `dc=D8/GPIO15`. If the screen stays blank, check that OLED `D0` went to
  NodeMCU D1 (clock) and OLED `D1` went to NodeMCU D2 (data). Do not use the
  I2C constructor.
- **Buzzer:** direct drive only for a 3.3 V active buzzer rated at 10 mA or
  less. If it clicks but does not tone, it is passive; use `tone(16, 2700)`.
  If it is weak, silent, or the board resets when it sounds, it draws too
  much: switch to the transistor driver with `VIN`.
- **RGB:** test at 50% duty first. If a channel is dim or swapped, recheck the
  common-wire identification from Phase 3.2. MOSFETs should stay cool.

**Gate B: every module passes its own test. Do not proceed on a failing module.**

---

## 10. Phase 8 - ESP-NOW link test (Gate C)

1. Flash `test_espnow_rx` to board #2 and open its serial monitor. Note its MAC.
2. Flash `test_espnow_tx` to board #1 with that MAC, or use the broadcast
   address `FF:FF:FF:FF:FF:FF` for the first test.
3. Both nodes must be on the same Wi-Fi channel; set it explicitly (channel 1)
   in code. `WiFi.disconnect()` before `esp_now_init()`.
4. Power both from USB and let them run for 60 s.

Pass criteria:

- Board #2 prints packets with increasing sequence numbers.
- Packet loss below 5% at 10 m line of sight.
- No board resets, no serial garbage.
- Display/alert node keeps running with the OLED attached.

If it fails:

- Confirm both MACs and the channel.
- Confirm `esp_now_set_self_role(ESP_NOW_ROLE_COMBO)` on both.
- Try broadcast MAC first; then hardcode the receiver MAC.
- Keep the boards at least 30 cm apart during the test to avoid receiver
  overload.
- If ESP-NOW remains unreliable, fall back to a wired UART link for the
  demo: board #1 hardware TX (GPIO1) to board #2 D3 (GPIO0, soft-serial RX),
  plus a common ground. Flash both with the serial variant and keep telemetry
  at 1-2 Hz. This is a contingency, not the primary plan.

**Gate C: link is stable. Only then write the integrated firmware.**

---

## 11. Phase 9 - Integrated firmware (Gate D)

### 11.1 Shared packet format

Use the same packed struct in both sketches:

```cpp
typedef struct __attribute__((packed)) {
  uint32_t seq;        // packet counter
  uint32_t uptimeMs;   // sender uptime
  float    tempC;      // DHT22
  float    humidity;   // DHT22
  uint16_t distanceCm; // HC-SR04, 0 = blocked/critical, 999 = invalid
  uint8_t  motion;     // 0/1
  uint8_t  zone;       // 0 SAFE, 1 WATCH, 2 WARN, 3 CLOSE, 4 CRITICAL
  uint8_t  gpsFix;     // 0/1
  uint8_t  satellites; // count
  double   lat;        // valid only if gpsFix
  double   lng;        // valid only if gpsFix
} SensorPacket;
```

Send at 5 Hz. DHT is sampled every 2 s and its last value is reused. GPS is
parsed continuously and the last valid fix is reused. The display shows a
"stale" marker if no packet arrives for more than 2 s.

### 11.2 Sensor node behaviour

- Read ultrasonic at 5-10 Hz, reject outliers, apply a median-of-3 or
  median-of-5 filter.
- Treat a median of 0 cm (no echo/blocked) as CRITICAL (red). Treat readings
  above 400 cm as invalid and turn the RGB off.
- Read DHT every 2 s; if NaN, keep the previous value and flag it.
- Read PIR continuously.
- Parse GPS at 9600 baud; publish fix, satellites, lat/lon.
- Compute the alert zone from distance and drive the local RGB from that zone.
- Send the packet every 200 ms over ESP-NOW.
- Print one CSV line per second on USB serial for debugging:
  `seq,temp,hum,dist,motion,zone,fix,sats,lat,lng`

### 11.3 Display/alert node behaviour

OLED layout (128x64, 8-pixel lines):

```
SANCHAY PROX
T: 28.4C  H: 61%
DIST: 042 cm
PIR: MOTION / CLEAR
GPS: FIX 09 / NO FIX
18.520430N 73.856743E
ALERT: SAFE/WATCH/WARN/CRITICAL
```

- Use the received `zone` for the OLED alert label, the local RGB and the
  buzzer, so both RGB lights stay in sync.
- Refresh the OLED at 5 Hz. Do not clear the whole screen every frame; redraw
  changed fields to avoid flicker.
- If no packet for 2 s, show `LINK LOST` and force the RGB to blue (or off)
  and the buzzer silent.
- Clamp and smooth the distance before mapping it to colour and beep rate.

### 11.4 Alert thresholds (initial values, tunable)

| Distance | Zone | RGB | Buzzer |
|---|---|---|---|
| More than 120 cm | SAFE | Green | Silent |
| 60-120 cm | WATCH | Green to yellow blend | 1 beep per 1000 ms |
| 30-60 cm | WARN | Yellow to orange | 1 beep per 350 ms |
| 10-30 cm | CLOSE | Orange to red | 1 beep per 120 ms |
| 0-10 cm | CRITICAL | Red steady | Continuous |

0 cm means no echo or an object touching the sensor; it is treated as
CRITICAL, not invalid. Readings above 400 cm are invalid and turn the RGB off.

Use PWM (`analogWriteRange(1023)`) for smooth colour blends. For the
direct-wired active buzzer, `digitalWrite(16, HIGH)` sounds it and `LOW`
silences it. If the buzzer is passive, replace the beep pattern with gated
`tone(16, 2700)` bursts.

PIR is reported independently, as the project plan requires. Optional: do not
let PIR force the proximity alert; keep the two behaviours separate.

### 11.5 Flashing order

1. Flash the display/alert firmware to board #2.
2. Flash the sensor firmware to board #1.
3. Power both, wait 10 s, verify the display updates.
4. Run the integration test matrix below.

---

## 12. Phase 10 - Integration test matrix

Run these in order and record pass/fail.

| # | Test | Expected result |
|---|---|---|
| 1 | Power both boards | Both boot, display shows values within 5 s |
| 2 | DHT | Temperature/humidity plausible, update every 2 s |
| 3 | Distance | Hand at 150/100/60/30/10/0 cm gives correct zone; 0 cm shows red |
| 4 | RGB (both) | Both lights show the same zone: green at safe, yellow/orange transitions, red at close |
| 5 | Buzzer | Silent at safe, faster beeps as distance falls, continuous at critical |
| 6 | PIR | Motion flag appears within 2-3 s and clears after the hold time |
| 7 | GPS | Near window/outdoors, fix appears within 5 min, coordinates match phone within about 30 m |
| 8 | Link loss | Power off board #1: board #2 shows LINK LOST within 2 s, no freeze |
| 9 | Reconnect | Power board #1 back on: display recovers within 5 s |
| 10 | Range | Walk board #1 10 m away: link stays up |
| 11 | Power cycle | Repeat 3 times: both nodes recover automatically |
| 12 | Soak | 10 minutes continuous: no resets, no NaN, no frozen display |
| 13 | Alert stress | Move hand rapidly across the sensor: no false continuous red, no reset |
| 14 | Ground check | RGB common ground and external supply secure; MOSFETs cool |

**Gate D: all 14 pass. The system is demo-ready.**

---

## 13. Demo-day script

1. Place the sensor node at the demo position with a clear path for the hand.
2. Place the display node where the OLED and RGB are visible.
3. Power both. Wait for PIR warm-up (about 60 s) and GPS fix.
4. Show the OLED: temperature, humidity, PIR status, GPS coordinates.
5. Slowly move a hand from 150 cm to 0 cm: both RGB lights go green to red,
   buzzer accelerates.
6. Move the hand away: system returns to green and silent.
7. Wave at the PIR: MOTION appears independently of distance.
8. If GPS has no fix indoors, explain the antenna requirement and show the
   "NO FIX" state; do not fake coordinates.

---

## 14. Troubleshooting matrix

| Symptom | Likely cause | Fix |
|---|---|---|
| Board does not boot / boot loop | Something pulling D8 high, or D3/D4 wrong at boot | Remove wiring from D8; check D4 pull-up only |
| Upload fails | Wrong COM port, GPS data on RX, or boot mode | Hold FLASH, lower speed to 74880, disconnect GPS TX |
| OLED blank | SPI clock/data swapped, wrong DC/RES/CS, 5 V on OLED | OLED D0->D1, OLED D1->D2; CS=D3, RES=D4, DC=D8; 3V3 only |
| DHT reads NaN | Missing pull-up, 5 V power, bad wire | 10 kOhm pull-up to 3V3, check VCC, try 4.7 kOhm |
| Ultrasonic always 0 | ECHO not connected, divider wrong, TRIG/ECHO swapped | Verify divider node at D2; TRIG=D1, ECHO=divider=D2 |
| Ultrasonic wild values | Noisy wires, no timeout, no filtering | Short wires, 30 ms timeout, median filter |
| PIR always HIGH | 60 s warm-up, delay pot too high, jumper H | Wait, turn Tx down, set jumper H |
| PIR never triggers | Powered at 3.3 V, sensitivity too low | Power from VIN 5 V, turn Sx up |
| GPS never fixes | Indoors, antenna blocked, TX/RX swapped | Go outside/window, module TX to D6, check baud 9600 |
| GPS garbage | Baud mismatch, SoftwareSerial conflict | Confirm 9600, read at 1 Hz, try hardware UART fallback |
| Buzzer clicks only | Passive buzzer driven with digitalWrite | Use `tone(16, 2700)` |
| Buzzer always on | D0 stuck HIGH or code bug | Check pinMode(16, OUTPUT) and the beep logic |
| Buzzer weak or silent | 5 V buzzer driven from a 3.3 V GPIO | Use the transistor driver and `VIN` |
| Board resets when buzzer sounds | Direct drive draws too much current | Use the transistor driver and `VIN` |
| RGB channel dead | Common wire misidentified, MOSFET backwards, supply off | Recheck Phase 3.2, MOSFET pinout, supply voltage |
| RGB flickers / board resets | Bulb inrush, shared weak supply, no common ground | Separate supply, 470-1000 uF cap, common GND |
| ESP-NOW no packets | Different channels, wrong MAC, role not set | Set channel 1, broadcast MAC first, COMBO role |
| Display freeze | SPI/display hang, packet handling blocking | Do not block in receive callback; refresh outside it |
| Random resets | Brown-out from buzzer/RGB, weak USB | Powered hub/1 A supply, add bulk capacitor |

---

## 15. Firmware file layout to create later

```
firmware/
  sensor_node/sensor_node.ino
  display_node/display_node.ino
  common/protocol.h
  tests/test_oled_spi/test_oled_spi.ino
  tests/test_oled/test_oled.ino
  tests/test_dht22/test_dht22.ino
  tests/test_ultrasonic/test_ultrasonic.ino
  tests/test_pir/test_pir.ino
  tests/test_gps/test_gps.ino
  tests/test_buzzer/test_buzzer.ino
  tests/test_rgb/test_rgb.ino
  tests/test_espnow_tx/test_espnow_tx.ino
  tests/test_espnow_rx/test_espnow_rx.ino
```

`common/protocol.h` holds the `SensorPacket` struct and the ESP-NOW channel
constant so both sketches cannot drift apart.

---

## 16. Test record sheet

Fill this in as you go. Do not skip Gate A, B, or C.

| Date | Gate / test | Result | Notes |
|---|---|---|---|
| | RGB common wire colour / voltage / anode-cathode | | |
| | GPS module voltage label | | |
| | Buzzer type (active/passive) and voltage | | |
| | Gate A: resistance checks | | |
| | Gate A: first power-up voltages | | |
| | Test 1: SPI OLED | | |
| | Test 2: OLED | | |
| | Test 3: DHT22 | | |
| | Test 4: HC-SR04 | | |
| | Test 5: PIR | | |
| | Test 6: GPS | | |
| | Test 7: Buzzer | | |
| | Test 8: RGB | | |
| | Test 9-10: ESP-NOW | | |
| | Gate D: 14-point integration matrix | | |

---

## 17. What to confirm before writing the real firmware

1. RGB bulb: common wire colour, rated voltage, common anode or cathode.
2. GPS module: 3.3 V only or 3.3-5 V input.
3. NodeMCU model and confirmed D-number to GPIO mapping.
4. Buzzer type and voltage.
5. Results of Gate A and Gate B.

Once those are known, flash the test sketches in Phase 7 order, then the
integrated firmware in Phase 9.
