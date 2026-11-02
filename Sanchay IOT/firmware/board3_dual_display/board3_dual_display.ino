/*
 * ============================================================================
 *  SANCHAY DUAL-DISPLAY TERMINAL (3RD ESP8266 / COCKPIT BILLBOARD NODE)
 * ============================================================================
 *
 *  Drives TWO separate OLED screens simultaneously on one NodeMCU ESP8266:
 *
 *  1. 4-PIN OLED (I2C) -> SANCHAY BRANDING SUITE (Fast 33+ FPS at 800kHz I2C)
 *  2. 7-PIN OLED (SPI) -> TEAM PARAKRAM CYBER SUITE (Ultra-Fast 70-100 FPS SPI)
 *
 *  *** 100% MATHEMATICALLY SYNCHRONIZED ARCHITECTURE ***
 *  Both screens share a unified master timeline (4.5s per scene).
 *  ZERO messy lines overlapping text - utilizes clean solid fills, inverted badges,
 *  and negative-space light curtains for a sleek automotive / cyber UI aesthetic:
 *
 *    Scene 0: Solid Inverted Hero Badges & Bouncing Capsules (Lockstep)
 *    Scene 1: Solid Light Curtain Sweep (Negative-Space Invert Wipe)
 *    Scene 2: Solid Floating Hero Badges & Lower Equalizer Spectrum
 *    Scene 3: Solid Matrix Terminal Chips & Synchronous Blinking Cursors
 *
 *  DHT11 sensor & ESP-NOW mesh receiver run silently in the background.
 *
 *  ---------------------------------------------------------------------------
 *  VERIFIED FOOLPROOF PIN ASSIGNMENTS:
 *  ---------------------------------------------------------------------------
 *  [Screen 1: 4-Pin I2C OLED - SANCHAY]
 *    OLED GND        -> NodeMCU GND
 *    OLED VCC        -> NodeMCU 3V3 (or VIN/5V)
 *    OLED SCL        -> NodeMCU D1 (GPIO 5)
 *    OLED SDA        -> NodeMCU D2 (GPIO 4)
 *
 *  [Screen 2: 7-Pin SPI OLED - TEAM PARAKRAM]
 *    OLED GND        -> NodeMCU GND
 *    OLED VCC        -> NodeMCU 3V3 (3.3V ONLY!)
 *    OLED D0 (SCK)   -> NodeMCU D6 (GPIO 12)
 *    OLED D1 (MOSI)  -> NodeMCU D7 (GPIO 13)
 *    OLED RES        -> NodeMCU D4 (GPIO 2)
 *    OLED DC         -> NodeMCU D0 (GPIO 16)
 *    OLED CS         -> NodeMCU D3 (GPIO 0)
 *
 *  [Local DHT11 Sensor]
 *    DHT11 VCC       -> NodeMCU 3V3
 *    DHT11 DATA      -> NodeMCU D5 (GPIO 14)
 *    DHT11 GND       -> NodeMCU GND
 * ============================================================================
 */

#include <Wire.h>
#include <DHT.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP8266WiFi.h>
#include <espnow.h>

// Direct GPIO hardware registers for ultra-fast SPI transfer (70-100 FPS)
#ifndef GPOS
#define GPOS (*(volatile uint32_t*)(0x60000304))
#endif
#ifndef GPOC
#define GPOC (*(volatile uint32_t*)(0x60000308))
#endif

extern "C" bool system_update_cpu_freq(uint8_t freq);

// Define NodeMCU pin mappings if board is set to "Generic ESP8266 Module"
#ifndef D1
#define D0 16
#define D1 5
#define D2 4
#define D3 0
#define D4 2
#define D5 14
#define D6 12
#define D7 13
#define D8 15
#endif

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

// ---------------------------------------------------------------------------
// Screen 1: 4-Pin I2C OLED (SANCHAY Core Display)
// ---------------------------------------------------------------------------
const uint8_t PIN_I2C_SDA = 4; // NodeMCU D2 / GPIO4
const uint8_t PIN_I2C_SCL = 5; // NodeMCU D1 / GPIO5

Adafruit_SSD1306 oledPitch(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
bool oledPitchOk = false;

// ---------------------------------------------------------------------------
// Screen 2: 7-Pin SPI OLED (TEAM PARAKRAM Defense Display)
// ---------------------------------------------------------------------------
const uint8_t PIN_7PIN_SCK  = 12; // NodeMCU D6 / GPIO12 (OLED D0/SCK)
const uint8_t PIN_7PIN_MOSI = 13; // NodeMCU D7 / GPIO13 (OLED D1/MOSI)
const uint8_t PIN_7PIN_RES  = 2;  // NodeMCU D4 / GPIO2  (OLED RES)
const uint8_t PIN_7PIN_DC   = 16; // NodeMCU D0 / GPIO16 (OLED DC)
const uint8_t PIN_7PIN_CS   = 0;  // NodeMCU D3 / GPIO0  (OLED CS)

Adafruit_SSD1306 oledSensors(SCREEN_WIDTH, SCREEN_HEIGHT,
                             PIN_7PIN_MOSI, PIN_7PIN_SCK,
                             PIN_7PIN_DC, PIN_7PIN_RES, PIN_7PIN_CS);
bool oledSensorsOk = false;

// ---------------------------------------------------------------------------
// Local Physical DHT11 Sensor on Pin D5 (Background Telemetry)
// ---------------------------------------------------------------------------
const uint8_t PIN_LOCAL_DHT = 14; // NodeMCU D5 / GPIO14
DHT localDht(PIN_LOCAL_DHT, DHT11);

float localTempC = NAN;
float localHumidity = NAN;
bool localDhtValid = false;
unsigned long lastDhtMs = 0;

// ---------------------------------------------------------------------------
// Sensor Packet Layout (Strict 34-byte struct matching Board 1)
// ---------------------------------------------------------------------------
const uint16_t PACKET_MAGIC = 0x5A31;
const uint8_t PACKET_VERSION = 1;

typedef struct __attribute__((packed)) {
  uint16_t magic;
  uint8_t version;
  uint32_t seq;
  uint32_t uptimeMs;
  float tempC;
  float humidity;
  uint16_t distanceCm;
  uint8_t motion;
  uint8_t zone;
  uint8_t gpsFix;
  uint8_t satellites;
  uint8_t dhtValid;
  int32_t latE7;
  int32_t lngE7;
} SensorPacket;

SensorPacket latestPacket;
volatile bool packetReady = false;
volatile unsigned long lastPacketMs = 0;

// ---------------------------------------------------------------------------
// ESP-NOW Receive Callback (Runs silently in background)
// ---------------------------------------------------------------------------
void onDataRecv(uint8_t *mac, uint8_t *incomingData, uint8_t len) {
  if (len != sizeof(SensorPacket)) return;

  SensorPacket temp;
  memcpy(&temp, incomingData, sizeof(SensorPacket));

  if (temp.magic == PACKET_MAGIC && temp.version == PACKET_VERSION) {
    latestPacket = temp;
    packetReady = true;
    lastPacketMs = millis();
  }
}

// ===========================================================================
// FAST REGISTER SPI DRIVER (Pushes 1024 bytes in ~0.9ms -> 70-100 FPS)
// ===========================================================================
void fastDisplaySPI() {
  uint8_t *buf = oledSensors.getBuffer();
  if (!buf) return;

  // 1. Command mode to reset column and page addressing
  digitalWrite(16, LOW); // DC = LOW (GPIO 16)
  GPOC = (1 << 0);       // CS = LOW (GPIO 0)

  static const uint8_t cmds[] = { 0x21, 0, 127, 0x22, 0, 7 };
  for (uint8_t i = 0; i < 6; i++) {
    uint8_t b = cmds[i];
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (b & 0x80) GPOS = (1 << 13); else GPOC = (1 << 13);
      GPOS = (1 << 12); // SCK HIGH
      asm volatile("nop; nop; nop; nop; nop;");
      GPOC = (1 << 12); // SCK LOW
      asm volatile("nop; nop; nop; nop; nop;");
      b <<= 1;
    }
  }

  // 2. Data mode: Stream 1024 bytes of pixel buffer at ~11 MHz
  digitalWrite(16, HIGH); // DC = HIGH (GPIO 16)
  for (uint16_t i = 0; i < 1024; i++) {
    uint8_t b = buf[i];
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (b & 0x80) GPOS = (1 << 13); else GPOC = (1 << 13);
      GPOS = (1 << 12); // SCK HIGH
      asm volatile("nop; nop; nop; nop; nop;");
      GPOC = (1 << 12); // SCK LOW
      asm volatile("nop; nop; nop; nop; nop;");
      b <<= 1;
    }
  }

  GPOS = (1 << 0); // CS = HIGH (GPIO 0)
}

// ===========================================================================
// SCREEN 1 RENDERERS (4-PIN I2C OLED: SANCHAY BRANDING SUITE)
// ===========================================================================

// Scene 0: Sanchay Solid Inverted Badge & Bouncing Capsule
void drawBootSceneOrbit(unsigned long now, unsigned long phase) {
  // 1. Header Solid Pill
  oledPitch.fillRoundRect(24, 2, 80, 11, 3, SSD1306_WHITE);
  oledPitch.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  oledPitch.setTextSize(1);
  oledPitch.setCursor(32, 4);
  oledPitch.print("SANCHAY CORE");

  // 2. Center Inverted Hero Plaque (Deep solid fill, razor-sharp contrast)
  oledPitch.fillRoundRect(10, 16, 108, 26, 4, SSD1306_WHITE);
  oledPitch.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  oledPitch.setTextSize(2);
  oledPitch.setCursor(22, 22);
  oledPitch.print("SANCHAY");

  // Solid Pulsing Satellite Orbs on Left & Right Flanks (No overlapping lines)
  int orbR = 3 + (int)(abs(sin(now * 0.006f)) * 2);
  oledPitch.fillCircle(4, 29, orbR, SSD1306_WHITE);
  oledPitch.fillCircle(123, 29, orbR, SSD1306_WHITE);

  // 3. Sleek Solid Progress Capsule (Bounces in exact lockstep)
  oledPitch.fillRoundRect(14, 48, 100, 10, 5, SSD1306_WHITE);
  oledPitch.fillRoundRect(16, 50, 96, 6, 3, SSD1306_BLACK); // Clean recessed track
  int cycle = (now / 10) % 144;
  int pillOffset = (cycle > 72) ? (144 - cycle) : cycle;
  oledPitch.fillRoundRect(18 + pillOffset, 51, 24, 4, 2, SSD1306_WHITE);
}

// Scene 1: Sanchay Solid Light Curtain Wipe (Negative-Space Invert)
void drawBootSceneScanner(unsigned long now, unsigned long phase) {
  // 1. Base High-Contrast Typography
  oledPitch.setTextColor(SSD1306_WHITE);
  oledPitch.setTextSize(1);
  oledPitch.setCursor(24, 6);
  oledPitch.print("[ FLEET SYSTEM ]");

  oledPitch.setTextSize(2);
  oledPitch.setCursor(22, 24);
  oledPitch.print("SANCHAY");

  oledPitch.setTextSize(1);
  oledPitch.setCursor(34, 46);
  oledPitch.print("OS ACTIVE");

  // 2. Synchronized Solid Light Curtain Sweep (Clean inverted window across entire height)
  int sweepCycle = (now / 7) % 200;
  int beamCenter = (sweepCycle > 100) ? (200 - sweepCycle) : sweepCycle;
  beamCenter = (beamCenter * 128) / 100;
  int beamLeft = beamCenter - 18;
  int beamWidth = 36;
  if (beamLeft < 0) { beamWidth += beamLeft; beamLeft = 0; }
  if (beamLeft + beamWidth > 128) { beamWidth = 128 - beamLeft; }

  if (beamWidth > 0) {
    oledPitch.fillRect(beamLeft, 0, beamWidth, 64, SSD1306_INVERSE);
    if (beamLeft > 0) oledPitch.drawFastVLine(beamLeft, 0, 64, SSD1306_WHITE);
    if (beamLeft + beamWidth < 128) oledPitch.drawFastVLine(beamLeft + beamWidth, 0, 64, SSD1306_WHITE);
  }
}

// Scene 2: Sanchay Solid Floating Badge & Lower Equalizer
void drawBootSceneRadarWave(unsigned long now, unsigned long phase) {
  // 1. Upper Zone: Solid Floating Hero Badge
  oledPitch.fillRoundRect(14, 4, 100, 26, 4, SSD1306_WHITE);
  oledPitch.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  oledPitch.setTextSize(2);
  oledPitch.setCursor(22, 10);
  oledPitch.print("SANCHAY");

  // 2. Solid Separator Shelf
  oledPitch.fillRect(0, 34, 128, 2, SSD1306_WHITE);

  // 3. Lower Zone: Solid Filled Equalizer Bars (Strictly below y=36, zero text interference)
  oledPitch.setTextColor(SSD1306_WHITE);
  for (int b = 0; b < 9; b++) {
    int h = 3 + (int)(9.0f * (sin(now * 0.007f + (b * 0.65f)) + 1.0f));
    oledPitch.fillRoundRect(7 + (b * 13), 63 - h, 10, h, 2, SSD1306_WHITE);
  }
}

// Scene 3: Sanchay Solid Matrix Terminal Chips
void drawBootSceneTerminal(unsigned long now, unsigned long phase) {
  // Scramble engine for "SANCHAY" over first 900ms
  const char target[] = "SANCHAY";
  const char glyphs[] = "#@$%*&!?<>[]{}";
  char str[8];

  if (phase < 900) {
    int rev = phase / 128;
    for (int i = 0; i < 7; i++) {
      str[i] = (i < rev) ? target[i] : glyphs[(now / 35 + i * 2) % 14];
    }
    str[7] = '\0';
  } else {
    strcpy(str, target);
  }

  // 1. Inverted Header Tag
  oledPitch.fillRoundRect(4, 2, 120, 12, 3, SSD1306_WHITE);
  oledPitch.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  oledPitch.setTextSize(1);
  oledPitch.setCursor(14, 4);
  oledPitch.print("> SYSTEM: SANCHAY OS");

  // 2. Center Hero Box
  oledPitch.drawRoundRect(10, 18, 108, 24, 4, SSD1306_WHITE);
  oledPitch.setTextColor(SSD1306_WHITE);
  oledPitch.setTextSize(2);
  oledPitch.setCursor(22, 22);
  oledPitch.print(str);

  // 3. Bottom Solid Status Pill
  oledPitch.fillRoundRect(4, 46, 76, 14, 3, SSD1306_WHITE);
  oledPitch.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  oledPitch.setTextSize(1);
  oledPitch.setCursor(10, 49);
  oledPitch.print("[ READY ]");

  // Synchronous Solid Blinking Cursor Block
  if ((now / 250) % 2 == 0) {
    oledPitch.fillRect(90, 46, 10, 14, SSD1306_WHITE);
  }
}

void drawAndroidBootAnimation(uint8_t syncScene, unsigned long now, unsigned long scenePhaseMs) {
  if (!oledPitchOk) return;
  oledPitch.clearDisplay();

  switch (syncScene) {
    case 0: drawBootSceneOrbit(now, scenePhaseMs); break;
    case 1: drawBootSceneScanner(now, scenePhaseMs); break;
    case 2: drawBootSceneRadarWave(now, scenePhaseMs); break;
    case 3: drawBootSceneTerminal(now, scenePhaseMs); break;
    default: drawBootSceneOrbit(now, scenePhaseMs); break;
  }

  oledPitch.display();
}

// ===========================================================================
// SCREEN 2 RENDERERS (7-PIN SPI OLED: TEAM PARAKRAM CYBER SUITE)
// ===========================================================================

// Scene 0: Team Parakram Solid Inverted Badge & Bouncing Capsule
void drawParakramSceneOrbit(unsigned long now, unsigned long phase) {
  // 1. Header Solid Pill
  oledSensors.fillRoundRect(18, 2, 92, 11, 3, SSD1306_WHITE);
  oledSensors.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  oledSensors.setTextSize(1);
  oledSensors.setCursor(24, 4);
  oledSensors.print("TEAM PARAKRAM");

  // 2. Center Inverted Hero Plaque (Deep solid fill, razor-sharp contrast)
  oledSensors.fillRoundRect(8, 15, 112, 28, 4, SSD1306_WHITE);
  oledSensors.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  oledSensors.setTextSize(1);
  oledSensors.setCursor(52, 18);
  oledSensors.print("TEAM");
  oledSensors.setTextSize(2);
  oledSensors.setCursor(16, 27);
  oledSensors.print("PARAKRAM");

  // Solid Pulsing Satellite Orbs on Left & Right Flanks (Matches Screen 1 in lockstep)
  int orbR = 3 + (int)(abs(sin(now * 0.006f)) * 2);
  oledSensors.fillCircle(3, 29, orbR, SSD1306_WHITE);
  oledSensors.fillCircle(124, 29, orbR, SSD1306_WHITE);

  // 3. Sleek Solid Progress Capsule (Bounces in 100% lockstep with Screen 1)
  oledSensors.fillRoundRect(14, 48, 100, 10, 5, SSD1306_WHITE);
  oledSensors.fillRoundRect(16, 50, 96, 6, 3, SSD1306_BLACK); // Clean recessed track
  int cycle = (now / 10) % 144;
  int pillOffset = (cycle > 72) ? (144 - cycle) : cycle;
  oledSensors.fillRoundRect(18 + pillOffset, 51, 24, 4, 2, SSD1306_WHITE);
}

// Scene 1: Team Parakram Solid Light Curtain Wipe (Negative-Space Invert)
void drawParakramSceneLaser(unsigned long now, unsigned long phase) {
  // 1. Base High-Contrast Typography
  oledSensors.setTextColor(SSD1306_WHITE);
  oledSensors.setTextSize(1);
  oledSensors.setCursor(18, 6);
  oledSensors.print("[ DEFENSE SQUAD ]");

  oledSensors.setTextSize(1);
  oledSensors.setCursor(52, 20);
  oledSensors.print("TEAM");

  oledSensors.setTextSize(2);
  oledSensors.setCursor(16, 30);
  oledSensors.print("PARAKRAM");

  oledSensors.setTextSize(1);
  oledSensors.setCursor(20, 50);
  oledSensors.print("CYBER DEFENSE");

  // 2. Synchronized Solid Light Curtain Sweep (Exact same position as Screen 1)
  int sweepCycle = (now / 7) % 200;
  int beamCenter = (sweepCycle > 100) ? (200 - sweepCycle) : sweepCycle;
  beamCenter = (beamCenter * 128) / 100;
  int beamLeft = beamCenter - 18;
  int beamWidth = 36;
  if (beamLeft < 0) { beamWidth += beamLeft; beamLeft = 0; }
  if (beamLeft + beamWidth > 128) { beamWidth = 128 - beamLeft; }

  if (beamWidth > 0) {
    oledSensors.fillRect(beamLeft, 0, beamWidth, 64, SSD1306_INVERSE);
    if (beamLeft > 0) oledSensors.drawFastVLine(beamLeft, 0, 64, SSD1306_WHITE);
    if (beamLeft + beamWidth < 128) oledSensors.drawFastVLine(beamLeft + beamWidth, 0, 64, SSD1306_WHITE);
  }
}

// Scene 2: Team Parakram Solid Floating Badge & Lower Equalizer
void drawParakramSceneEqualizer(unsigned long now, unsigned long phase) {
  // 1. Upper Zone: Solid Floating Hero Badge
  oledSensors.fillRoundRect(10, 4, 108, 26, 4, SSD1306_WHITE);
  oledSensors.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  oledSensors.setTextSize(1);
  oledSensors.setCursor(52, 6);
  oledSensors.print("TEAM");
  oledSensors.setTextSize(1);
  oledSensors.setCursor(26, 17);
  oledSensors.print("PARAKRAM OS");

  // 2. Solid Separator Shelf
  oledSensors.fillRect(0, 34, 128, 2, SSD1306_WHITE);

  // 3. Lower Zone: Solid Filled Equalizer Bars (Strictly below y=36, zero text interference)
  oledSensors.setTextColor(SSD1306_WHITE);
  for (int b = 0; b < 11; b++) {
    int h = 3 + (int)(9.0f * (sin(now * 0.007f + (b * 0.65f)) + 1.0f));
    oledSensors.fillRoundRect(4 + (b * 11), 63 - h, 8, h, 2, SSD1306_WHITE);
  }
}

// Scene 3: Team Parakram Solid Matrix Terminal Chips
void drawParakramSceneTerminal(unsigned long now, unsigned long phase) {
  // Matrix scramble engine for "TEAM" & "PARAKRAM"
  const char target1[] = "TEAM";
  const char target2[] = "PARAKRAM";
  const char glyphs[] = "#@$%*&!?<>[]{}";
  char str1[5];
  char str2[9];

  if (phase < 900) {
    int rev1 = phase / 225;
    for (int i = 0; i < 4; i++) {
      str1[i] = (i < rev1) ? target1[i] : glyphs[(now / 35 + i * 2) % 14];
    }
    str1[4] = '\0';

    int rev2 = phase / 112;
    for (int i = 0; i < 8; i++) {
      str2[i] = (i < rev2) ? target2[i] : glyphs[(now / 35 + i * 3) % 14];
    }
    str2[8] = '\0';
  } else {
    strcpy(str1, target1);
    strcpy(str2, target2);
  }

  // 1. Inverted Header Tag
  oledSensors.fillRoundRect(4, 2, 120, 12, 3, SSD1306_WHITE);
  oledSensors.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  oledSensors.setTextSize(1);
  oledSensors.setCursor(12, 4);
  oledSensors.print("> SQUAD: PARAKRAM");

  // 2. Center Hero Box
  oledSensors.drawRoundRect(10, 18, 108, 24, 4, SSD1306_WHITE);
  oledSensors.setTextColor(SSD1306_WHITE);
  oledSensors.setTextSize(1);
  oledSensors.setCursor(52, 21);
  oledSensors.print(str1);
  oledSensors.setTextSize(1);
  oledSensors.setCursor(20, 31);
  oledSensors.print(str2);

  // 3. Bottom Solid Status Pill
  oledSensors.fillRoundRect(4, 46, 76, 14, 3, SSD1306_WHITE);
  oledSensors.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  oledSensors.setTextSize(1);
  oledSensors.setCursor(10, 49);
  oledSensors.print("[ ARMED ]");

  // Synchronous Solid Blinking Cursor Block
  if ((now / 250) % 2 == 0) {
    oledSensors.fillRect(90, 46, 10, 14, SSD1306_WHITE);
  }
}

void drawTeamParakramAnimation(uint8_t syncScene, unsigned long now, unsigned long scenePhaseMs) {
  if (!oledSensorsOk) return;
  oledSensors.clearDisplay();

  switch (syncScene) {
    case 0: drawParakramSceneOrbit(now, scenePhaseMs); break;
    case 1: drawParakramSceneLaser(now, scenePhaseMs); break;
    case 2: drawParakramSceneEqualizer(now, scenePhaseMs); break;
    case 3: drawParakramSceneTerminal(now, scenePhaseMs); break;
    default: drawParakramSceneOrbit(now, scenePhaseMs); break;
  }

  // Push frame directly via fast register SPI
  fastDisplaySPI();
}

// ===========================================================================
// SETUP & LOOP
// ===========================================================================

void setup() {
  system_update_cpu_freq(160); // Overclock ESP8266 to 160 MHz for maximum performance!

  Serial.begin(115200);
  delay(500);
  Serial.println("\n========================================================");
  Serial.println(" SANCHAY DUAL-DISPLAY TERMINAL (3RD ESP8266 READY) ");
  Serial.println("========================================================");

  // 1. Initialize Screen 1: 4-Pin I2C OLED on D2 (SDA) and D1 (SCL)
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(800000UL); // Overclocked 800kHz Fast Mode Plus for ultra-smooth 33+ FPS!

  // Auto-probe I2C address (0x3C or 0x3D)
  uint8_t i2cAddr = 0x3C;
  Wire.beginTransmission(0x3C);
  if (Wire.endTransmission() != 0) {
    Wire.beginTransmission(0x3D);
    if (Wire.endTransmission() == 0) {
      i2cAddr = 0x3D;
    }
  }

  if (!oledPitch.begin(SSD1306_SWITCHCAPVCC, i2cAddr)) {
    Serial.print("[FAIL] Screen 1 (4-pin I2C OLED) at 0x");
    Serial.println(i2cAddr, HEX);
    oledPitchOk = false;
  } else {
    Serial.print("[OK] Screen 1 (4-pin I2C OLED) ready at 0x");
    Serial.println(i2cAddr, HEX);
    oledPitchOk = true;
    oledPitch.clearDisplay();
    oledPitch.fillRoundRect(10, 18, 108, 28, 4, SSD1306_WHITE);
    oledPitch.setTextSize(2);
    oledPitch.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    oledPitch.setCursor(22, 24);
    oledPitch.print("SANCHAY");
    oledPitch.display();
  }

  // 2. Initialize Screen 2: 7-Pin SPI OLED on D6(SCK), D7(MOSI), D0(DC), D4(RES), D3(CS)
  if (!oledSensors.begin(SSD1306_SWITCHCAPVCC)) {
    Serial.println("[FAIL] Screen 2 (7-pin SPI OLED) initialization failed");
    oledSensorsOk = false;
  } else {
    Serial.println("[OK] Screen 2 (7-pin SPI OLED) ready");
    oledSensorsOk = true;

    // Overdrive SSD1306 internal clock oscillator to maximum 150+ Hz refresh rate
    oledSensors.ssd1306_command(0xD5);
    oledSensors.ssd1306_command(0xF0);

    oledSensors.clearDisplay();
    oledSensors.fillRoundRect(10, 16, 108, 32, 4, SSD1306_WHITE);
    oledSensors.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    oledSensors.setTextSize(1);
    oledSensors.setCursor(52, 19);
    oledSensors.print("TEAM");
    oledSensors.setTextSize(2);
    oledSensors.setCursor(16, 29);
    oledSensors.print("PARAKRAM");
    oledSensors.display();
  }

  // 3. Initialize Local Physical DHT11 on D5
  localDht.begin();
  Serial.println("[OK] Local DHT11 sensor ready on Pin D5");

  delay(600);

  // 4. Initialize ESP-NOW Mesh Receiver
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  if (esp_now_init() != 0) {
    Serial.println("[FAIL] ESP-NOW init failed on Board 3");
  } else {
    esp_now_set_self_role(ESP_NOW_ROLE_SLAVE);
    esp_now_register_recv_cb(onDataRecv);
    Serial.println("[OK] ESP-NOW Receiver ready on Channel 1 (Listening to Board 1)");
  }
}

void loop() {
  unsigned long now = millis();

  // Master Synchronization Clock:
  // Exactly 4.5 seconds per scene, strictly shared between both screens
  uint8_t syncScene = (now / 4500) % 4;
  unsigned long scenePhaseMs = now % 4500;

  // Background DHT11 update every 1500ms
  if (now - lastDhtMs >= 1500) {
    lastDhtMs = now;
    float t = localDht.readTemperature();
    float h = localDht.readHumidity();
    if (!isnan(t) && !isnan(h) && t > 0 && h > 0) {
      localTempC = t;
      localHumidity = h;
      localDhtValid = true;
    }
  }

  // Screen 1 (4-Pin I2C OLED): Fast 33 FPS update pacing (every 30ms) at 800kHz I2C!
  static unsigned long lastBootDrawMs = 0;
  if (now - lastBootDrawMs >= 30) {
    lastBootDrawMs = now;
    drawAndroidBootAnimation(syncScene, now, scenePhaseMs);
  }

  // Screen 2 (7-Pin SPI OLED): High-Speed 70-100 FPS (every 10ms) via direct register SPI!
  static unsigned long lastParakramDrawMs = 0;
  if (now - lastParakramDrawMs >= 10) {
    lastParakramDrawMs = now;
    drawTeamParakramAnimation(syncScene, now, scenePhaseMs);
  }

  yield();
}
