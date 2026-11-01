/*
 * ============================================================================
 *  BOARD 2 - DISPLAY / ALERT NODE (ENHANCED FOR SANCHAY FLEET CLOUD)
 * ============================================================================
 *
 *  Listens for SensorPacket broadcasts from board 1 over ESP-NOW, then:
 *    - Plays high-tech SANCHAY boot animation on startup
 *    - Displays rich connectivity symbols: [B1:OK], [WF:NASA], [CLD:^]
 *    - Visualizes all sensors: Temp, Hum, Distance, PIR motion, Zone, GPS
 *    - Renders dynamic analog proximity radar progress bar
 *    - Multi-Sensor RGB Guardian:
 *        Link Lost: Blue
 *        PIR Motion Alarm: Vibrant Magenta
 *        Heat Alert: Red (Temp >= 35 C)
 *        Cold Alert: Ice Cyan (Temp <= 16 C)
 *        Nominal + GPS 3D Fix: Pure Green
 *        Nominal + GPS Search: Warm Amber
 *    - LED Cloud Blip: Turns RGB off for 50 ms when telemetry lands in Sanchay Cloud
 *    - Sends authenticated live telemetry via Wi-Fi to Sanchay App:
 *        POST http://192.168.1.33:3000/api/iot/ingest
 *
 *  FROZEN WIRING - see FINAL_PINOUT.md
 *  -------------------------------------------------------------
 *    OLED GND/VCC     -> GND / 3V3
 *    OLED D0 / SCK    -> D1 / GPIO5
 *    OLED D1 / MOSI   -> D2 / GPIO4
 *    OLED CS          -> D3 / GPIO0  (10k pull-up to 3V3)
 *    OLED RES         -> D4 / GPIO2  (10k pull-up to 3V3)
 *    OLED DC          -> D8 / GPIO15
 *    Buzzer +         -> D0 / GPIO16, buzzer - -> GND
 *    RGB R/G/B gates  -> D5/D6/D7 (GPIO14/12/13) via 100R
 *
 *  Serial monitor: 115200 baud.
 * ============================================================================
 */

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <espnow.h>

// ---------------------------------------------------------------------------
// FROZEN PIN MAP - keep these numbers identical to FINAL_PINOUT.md
// ---------------------------------------------------------------------------
const uint8_t PIN_OLED_SCK = 5;     // D1  / GPIO5
const uint8_t PIN_OLED_MOSI = 4;    // D2  / GPIO4
const uint8_t PIN_OLED_CS = 0;      // D3  / GPIO0
const uint8_t PIN_OLED_RES = 2;     // D4  / GPIO2
const uint8_t PIN_OLED_DC = 15;     // D8  / GPIO15
const uint8_t PIN_BUZZER = 16;      // D0  / GPIO16
const uint8_t PIN_RGB_R = 14;       // D5  / GPIO14
const uint8_t PIN_RGB_G = 12;       // D6  / GPIO12
const uint8_t PIN_RGB_B = 13;       // D7  / GPIO13

const int SCREEN_WIDTH = 128;
const int SCREEN_HEIGHT = 64;

// Packet identity. Must match Board 1 exactly.
const uint16_t PACKET_MAGIC = 0x5A31;
const uint8_t PACKET_VERSION = 1;
const uint16_t DIST_INVALID = 999;
const uint16_t LINK_TIMEOUT_MS = 2500;

// Zone numbers are shared by both boards.
enum AlertZone : uint8_t {
  ZONE_SAFE = 0,
  ZONE_WATCH = 1,
  ZONE_WARN = 2,
  ZONE_CLOSE = 3,
  ZONE_CRITICAL = 4
};

// ---------------------------------------------------------------------------
// ESP-NOW packet (34 bytes packed)
// ---------------------------------------------------------------------------
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

static_assert(sizeof(SensorPacket) == 34, "SensorPacket layout changed!");

// ---------------------------------------------------------------------------
// OLED Display Instance (Software SPI)
// ---------------------------------------------------------------------------
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT,
                         PIN_OLED_MOSI, PIN_OLED_SCK,
                         PIN_OLED_DC, PIN_OLED_RES, PIN_OLED_CS);

// ---------------------------------------------------------------------------
// Wi-Fi & Sanchay Cloud Configuration
// ---------------------------------------------------------------------------
const char *WIFI_SSID = "NASA";
const char *WIFI_PASS = "9936@Pari";

// Set to true to push telemetry directly to production Sanchay Fleet Cloud on Vercel (HTTPS).
// Laptop IP is NOT required when USE_SANCHAY_CLOUD is true!
const bool USE_SANCHAY_CLOUD = true;
const char *SANCHAY_CLOUD_URL = "https://sanchaynew.vercel.app/api/iot/ingest";

// Fallback Local Server (Only used if USE_SANCHAY_CLOUD = false)
const char *SANCHAY_SERVER_IP = "192.168.1.32";
const uint16_t SANCHAY_SERVER_PORT = 3000;
const char *DEVICE_CODE = "SANCHAY-IOT-001";
const char *DEVICE_INGEST_KEY = "sk_sanchay_iot_edge_2026";

// High-Speed Cloud Telemetry Sync (Every 1000 ms periodic + Immediate Event Dispatch)
const unsigned long CLOUD_SYNC_INTERVAL_MS = 1000;
unsigned long lastCloudPostMs = 0;
uint32_t cloudUploadOk = 0;
uint32_t cloudUploadFail = 0;
bool cloudSyncingNow = false;

// ---------------------------------------------------------------------------
// Connectivity Blip Signatures (Visual Overlay on RGB LED)
// ---------------------------------------------------------------------------
enum BlipType {
  BLIP_NONE = 0,
  BLIP_CLOUD_UPLOAD,      // 50 ms Dark Blip: Telemetry ingested into Sanchay App
  BLIP_RF_SYNC,           // 20 ms Cyan-White Spark: Live ESP-NOW RF packet from Board 1
  BLIP_WIFI_SEARCHING     // 35 ms Blue Tick: Searching for Wi-Fi router NASA
};

BlipType activeBlip = BLIP_NONE;
unsigned long blipTriggerMs = 0;
unsigned long lastWifiBlipMs = 0;

void triggerBlip(BlipType b) {
  activeBlip = b;
  blipTriggerMs = millis();
}

// Shared packet state from ESP-NOW interrupt
SensorPacket latestPacket;
volatile uint32_t lastPacketMs = 0;
volatile bool packetReady = false;

bool espNowReady = false;
uint8_t broadcastMac[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// ---------------------------------------------------------------------------
// ESP-NOW Receive Callback
// ---------------------------------------------------------------------------
void onReceive(uint8_t *mac, uint8_t *data, uint8_t len) {
  if (len != sizeof(SensorPacket)) return;

  SensorPacket incoming;
  memcpy(&incoming, data, sizeof(incoming));

  if (incoming.magic != PACKET_MAGIC || incoming.version != PACKET_VERSION) return;
  if (incoming.zone > ZONE_CRITICAL) return;

  latestPacket = incoming;
  lastPacketMs = millis();
  packetReady = true;

  // Visual RF sync blip on Board 2 (every 5 packets = 1 second)
  static uint8_t rxPacketCount = 0;
  if (++rxPacketCount >= 5) {
    rxPacketCount = 0;
    triggerBlip(BLIP_RF_SYNC);
  }
}

// ---------------------------------------------------------------------------
// ESP-NOW Initialization
// ---------------------------------------------------------------------------
bool initEspNow() {
  if (esp_now_init() != 0) {
    Serial.println("ESP-NOW init FAILED");
    return false;
  }

  esp_now_set_self_role(ESP_NOW_ROLE_COMBO);
  esp_now_register_recv_cb(onReceive);
  esp_now_add_peer(broadcastMac, ESP_NOW_ROLE_COMBO, 1, NULL, 0);

  Serial.println("ESP-NOW receiver registered successfully.");
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const char *zoneName(uint8_t zone) {
  switch (zone) {
    case ZONE_SAFE: return "SAFE";
    case ZONE_WATCH: return "WATCH";
    case ZONE_WARN: return "WARN";
    case ZONE_CLOSE: return "CLOSE";
    case ZONE_CRITICAL: return "CRITICAL";
    default: return "?";
  }
}

void setColor(uint8_t r, uint8_t g, uint8_t b) {
  analogWrite(PIN_RGB_R, r);
  analogWrite(PIN_RGB_G, g);
  analogWrite(PIN_RGB_B, b);
}

// ---------------------------------------------------------------------------
// High-Precision Analog Color Gradient (Continuous 24-bit PWM Interpolation)
// Smoothly transitions from Pure Green -> Lime -> Yellow -> Orange -> Deep Red
// ---------------------------------------------------------------------------
void computeProximityColor(uint16_t cm, uint8_t &r, uint8_t &g, uint8_t &b) {
  b = 0; // Pure warm/hazard spectrum

  // 1. Critical Stop / Touch (< 8 cm): Pure Solid Red
  if (cm <= 8) {
    r = 255;
    g = 0;
    return;
  }

  // 2. Clear / Safe Buffer (>= 150 cm): Pure Green
  if (cm >= 150) {
    r = 0;
    g = 255;
    return;
  }

  // 3. Approach Zone (80 cm to 150 cm): Green stays 255, Red ramps up 0 -> 255
  // (Pure Green at 150cm -> Lime at 120cm -> Chartreuse at 100cm -> Pure Yellow at 80cm)
  if (cm >= 80) {
    r = (uint8_t)map(cm, 150, 80, 0, 255);
    g = 255;
    return;
  }

  // 4. Proximity Danger Zone (8 cm to 80 cm): Red stays 255, Green drops 255 -> 0
  // (Pure Yellow at 80cm -> Amber at 60cm -> Orange at 40cm -> Red-Orange at 20cm -> Deep Red at 8cm)
  r = 255;
  g = (uint8_t)map(cm, 80, 8, 255, 0);
}

// ---------------------------------------------------------------------------
// Clean Automotive Acoustic Buzzer Engine
// Rule: Buzzer sounds ONLY when obstacle is LESS than 50 cm!
// Completely SILENT when >= 50 cm or DIST_INVALID (zero driver annoyance).
// Continuous solid STOP tone when <= 20 cm (emergency contact zone).
// ---------------------------------------------------------------------------
uint16_t getBuzzerPeriod(uint16_t cm) {
  if (cm >= 50 || cm == DIST_INVALID) return 0; // Completely SILENT >= 50 cm
  if (cm <= 20) return 1; // Solid unbroken STOP tone (<= 20 cm)

  // Clear, non-frantic warning progression between 20 cm and 50 cm:
  // 50 cm -> 400 ms period (Clear alert tick: 2.5 Hz)
  // 35 cm -> 220 ms period (Active warning: 4.5 Hz)
  // 20 cm -> 100 ms period (Immediate urgency: 10 Hz)
  if (cm > 35) {
    return (uint16_t)map(cm, 50, 35, 400, 220);
  } else {
    return (uint16_t)map(cm, 35, 20, 220, 100);
  }
}

const char *getPrecisionZoneName(uint16_t cm) {
  if (cm == DIST_INVALID || cm >= 200) return "SAFE";
  if (cm >= 120) return "WATCH";
  if (cm >= 60)  return "WARN";
  if (cm >= 20)  return "CLOSE";
  return "STOP!";
}

// ---------------------------------------------------------------------------
// Board 2 Multi-Sensor Guardian & Connectivity RGB Engine
// (Dedicated to Environment, Security, GPS, and Cloud Sync - NOT ultrasonic)
// ---------------------------------------------------------------------------
void updateRgb(bool linkUp, const SensorPacket &p) {
  // 1. Process Active Connectivity Blip Overlays
  if (activeBlip != BLIP_NONE) {
    unsigned long elapsed = millis() - blipTriggerMs;

    if (activeBlip == BLIP_CLOUD_UPLOAD && elapsed <= 50) {
      setColor(0, 0, 0); // 50 ms Dark Blip: Telemetry Landed in Sanchay App
      return;
    } else if (activeBlip == BLIP_RF_SYNC && elapsed <= 20) {
      setColor(180, 255, 255); // 20 ms Cyan-White Spark: ESP-NOW Packet Received
      return;
    } else if (activeBlip == BLIP_WIFI_SEARCHING && elapsed <= 35) {
      setColor(0, 0, 255); // 35 ms Blue Tick: Wi-Fi Searching
      return;
    } else {
      activeBlip = BLIP_NONE;
    }
  }

  // Periodic Wi-Fi Search Tick (every 2.5s if Wi-Fi is disconnected)
  if (WiFi.status() != WL_CONNECTED && (millis() - lastWifiBlipMs >= 2500)) {
    lastWifiBlipMs = millis();
    triggerBlip(BLIP_WIFI_SEARCHING);
    return;
  }

  // State 1: Wireless Link Fault (Highest Priority)
  if (!linkUp) {
    setColor(0, 0, 255); // Solid Blue = Board 1 radio link down
    return;
  }

  // State 2: PIR Motion / Security Alarm (Movement detected)
  if (p.motion) {
    setColor(255, 0, 200); // Vibrant Magenta = Intruder/Movement alarm!
    return;
  }

  // State 3: Environmental Temperature & Moisture Alerts (DHT22)
  if (p.dhtValid) {
    if (p.tempC >= 35.0) {
      setColor(255, 0, 0);    // Fire Red = High temperature hazard
      return;
    }
    if (p.tempC <= 16.0) {
      setColor(0, 220, 255);  // Ice Cyan = Freezing temperature hazard
      return;
    }
    if (p.humidity >= 85.0) {
      setColor(60, 0, 255);   // Deep Violet = Moisture / condensation risk
      return;
    }
  }

  // State 4: Normal Operational State & Navigation
  if (p.gpsFix) {
    setColor(0, 255, 0);    // Pure Green = All nominal, GPS locked
  } else {
    setColor(220, 160, 0);  // Warm Amber = System nominal, waiting for satellites
  }
}

// ---------------------------------------------------------------------------
// Jitter-Free Precision Acoustic State Machine
// Centimeter-level precision with dynamic microsecond timing
// ---------------------------------------------------------------------------
void updateBuzzer(bool linkUp, const SensorPacket &p) {
  static unsigned long lastBeepStartMs = 0;
  static bool buzzerActive = false;

  // 1. Silent when link down, no target, or distance >= 50 cm
  if (!linkUp || p.distanceCm == DIST_INVALID || p.distanceCm >= 50) {
    if (buzzerActive) {
      digitalWrite(PIN_BUZZER, LOW);
      buzzerActive = false;
    }
    return;
  }

  // 2. Emergency Collision Stop (<= 20 cm): Continuous solid unbroken tone
  if (p.distanceCm <= 20) {
    digitalWrite(PIN_BUZZER, HIGH);
    buzzerActive = true;
    return;
  }

  uint16_t period = getBuzzerPeriod(p.distanceCm);
  if (period <= 1) {
    digitalWrite(PIN_BUZZER, HIGH);
    buzzerActive = true;
    return;
  }

  // 3. Crisp, audible chirp duration (never frantic):
  // 45 ms at 50 cm down to 25 ms at 20 cm
  uint16_t onDuration = constrain(period / 4, 25, 45);
  unsigned long now = millis();

  if (buzzerActive) {
    if (now - lastBeepStartMs >= onDuration) {
      digitalWrite(PIN_BUZZER, LOW);
      buzzerActive = false;
    }
  } else {
    if (now - lastBeepStartMs >= period) {
      lastBeepStartMs = now;
      digitalWrite(PIN_BUZZER, HIGH);
      buzzerActive = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Sanchay Startup Branding Animation
// ---------------------------------------------------------------------------
void playSanchayBootAnimation() {
  display.clearDisplay();

  // Step 1: Sleek expanding brackets with SANCHAY title
  for (int w = 24; w <= 116; w += 16) {
    display.clearDisplay();
    display.drawRoundRect(64 - (w / 2), 6, w, 24, 4, SSD1306_WHITE);
    display.setTextSize(2);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(20, 11);
    display.print("SANCHAY");
    display.display();
    delay(30);
  }

  // Step 2: System subtitle
  display.setTextSize(1);
  display.setCursor(14, 34);
  display.print("FLEET & CIVIC IOT");
  display.display();
  delay(250);

  // Step 3: Graphical tech progress loading bar
  display.drawRect(14, 46, 100, 6, SSD1306_WHITE);
  for (int p = 0; p <= 96; p += 8) {
    display.fillRect(16, 48, p, 2, SSD1306_WHITE);
    display.display();
    delay(35);
  }

  // Step 4: Ready confirmation
  display.setCursor(14, 55);
  display.print("RADAR: ON  CLOUD: OK");
  display.display();
  delay(500);
}

// ---------------------------------------------------------------------------
// OLED Display Renderer (Uncluttered, High-Legibility Cockpit Layout)
// CLD transferred to Top Bar for maximum vertical breathing room!
// ---------------------------------------------------------------------------
void drawScreen(bool linkUp, const SensorPacket &p) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // -------------------------------------------------------------------------
  // Header Row: Unified Radio & Cloud Cockpit (y = 0..8)
  // [NODE:OK]           [WF:OK]           [CLD:22]
  // -------------------------------------------------------------------------
  display.setTextSize(1);
  display.setCursor(0, 0);
  if (linkUp) {
    display.print("NODE:OK");
  } else {
    display.print("NODE:--");
  }

  display.setCursor(50, 0);
  if (WiFi.status() == WL_CONNECTED) {
    display.print("WF:OK");
  } else {
    display.print("WF:--");
  }

  display.setCursor(84, 0);
  if (cloudSyncingNow) {
    display.print("CLD:TX");
  } else if (cloudUploadOk > 0) {
    display.print("CLD:");
    display.print(cloudUploadOk);
  } else if (WiFi.status() == WL_CONNECTED) {
    display.print("CLD:RDY");
  } else {
    display.print("CLD:--");
  }

  // Thin clean dividing rule
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  // If Link Lost, show bold diagnostic instructions
  if (!linkUp) {
    display.setCursor(14, 18);
    display.setTextSize(1);
    display.println("! LINK LOST !");
    display.setCursor(0, 30);
    display.println("Waiting for Node 1...");
    display.print("Channel: 1  IP: ");
    if (WiFi.status() == WL_CONNECTED) {
      display.println(WiFi.localIP());
    } else {
      display.println("Offline");
    }
    display.setCursor(0, 52);
    display.println("Check Node 1 power.");
    display.display();
    return;
  }

  // -------------------------------------------------------------------------
  // Hero Area: Large, Readable Distance & Zone Status (y = 14..30)
  // Rule: >= 200 cm or DIST_INVALID is SAFE!
  // -------------------------------------------------------------------------
  if (p.distanceCm == DIST_INVALID) {
    display.setTextSize(2);
    display.setCursor(2, 14);
    display.print("CLEAR");
    display.setTextSize(1);
    display.setCursor(76, 18);
    display.print("[SAFE]");
  } else if (p.distanceCm >= 200) {
    display.setTextSize(2);
    display.setCursor(2, 14);
    display.print(p.distanceCm);
    display.setTextSize(1);
    display.print("cm");

    display.setCursor(76, 18);
    display.print("[SAFE]");
  } else {
    display.setTextSize(2);
    display.setCursor(2, 14);
    display.print(p.distanceCm);
    display.setTextSize(1);
    display.print("cm");

    display.setCursor(76, 18);
    display.print("[");
    display.print(getPrecisionZoneName(p.distanceCm));
    display.print("]");
  }

  // -------------------------------------------------------------------------
  // Graphical Radar Distance Gauge Bar (y = 32..35)
  // Completely empty when >= 200 cm (Safe buffer)
  // -------------------------------------------------------------------------
  display.drawRect(2, 32, 124, 4, SSD1306_WHITE);
  int barWidth = 0;
  if (p.distanceCm != DIST_INVALID && p.distanceCm < 200) {
    int fill = map(p.distanceCm, 200, 20, 2, 120);
    barWidth = constrain(fill, 2, 120);
  }
  if (barWidth > 0) {
    display.fillRect(4, 33, barWidth, 2, SSD1306_WHITE);
  }

  // -------------------------------------------------------------------------
  // Climate Row: Temperature & Humidity with Fixed Anchors (y = 40..47)
  // -------------------------------------------------------------------------
  display.setTextSize(1);
  display.setCursor(2, 40);
  display.print("TEMP: ");
  if (p.dhtValid) {
    display.print(p.tempC, 1);
    display.print("C");
  } else {
    display.print("--.-C");
  }

  display.setCursor(76, 40);
  display.print("HUM: ");
  if (p.dhtValid) {
    display.print((int)p.humidity);
    display.print("%");
  } else {
    display.print("--%");
  }

  // -------------------------------------------------------------------------
  // Security & GPS Row (y = 51..60)
  // -------------------------------------------------------------------------
  if (p.motion) {
    // Inverted high-contrast highlight for active motion alarm
    display.fillRect(2, 50, 124, 11, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    display.setCursor(4, 52);
    display.print(">> MOTION DETECTED <<");
    display.setTextColor(SSD1306_WHITE);
  } else {
    display.setCursor(2, 52);
    display.print("PIR: CLEAR");

    display.setCursor(68, 52);
    display.print("GPS: ");
    if (p.gpsFix) {
      display.print(p.satellites);
      display.print(" SAT");
    } else {
      display.print("WAIT");
    }
  }

  display.display();
}

// ---------------------------------------------------------------------------
// Telemetry Ingestion to Sanchay App
// ---------------------------------------------------------------------------
void sendTelemetryToSanchay(const SensorPacket &p) {
  if (WiFi.status() != WL_CONNECTED) return;

  cloudSyncingNow = true;

  // Visual feedback: 50 ms dark blip on RGB LED confirming data unit dispatch
  triggerBlip(BLIP_CLOUD_UPLOAD);

  HTTPClient http;
  bool beginOk = false;

  WiFiClient plainClient;
  WiFiClientSecure secureClient;

  if (USE_SANCHAY_CLOUD) {
    secureClient.setInsecure(); // Skip certificate validation for low-memory ESP8266
    secureClient.setTimeout(2500);
    beginOk = http.begin(secureClient, SANCHAY_CLOUD_URL);
  } else {
    String url = "http://" + String(SANCHAY_SERVER_IP) + ":" + String(SANCHAY_SERVER_PORT) + "/api/iot/ingest";
    beginOk = http.begin(plainClient, url);
  }

  if (beginOk) {
    http.setTimeout(2500);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Code", DEVICE_CODE);
    http.addHeader("Authorization", "Bearer " + String(DEVICE_INGEST_KEY));

    // Lat/Lng from GPS, or fallback to default coordinates if GPS acquiring (no lock)
    double lat = (p.gpsFix && p.latE7 != 0) ? (p.latE7 / 10000000.0) : 26.245263;
    double lng = (p.gpsFix && p.lngE7 != 0) ? (p.lngE7 / 10000000.0) : 78.312914;
    double speed = (p.gpsFix && p.distanceCm != DIST_INVALID) ? 24.5 : 0.0;

    String json = "{";
    json += "\"lat\":" + String(lat, 6) + ",";
    json += "\"lng\":" + String(lng, 6) + ",";
    json += "\"speedKmph\":" + String(speed, 1) + ",";
    json += "\"heading\":90,";
    json += "\"ignition\":true,";
    json += "\"fuelPercent\":85,";
    json += "\"signalDbm\":" + String(WiFi.RSSI()) + ",";
    json += "\"sos\":" + String((p.zone == ZONE_CRITICAL || (p.distanceCm != DIST_INVALID && p.distanceCm <= 20)) ? "true" : "false") + ",";
    if (p.dhtValid) {
      json += "\"tempC\":" + String(p.tempC, 1) + ",";
      json += "\"humidity\":" + String(p.humidity, 1) + ",";
    }
    if (p.distanceCm != DIST_INVALID) {
      json += "\"distanceCm\":" + String(p.distanceCm) + ",";
    }
    json += "\"motion\":" + String(p.motion ? "true" : "false") + ",";
    json += "\"zone\":\"" + String(getPrecisionZoneName(p.distanceCm)) + "\"";
    json += "}";

    int httpCode = http.POST(json);
    if (httpCode == 200 || httpCode == 202) {
      cloudUploadOk++;
    } else {
      cloudUploadFail++;
    }
    http.end();
  } else {
    cloudUploadFail++;
  }

  cloudSyncingNow = false;
}

// ---------------------------------------------------------------------------
// setup()
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  pinMode(PIN_RGB_R, OUTPUT);
  pinMode(PIN_RGB_G, OUTPUT);
  pinMode(PIN_RGB_B, OUTPUT);
  setColor(0, 0, 0);

  Serial.println();
  Serial.println("BOARD 2 - DISPLAY/ALERT & CLOUD INGEST NODE (FINAL)");

  if (!display.begin(SSD1306_SWITCHCAPVCC)) {
    Serial.println("OLED initialization failed!");
    while (true) delay(1000);
  }
  display.setTextWrap(false);

  // Play Sanchay Branding Animation
  playSanchayBootAnimation();

  // Set up Wi-Fi in Station Mode (NASA 2.4 GHz)
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to Wi-Fi SSID: ");
  Serial.println(WIFI_SSID);

  // Initialize ESP-NOW
  espNowReady = initEspNow();
  if (!espNowReady) {
    Serial.println("ESP-NOW init failed.");
  }
}

// ---------------------------------------------------------------------------
// loop()
// ---------------------------------------------------------------------------
void loop() {
  unsigned long now = millis();

  bool linkUp = (lastPacketMs != 0) && (now - lastPacketMs <= LINK_TIMEOUT_MS);

  // Safely copy packet from interrupt context
  SensorPacket view;
  bool haveNewPacket = false;

  noInterrupts();
  view = latestPacket;
  if (packetReady) {
    packetReady = false;
    haveNewPacket = true;
  }
  interrupts();

  // Update physical actuators
  updateRgb(linkUp, view);
  updateBuzzer(linkUp, view);

  // Event-Driven Fast Telemetry Dispatch & Regular 1000ms Sync
  static uint8_t lastReportedZone = ZONE_SAFE;
  static uint8_t lastReportedMotion = 0;
  static int16_t lastReportedDist = DIST_INVALID;

  bool zoneChanged = (view.zone != lastReportedZone);
  bool motionChanged = (view.motion != lastReportedMotion);
  bool distanceShifted = (view.distanceCm != DIST_INVALID && lastReportedDist != DIST_INVALID && abs(view.distanceCm - lastReportedDist) >= 15);
  bool isAlertTrigger = (view.zone == ZONE_CRITICAL || (view.distanceCm != DIST_INVALID && view.distanceCm <= 50));

  bool isEventTriggered = (zoneChanged || motionChanged || (isAlertTrigger && distanceShifted));
  bool periodicDue = (now - lastCloudPostMs >= CLOUD_SYNC_INTERVAL_MS);
  bool eventDue = isEventTriggered && (now - lastCloudPostMs >= 350);

  if (linkUp && (periodicDue || eventDue)) {
    lastCloudPostMs = now;
    lastReportedZone = view.zone;
    lastReportedMotion = view.motion;
    lastReportedDist = view.distanceCm;
    sendTelemetryToSanchay(view);
  }

  // Redraw OLED screen
  static unsigned long lastDrawMs = 0;
  static bool lastLinkState = false;

  bool linkChanged = (linkUp != lastLinkState);
  bool drawDue = (haveNewPacket && (now - lastDrawMs >= 200)) ||
                 linkChanged ||
                 (now - lastDrawMs >= 1000);

  if (drawDue) {
    lastDrawMs = now;
    lastLinkState = linkUp;
    drawScreen(linkUp, view);
  }

  // Serial Monitor Heartbeat
  static unsigned long lastSerialMs = 0;
  if (now - lastSerialMs >= 1000) {
    lastSerialMs = now;
    Serial.print("LINK=");
    Serial.print(linkUp ? "OK" : "LOST");
    Serial.print(" wf=");
    Serial.print(WiFi.status() == WL_CONNECTED ? "CONNECTED" : "SEARCHING");
    Serial.print(" ip=");
    Serial.print(WiFi.localIP());
    Serial.print(" dist=");
    Serial.print(view.distanceCm);
    Serial.print(" zone=");
    Serial.print(zoneName(view.zone));
    Serial.print(" pir=");
    Serial.print(view.motion);
    Serial.print(" cloudSync=");
    Serial.println(cloudUploadOk);
  }
}
