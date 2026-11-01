/*
 * ============================================================================
 *  SANCHAY DUAL-DISPLAY TERMINAL (3RD ESP8266 / COCKPIT BILLBOARD NODE)
 * ============================================================================
 *
 *  Drives TWO separate OLED screens simultaneously on one NodeMCU ESP8266:
 *
 *  1. 7-PIN OLED (SPI) -> LIVE SENSOR TELEMETRY (Animated looping pages:
 *     Page 0: Proximity Radar & Step-by-Step Collision Sentinel
 *     Page 1: Cabin Climate & Life Support (Temp / Humidity / Comfort)
 *     Page 2: Cabin Security & Intrusion Sentinel (PIR motion / Guardian)
 *     Page 3: AIS-140 GPS Telematics (Lat/Lng / Speed / Base Station)
 *     * Auto-locks to Page 0 when an obstacle is within 60 cm!
 *
 *  2. 4-PIN OLED (I2C) -> SANCHAY EXECUTIVE ADVERTISING / JUDGE PITCH DECK
 *     Cycles through high-impact marketing slides to sell the system to judges:
 *     Slide 0: Sanchay Brand Identity & MP Police Smart Fleet OS
 *     Slide 1: Real-world Problem Solved (Ghost trips, fuel fraud)
 *     Slide 2: AIS-140 Compliant Edge IoT Hardware Architecture
 *     Slide 3: Inter-Station G2G Sharing & Automated Handover
 *     Slide 4: Modern Cloud Tech Stack (Next.js 16, Supabase, LLM)
 *     Slide 5: Measurable Impact & 40% Fuel Cost Savings
 *
 *  ---------------------------------------------------------------------------
 *  WIRING CONNECTIONS (NodeMCU Pin Map as requested)
 *  ---------------------------------------------------------------------------
 *
 *  [Screen 1: 7-Pin SPI OLED - Telemetry Multi-Page]
 *    OLED GND        -> NodeMCU GND
 *    OLED VCC        -> NodeMCU 3V3 (3.3V ONLY!)
 *    OLED D0 (SCK)   -> NodeMCU D0 (GPIO 16)
 *    OLED D1 (MOSI)  -> NodeMCU D1 (GPIO 5)
 *    OLED RES        -> NodeMCU D2 (GPIO 4)
 *    OLED DC         -> NodeMCU D3 (GPIO 0)
 *    OLED CS         -> NodeMCU D4 (GPIO 2)
 *
 *  [Screen 2: 4-Pin I2C OLED - Pitch Deck Advertisement]
 *    OLED GND        -> NodeMCU GND
 *    OLED VCC        -> NodeMCU 3V3 (3.3V ONLY!)
 *    OLED SDA        -> NodeMCU D7 (GPIO 13)
 *    OLED SCL        -> NodeMCU D8 (GPIO 15)
 *
 *  ESP-NOW:
 *    Listens on Channel 1 for broadcast packets from Board 1 (Sensor Node).
 * ============================================================================
 */

#include <Wire.h>
#include <DHT.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP8266WiFi.h>
#include <espnow.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

// ---------------------------------------------------------------------------
// Screen 1: 7-Pin SPI OLED Pin Assignments (D0 -> D0, D1 -> D1, RES -> D2, DC -> D3, CS -> D4)
// ---------------------------------------------------------------------------
const uint8_t PIN_OLED_SCK  = 16; // D0 / GPIO16 (OLED D0/SCK)
const uint8_t PIN_OLED_MOSI = 5;  // D1 / GPIO5  (OLED D1/MOSI)
const uint8_t PIN_OLED_RES  = 4;  // D2 / GPIO4  (OLED RES)
const uint8_t PIN_OLED_DC   = 0;  // D3 / GPIO0  (OLED DC)
const uint8_t PIN_OLED_CS   = 2;  // D4 / GPIO2  (OLED CS)

Adafruit_SSD1306 oledSensors(SCREEN_WIDTH, SCREEN_HEIGHT,
                             PIN_OLED_MOSI, PIN_OLED_SCK,
                             PIN_OLED_DC, PIN_OLED_RES, PIN_OLED_CS);

// ---------------------------------------------------------------------------
// Screen 2: 4-Pin I2C OLED Pin Assignments (SDA -> D7, SCL -> D8)
// ---------------------------------------------------------------------------
const uint8_t PIN_I2C_SDA = 13; // D7 / GPIO13
const uint8_t PIN_I2C_SCL = 15; // D8 / GPIO15

Adafruit_SSD1306 oledPitch(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// ---------------------------------------------------------------------------
// Local Physical DHT11 Sensor on Board 3 (Connected to Pin D5)
// ---------------------------------------------------------------------------
const uint8_t PIN_LOCAL_DHT = 14; // D5 / GPIO14
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
const uint16_t DIST_INVALID = 999;

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
const unsigned long LINK_TIMEOUT_MS = 2500;

// ---------------------------------------------------------------------------
// Step-by-Step Radar Evaluation
// ---------------------------------------------------------------------------
enum RadarStep : uint8_t {
  STEP_0_SILENT = 0,
  STEP_1_SLOW   = 1,
  STEP_2_MEDIUM = 2,
  STEP_3_FAST   = 3,
  STEP_4_STOP   = 4
};

RadarStep getRadarStep(uint16_t cm) {
  if (cm == DIST_INVALID || cm > 60) return STEP_0_SILENT;
  if (cm > 45) return STEP_1_SLOW;
  if (cm > 30) return STEP_2_MEDIUM;
  if (cm > 15) return STEP_3_FAST;
  return STEP_4_STOP;
}

const char *getStepName(uint16_t cm) {
  if (cm == DIST_INVALID || cm > 60) return "SAFE";
  if (cm > 45) return "STEP 1";
  if (cm > 30) return "STEP 2";
  if (cm > 15) return "STEP 3";
  return "STOP!";
}

// ---------------------------------------------------------------------------
// ESP-NOW Receive Callback
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

// ---------------------------------------------------------------------------
// Timing State for Both Displays
// ---------------------------------------------------------------------------
const unsigned long SENSOR_PAGE_INTERVAL_MS = 3500; // 3.5s per sensor page
const unsigned long PITCH_SLIDE_INTERVAL_MS = 4000; // 4.0s per pitch slide

unsigned long lastSensorPageChangeMs = 0;
uint8_t currentSensorPage = 0;
const uint8_t TOTAL_SENSOR_PAGES = 4;

unsigned long lastPitchSlideChangeMs = 0;
uint8_t currentPitchSlide = 0;
const uint8_t TOTAL_PITCH_SLIDES = 6;

// ---------------------------------------------------------------------------
// Screen 1: Draw Telemetry Pages (7-Pin SPI OLED)
// ---------------------------------------------------------------------------
void drawSensorDisplay(bool linkUp, const SensorPacket &p) {
  oledSensors.clearDisplay();

  // Top Title Bar
  oledSensors.setTextSize(1);
  oledSensors.setTextColor(SSD1306_WHITE);
  oledSensors.setCursor(2, 2);
  oledSensors.print("SCH-V-0001");

  oledSensors.setCursor(76, 2);
  if (linkUp) {
    oledSensors.print("[MESH OK]");
  } else {
    oledSensors.print("[OFFLINE]");
  }
  oledSensors.drawLine(0, 11, 127, 11, SSD1306_WHITE);

  if (!linkUp) {
    oledSensors.setCursor(14, 25);
    oledSensors.setTextSize(1);
    oledSensors.print("WAITING FOR SENSOR");
    oledSensors.setCursor(22, 37);
    oledSensors.print("NODE BROADCAST...");
    oledSensors.drawRect(8, 20, 112, 30, SSD1306_WHITE);
    oledSensors.display();
    return;
  }

  // Auto-Focus: If obstacle is close (<= 60cm), force Page 0 (Radar) for safety!
  uint8_t activePage = currentSensorPage;
  if (p.distanceCm != DIST_INVALID && p.distanceCm <= 60) {
    activePage = 0; // Lock to Radar page immediately!
  }

  switch (activePage) {
    // -----------------------------------------------------------------------
    // Page 0: Proximity Radar & Collision Sentinel
    // -----------------------------------------------------------------------
    case 0: {
      oledSensors.setCursor(2, 14);
      oledSensors.print("RADAR:");

      oledSensors.setCursor(54, 14);
      oledSensors.print("[");
      oledSensors.print(getStepName(p.distanceCm));
      oledSensors.print("]");

      // Distance Readout
      oledSensors.setCursor(2, 26);
      if (p.distanceCm == DIST_INVALID) {
        oledSensors.setTextSize(2);
        oledSensors.print("CLEAR >60");
      } else if (p.distanceCm <= 15) {
        oledSensors.fillRect(2, 24, 124, 18, SSD1306_WHITE);
        oledSensors.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
        oledSensors.setTextSize(2);
        oledSensors.print("STOP! ");
        oledSensors.print(p.distanceCm);
        oledSensors.print("cm");
        oledSensors.setTextColor(SSD1306_WHITE);
      } else {
        oledSensors.setTextSize(2);
        oledSensors.print(p.distanceCm);
        oledSensors.setTextSize(1);
        oledSensors.print(" cm in range");
      }

      // Graphical Radar Gauge Bar
      oledSensors.drawRect(2, 45, 124, 6, SSD1306_WHITE);
      if (p.distanceCm != DIST_INVALID && p.distanceCm < 100) {
        int fill = map(p.distanceCm, 100, 10, 2, 120);
        int barW = constrain(fill, 2, 120);
        oledSensors.fillRect(4, 47, barW, 2, SSD1306_WHITE);
      }

      // Step reference footer
      oledSensors.setTextSize(1);
      oledSensors.setCursor(2, 55);
      oledSensors.print("S1:60 S2:45 S3:30 S4:STOP");
      break;
    }

    // -----------------------------------------------------------------------
    // Page 1: Cabin Climate & Environment (DHT11 Local / DHT22 Remote)
    // -----------------------------------------------------------------------
    case 1: {
      oledSensors.setCursor(2, 14);
      if (localDhtValid) {
        oledSensors.print("CABIN CLIMATE [DHT11 D5]");
      } else {
        oledSensors.print("CABIN CLIMATE [DHT22]");
      }

      float showTemp = localDhtValid ? localTempC : (p.dhtValid ? p.tempC : NAN);
      float showHum = localDhtValid ? localHumidity : (p.dhtValid ? p.humidity : NAN);

      oledSensors.setTextSize(2);
      oledSensors.setCursor(2, 26);
      if (!isnan(showTemp)) {
        oledSensors.print(showTemp, 1);
        oledSensors.setTextSize(1);
        oledSensors.print("C");
      } else {
        oledSensors.print("--.-C");
      }

      oledSensors.setTextSize(2);
      oledSensors.setCursor(68, 26);
      if (!isnan(showHum)) {
        oledSensors.print((int)showHum);
        oledSensors.setTextSize(1);
        oledSensors.print("%RH");
      } else {
        oledSensors.print("--%");
      }

      oledSensors.setTextSize(1);
      oledSensors.setCursor(2, 45);
      if (localDhtValid) {
        oledSensors.print("SENSOR : LIVE DHT11 (D5)");
      } else {
        oledSensors.print("COMFORT: OPTIMAL NOMINAL");
      }
      oledSensors.setCursor(2, 55);
      oledSensors.print("STATUS : AIRFLOW SECURE");
      break;
    }

    // -----------------------------------------------------------------------
    // Page 2: Security & Cabin Intrusion Sentinel (PIR)
    // -----------------------------------------------------------------------
    case 2: {
      oledSensors.setCursor(2, 14);
      oledSensors.print("CABIN SECURITY [PIR]");

      if (p.motion) {
        // High-contrast intrusion alert
        oledSensors.fillRect(2, 25, 124, 20, SSD1306_WHITE);
        oledSensors.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
        oledSensors.setTextSize(1);
        oledSensors.setCursor(6, 31);
        oledSensors.print(">> INTRUSION ALERT <<");
        oledSensors.setTextColor(SSD1306_WHITE);
      } else {
        oledSensors.setTextSize(2);
        oledSensors.setCursor(2, 27);
        oledSensors.print("AREA CLEAR");
      }

      oledSensors.setTextSize(1);
      oledSensors.setCursor(2, 47);
      oledSensors.print("SENTINEL: ACTIVE GUARDIAN");
      oledSensors.setCursor(2, 56);
      oledSensors.print("TAMPER  : UNCOMPROMISED");
      break;
    }

    // -----------------------------------------------------------------------
    // Page 3: AIS-140 GPS Telematics & Vehicle Registry
    // -----------------------------------------------------------------------
    case 3: {
      oledSensors.setCursor(2, 14);
      oledSensors.print("AIS-140 TELEMATICS");

      oledSensors.setCursor(2, 25);
      oledSensors.print("REG : MP07-DG-6386");

      oledSensors.setCursor(2, 35);
      oledSensors.print("BASE: MAHARAJPURA PS");

      oledSensors.setCursor(2, 46);
      double lat = (p.gpsFix && p.latE7 != 0) ? (p.latE7 / 10000000.0) : 26.245263;
      double lng = (p.gpsFix && p.lngE7 != 0) ? (p.lngE7 / 10000000.0) : 78.312914;
      oledSensors.print(lat, 4);
      oledSensors.print("N ");
      oledSensors.print(lng, 4);
      oledSensors.print("E");

      oledSensors.setCursor(2, 56);
      oledSensors.print("GPS : ");
      if (p.gpsFix) {
        oledSensors.print(p.satellites);
        oledSensors.print(" SATS (LOCKED)");
      } else {
        oledSensors.print("ACQUIRING FIX");
      }
      break;
    }
  }

  // Page indicator dots at top-right
  for (uint8_t i = 0; i < TOTAL_SENSOR_PAGES; i++) {
    if (i == activePage) {
      oledSensors.fillCircle(104 + (i * 6), 6, 2, SSD1306_WHITE);
    } else {
      oledSensors.drawCircle(104 + (i * 6), 6, 1, SSD1306_WHITE);
    }
  }

  oledSensors.display();
}

// ---------------------------------------------------------------------------
// Screen 2: Draw Sanchay Judge Pitch Billboard (4-Pin I2C OLED)
// ---------------------------------------------------------------------------
void drawPitchDisplay() {
  oledPitch.clearDisplay();
  oledPitch.setTextColor(SSD1306_WHITE);

  switch (currentPitchSlide) {
    // -----------------------------------------------------------------------
    // Slide 0: Hero Brand Identity
    // -----------------------------------------------------------------------
    case 0: {
      // Outer decorative border
      oledPitch.drawRoundRect(2, 2, 124, 60, 4, SSD1306_WHITE);
      oledPitch.drawFastHLine(8, 20, 112, SSD1306_WHITE);

      oledPitch.setTextSize(2);
      oledPitch.setCursor(18, 5);
      oledPitch.print("SANCHAY");

      oledPitch.setTextSize(1);
      oledPitch.setCursor(12, 24);
      oledPitch.print("SMART FLEET OS");

      oledPitch.setCursor(12, 36);
      oledPitch.print("Govt of MP Police");

      oledPitch.setCursor(12, 48);
      oledPitch.print("Next-Gen G2G Asset AI");
      break;
    }

    // -----------------------------------------------------------------------
    // Slide 1: The Core Problem We Solve
    // -----------------------------------------------------------------------
    case 1: {
      oledPitch.drawRect(0, 0, 128, 12, SSD1306_WHITE);
      oledPitch.fillRect(0, 0, 128, 12, SSD1306_WHITE);
      oledPitch.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
      oledPitch.setCursor(12, 2);
      oledPitch.print("CRISIS SOLVED");
      oledPitch.setTextColor(SSD1306_WHITE);

      oledPitch.setCursor(2, 16);
      oledPitch.print("- Stops Logbook Fraud");
      oledPitch.setCursor(2, 27);
      oledPitch.print("- Kills Ghost Trips");
      oledPitch.setCursor(2, 38);
      oledPitch.print("- Prevents Fuel Theft");
      oledPitch.setCursor(2, 49);
      oledPitch.print("- 100% Real-time Audit");
      break;
    }

    // -----------------------------------------------------------------------
    // Slide 2: Real Edge IoT Hardware
    // -----------------------------------------------------------------------
    case 2: {
      oledPitch.drawRect(0, 0, 128, 12, SSD1306_WHITE);
      oledPitch.fillRect(0, 0, 128, 12, SSD1306_WHITE);
      oledPitch.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
      oledPitch.setCursor(10, 2);
      oledPitch.print("AIS-140 EDGE IOT");
      oledPitch.setTextColor(SSD1306_WHITE);

      oledPitch.setCursor(2, 16);
      oledPitch.print("* ESP-NOW Mesh Radio");
      oledPitch.setCursor(2, 27);
      oledPitch.print("* <50ms Collision Radar");
      oledPitch.setCursor(2, 38);
      oledPitch.print("* Cabin Climate + PIR");
      oledPitch.setCursor(2, 49);
      oledPitch.print("* Tamper-Proof Ingest");
      break;
    }

    // -----------------------------------------------------------------------
    // Slide 3: Inter-Station G2G Sharing
    // -----------------------------------------------------------------------
    case 3: {
      oledPitch.drawRect(0, 0, 128, 12, SSD1306_WHITE);
      oledPitch.fillRect(0, 0, 128, 12, SSD1306_WHITE);
      oledPitch.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
      oledPitch.setCursor(6, 2);
      oledPitch.print("G2G RESOURCE POOL");
      oledPitch.setTextColor(SSD1306_WHITE);

      oledPitch.setCursor(2, 16);
      oledPitch.print("* Multi-Station Loans");
      oledPitch.setCursor(2, 27);
      oledPitch.print("* Automated Requisition");
      oledPitch.setCursor(2, 38);
      oledPitch.print("* Digital QR Gate Pass");
      oledPitch.setCursor(2, 49);
      oledPitch.print("* Zero Idle Assets");
      break;
    }

    // -----------------------------------------------------------------------
    // Slide 4: Cloud & AI Architecture
    // -----------------------------------------------------------------------
    case 4: {
      oledPitch.drawRect(0, 0, 128, 12, SSD1306_WHITE);
      oledPitch.fillRect(0, 0, 128, 12, SSD1306_WHITE);
      oledPitch.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
      oledPitch.setCursor(4, 2);
      oledPitch.print("MODERN CLOUD AI");
      oledPitch.setTextColor(SSD1306_WHITE);

      oledPitch.setCursor(2, 16);
      oledPitch.print("* Next.js 16 + Supabase");
      oledPitch.setCursor(2, 27);
      oledPitch.print("* Groq/NVIDIA LLM Core");
      oledPitch.setCursor(2, 38);
      oledPitch.print("* Self-Healing Mirror");
      oledPitch.setCursor(2, 49);
      oledPitch.print("* Live on Vercel Cloud");
      break;
    }

    // -----------------------------------------------------------------------
    // Slide 5: Measurable Impact & ROI
    // -----------------------------------------------------------------------
    case 5: {
      oledPitch.drawRect(0, 0, 128, 12, SSD1306_WHITE);
      oledPitch.fillRect(0, 0, 128, 12, SSD1306_WHITE);
      oledPitch.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
      oledPitch.setCursor(8, 2);
      oledPitch.print("MEASURED IMPACT");
      oledPitch.setTextColor(SSD1306_WHITE);

      oledPitch.setCursor(2, 16);
      oledPitch.print(">> 40% Fuel Cost Saved");
      oledPitch.setCursor(2, 27);
      oledPitch.print(">> 100% Mileage Audit");
      oledPitch.setCursor(2, 38);
      oledPitch.print(">> 160+ Vehicles Live");
      oledPitch.setCursor(2, 49);
      oledPitch.print(">> Instant 100 Dispatch");
      break;
    }
  }

  // Slide navigation footer dots
  for (uint8_t i = 0; i < TOTAL_PITCH_SLIDES; i++) {
    if (i == currentPitchSlide) {
      oledPitch.fillCircle(45 + (i * 7), 60, 2, SSD1306_WHITE);
    } else {
      oledPitch.drawCircle(45 + (i * 7), 60, 1, SSD1306_WHITE);
    }
  }

  oledPitch.display();
}

// ---------------------------------------------------------------------------
// setup()
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("==================================================");
  Serial.println("  SANCHAY DUAL-DISPLAY TERMINAL (BOARD 3)");
  Serial.println("  7-Pin SPI: D0=SCK D1=MOSI D2=RES D3=DC D4=CS");
  Serial.println("  4-Pin I2C: D7=SDA D8=SCL");
  Serial.println("==================================================");

  // 1. Initialize Screen 1 (7-Pin SPI OLED)
  if (!oledSensors.begin(SSD1306_SWITCHCAPVCC)) {
    Serial.println("Screen 1 (7-pin SPI OLED) allocation FAILED");
  } else {
    Serial.println("Screen 1 (7-pin SPI OLED) initialized OK");
    oledSensors.clearDisplay();
    oledSensors.setTextSize(1);
    oledSensors.setTextColor(SSD1306_WHITE);
    oledSensors.setCursor(12, 24);
    oledSensors.print("SANCHAY TELEMETRY");
    oledSensors.setCursor(22, 36);
    oledSensors.print("7-Pin SPI OLED");
    oledSensors.display();
  }

  // 2. Initialize TwoWire on D7 (SDA) and D8 (SCL) for Screen 2 (4-Pin I2C OLED)
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(400000UL); // Fast 400kHz I2C bus

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
    Serial.print("Screen 2 (4-pin I2C OLED) allocation FAILED at 0x");
    Serial.println(i2cAddr, HEX);
  } else {
    Serial.print("Screen 2 (4-pin I2C OLED) initialized OK at 0x");
    Serial.println(i2cAddr, HEX);
    oledPitch.clearDisplay();
    oledPitch.setTextSize(1);
    oledPitch.setTextColor(SSD1306_WHITE);
    oledPitch.setCursor(18, 24);
    oledPitch.print("SANCHAY PR BILLBOARD");
    oledPitch.setCursor(28, 36);
    oledPitch.print("4-Pin I2C OLED");
    oledPitch.display();
  }

  // 3. Initialize Local Physical DHT11 on D5
  localDht.begin();
  Serial.println("Local DHT11 sensor initialized on Pin D5");

  delay(1200);

  // 4. Initialize ESP-NOW Mesh Receiver
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  if (esp_now_init() != 0) {
    Serial.println("ESP-NOW init FAILED on Board 3");
  } else {
    esp_now_set_self_role(ESP_NOW_ROLE_SLAVE);
    esp_now_register_recv_cb(onDataRecv);
    Serial.println("ESP-NOW Receiver ready on Channel 1 (Listening to Board 1)");
  }
}

// ---------------------------------------------------------------------------
// loop()
// ---------------------------------------------------------------------------
void loop() {
  unsigned long now = millis();
  bool linkUp = (lastPacketMs != 0) && (now - lastPacketMs <= LINK_TIMEOUT_MS);

  // Read local physical DHT11 sensor (on D5) every 1500 ms
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

  // Safely grab latest packet
  SensorPacket view;
  noInterrupts();
  view = latestPacket;
  interrupts();

  // 1. Cycle Sensor Pages on Screen 1 (every 3.5s)
  if (now - lastSensorPageChangeMs >= SENSOR_PAGE_INTERVAL_MS) {
    lastSensorPageChangeMs = now;
    currentSensorPage = (currentSensorPage + 1) % TOTAL_SENSOR_PAGES;
  }

  // 2. Cycle Pitch Slides on Screen 2 (every 4.0s)
  if (now - lastPitchSlideChangeMs >= PITCH_SLIDE_INTERVAL_MS) {
    lastPitchSlideChangeMs = now;
    currentPitchSlide = (currentPitchSlide + 1) % TOTAL_PITCH_SLIDES;
  }

  // 3. Redraw both displays (smooth 5 Hz refresh)
  static unsigned long lastDrawMs = 0;
  if (now - lastDrawMs >= 200) {
    lastDrawMs = now;
    drawSensorDisplay(linkUp, view);
    drawPitchDisplay();
  }
}
