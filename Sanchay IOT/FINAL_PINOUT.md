# Sanchay IoT - FROZEN Pin Layout

Version: **1.0**
Boards: **2 x NodeMCU 1.0 (ESP-12E Module)**
Core: **ESP8266 Arduino core 3.1.2**
Communication: **ESP-NOW, channel 1, broadcast**
Firmware: `firmware/board1_main` and `firmware/board2_main`

> This file is the single source of truth. Do not change a pin in one sketch
> without updating this file and the other sketch.

---

## Board 1 - Sensor Node

| Function | Module pin | NodeMCU | GPIO | Notes |
|---|---|---|---|---|
| DHT22 power | VCC | 3V3 | - | 3.3 V only |
| DHT22 data | DATA | D4 | GPIO2 | 10k pull-up to 3V3 required |
| DHT22 ground | GND | GND | - | |
| HC-SR04 power | VCC | VIN | - | 5 V |
| HC-SR04 trigger | TRIG | D3 | GPIO0 | 10k pull-up to 3V3 required for boot |
| HC-SR04 echo | ECHO | D2 | GPIO4 | 1k series + 2k to GND divider; never 5 V direct |
| HC-SR04 ground | GND | GND | - | |
| PIR power | VCC | VIN | - | 5 V preferred |
| PIR output | OUT | D0 | GPIO16 | Input only; no PWM |
| PIR ground | GND | GND | - | |
| GPS power | VCC | VIN | - | Use 3V3 only if module is 3.3 V-only |
| GPS TX | TX | D6 | GPIO12 | ESP software-serial RX |
| GPS RX | RX | D7 | GPIO13 | ESP software-serial TX |
| GPS ground | GND | GND | - | |
| RGB red | gate | D1 | GPIO5 | 100R to MOSFET gate, 10k gate pulldown |
| RGB green | gate | D5 | GPIO14 | 100R to MOSFET gate, 10k gate pulldown |
| RGB blue | gate | D8 | GPIO15 | 100R to MOSFET gate, 10k gate pulldown |
| RGB common | anode | +5V | - | Common anode assumed; MOSFET low-side |

Frozen constants:

```cpp
PIN_DHT   = 2   // D4
PIN_TRIG  = 0   // D3
PIN_ECHO  = 4   // D2
PIN_PIR   = 16  // D0
PIN_GPS_RX = 12 // D6
PIN_GPS_TX = 13 // D7
PIN_RGB_R = 5   // D1
PIN_RGB_G = 14  // D5
PIN_RGB_B = 15  // D8
```

---

## Board 2 - Display / Alert Node

| Function | Module pin | NodeMCU | GPIO | Notes |
|---|---|---|---|---|
| OLED ground | GND | GND | - | |
| OLED power | VCC | 3V3 | - | 3.3 V only |
| OLED clock | D0 / SCK | D1 | GPIO5 | OLED D0 is clock, not NodeMCU D0 |
| OLED data | D1 / MOSI | D2 | GPIO4 | OLED D1 is data, not NodeMCU D1 |
| OLED chip select | CS | D3 | GPIO0 | 10k pull-up to 3V3 for boot |
| OLED reset | RES | D4 | GPIO2 | 10k pull-up to 3V3 for boot |
| OLED data/command | DC | D8 | GPIO15 | Must be LOW at boot |
| Buzzer positive | + | D0 | GPIO16 | 3.3 V active buzzer, <=10 mA only |
| Buzzer negative | - | GND | - | Use a transistor for a louder 5 V buzzer |
| RGB red | gate | D5 | GPIO14 | 100R to MOSFET gate, 10k gate pulldown |
| RGB green | gate | D6 | GPIO12 | 100R to MOSFET gate, 10k gate pulldown |
| RGB blue | gate | D7 | GPIO13 | 100R to MOSFET gate, 10k gate pulldown |
| RGB common | anode | +5V | - | Common anode assumed; MOSFET low-side |

Frozen constants:

```cpp
PIN_OLED_SCK  = 5   // D1
PIN_OLED_MOSI = 4   // D2
PIN_OLED_CS   = 0   // D3
PIN_OLED_RES  = 2   // D4
PIN_OLED_DC   = 15  // D8
PIN_BUZZER    = 16  // D0
PIN_RGB_R     = 14  // D5
PIN_RGB_G     = 12  // D6
PIN_RGB_B     = 13  // D7
```

---

## Shared Rules

1. The two boards are **not wired together**. Each has its own USB power.
2. Never connect the two boards' 5V or 3V3 rails together.
3. Each board's RGB MOSFET sources and external supply share that board's GND.
4. ESP8266 boot pins:
   - D3 / GPIO0 must be HIGH at boot.
   - D8 / GPIO15 must be LOW at boot.
   - D4 / GPIO2 must be HIGH at boot.
5. ESP-NOW:
   - Both boards use `WIFI_STA`, sleep disabled, channel **1**.
   - Board 1 broadcasts to `FF:FF:FF:FF:FF:FF` every **200 ms (5 Hz)**.
   - Board 2 marks the link lost after **2000 ms** without a packet.
6. Alert thresholds (frozen):

| Distance | Zone | RGB | Buzzer |
|---|---|---|---|
| > 120 cm | SAFE | Green | Silent |
| 60-120 cm | WATCH | Yellow | 1 Hz |
| 30-60 cm | WARN | Orange | ~3 Hz |
| 10-30 cm | CLOSE | Red-orange | Fast |
| 0-10 cm | CRITICAL | Red | Continuous |
| > 400 cm | NO TARGET | Off | Silent |

`0 cm` means no echo or an object touching the sensor and is CRITICAL red.
`999` is the packet value for "no target / above 400 cm".
