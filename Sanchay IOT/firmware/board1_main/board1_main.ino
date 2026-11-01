/*
 * ============================================================================
 *  BOARD 1 - SENSOR NODE (FINAL / FROZEN PIN MAP)
 * ============================================================================
 *
 *  Reads DHT22, HC-SR04, PIR and GPS, computes the alert zone, drives the
 *  local RGB LED, and broadcasts a SensorPacket to board 2 over ESP-NOW.
 *
 *  FROZEN WIRING - see FINAL_PINOUT.md before changing anything
 *  -------------------------------------------------------------
 *    DHT22 DATA   -> D4  / GPIO2   (10k pull-up to 3V3)
 *    HC-SR04 TRIG -> D3  / GPIO0   (10k pull-up to 3V3)
 *    HC-SR04 ECHO -> D2  / GPIO4   (1k series + 2k to GND divider)
 *    PIR OUT      -> D0  / GPIO16
 *    GPS TX       -> D6  / GPIO12  (ESP software-serial RX)
 *    GPS RX       -> D7  / GPIO13  (ESP software-serial TX)
 *    RGB R/G/B    -> D1/D5/D8 (GPIO5/14/15) via 100R to MOSFET gates
 *
 *  ESP-NOW
 *  -------
 *    Channel 1, broadcast MAC FF:FF:FF:FF:FF:FF, 5 packets per second.
 *    Board 2 only listens; it does not send anything back.
 *
 *  Serial monitor: 115200 baud.
 * ============================================================================
 */

#include <DHT.h>
#include <SoftwareSerial.h>
#include <TinyGPSPlus.h>
#include <ESP8266WiFi.h>
#include <espnow.h>
#include <user_interface.h>

// ---------------------------------------------------------------------------
// FROZEN PIN MAP - keep these numbers identical to FINAL_PINOUT.md
// ---------------------------------------------------------------------------
const uint8_t PIN_DHT = 2;       // D4  / GPIO2
const uint8_t PIN_TRIG = 0;      // D3  / GPIO0
const uint8_t PIN_ECHO = 4;      // D2  / GPIO4
const uint8_t PIN_PIR = 16;      // D0  / GPIO16
const uint8_t PIN_GPS_RX = 12;   // D6  / GPIO12
const uint8_t PIN_GPS_TX = 13;   // D7  / GPIO13
const uint8_t PIN_RGB_R = 5;     // D1  / GPIO5
const uint8_t PIN_RGB_G = 14;    // D5  / GPIO14
const uint8_t PIN_RGB_B = 15;    // D8  / GPIO15

// 0 cm means "blocked / no echo" and is CRITICAL red.
// 999 is a separate "no target, above 400 cm" sentinel.
const uint16_t DIST_INVALID = 999;

// Packet identity. Board 2 rejects anything with a different magic/version.
const uint16_t PACKET_MAGIC = 0x5A31;
const uint8_t PACKET_VERSION = 1;

// Zone numbers are shared by both boards.
enum AlertZone : uint8_t {
  ZONE_SAFE = 0,
  ZONE_WATCH = 1,
  ZONE_WARN = 2,
  ZONE_CLOSE = 3,
  ZONE_CRITICAL = 4
};

// ---------------------------------------------------------------------------
// ESP-NOW packet
// ---------------------------------------------------------------------------
// Kept small (34 bytes) and packed so both boards agree on the exact layout.
// latE7/lngE7 are latitude/longitude multiplied by 10,000,000 and stored as
// integers. This avoids sending 64-bit doubles and keeps the packet compact.
// ---------------------------------------------------------------------------
typedef struct __attribute__((packed)) {
  uint16_t magic;       // PACKET_MAGIC
  uint8_t version;      // PACKET_VERSION
  uint32_t seq;         // packet counter, wraps naturally
  uint32_t uptimeMs;    // sender millis()
  float tempC;          // last valid DHT temperature
  float humidity;       // last valid DHT humidity
  uint16_t distanceCm;  // 0 = blocked, 999 = no target, else 1..400
  uint8_t motion;       // 0/1 from PIR
  uint8_t zone;         // AlertZone
  uint8_t gpsFix;       // 0/1
  uint8_t satellites;   // satellite count, capped at 255
  uint8_t dhtValid;     // 0 = last DHT read failed
  int32_t latE7;        // latitude * 10^7
  int32_t lngE7;        // longitude * 10^7
} SensorPacket;

// ---------------------------------------------------------------------------
// Global objects and state
// ---------------------------------------------------------------------------
DHT dht(PIN_DHT, DHT22);
SoftwareSerial gpsSerial(PIN_GPS_RX, PIN_GPS_TX);
TinyGPSPlus gps;

SensorPacket packet;
uint32_t packetSeq = 0;

uint16_t distanceCm = DIST_INVALID;
uint8_t currentZone = ZONE_SAFE;
uint8_t motion = 0;
uint8_t dhtValid = 0;
float lastTempC = NAN;
float lastHumidity = NAN;
uint8_t gpsFix = 0;
uint8_t satellites = 0;
int32_t latE7 = 0;
int32_t lngE7 = 0;

unsigned long lastDistanceMs = 0;
unsigned long lastDhtMs = 0;
unsigned long lastSendMs = 0;
unsigned long lastDebugMs = 0;

// ESP-NOW state
bool espNowReady = false;
uint8_t broadcastMac[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
volatile uint32_t sendOk = 0;
volatile uint32_t sendFail = 0;

// ---------------------------------------------------------------------------
// ESP-NOW send callback
// ---------------------------------------------------------------------------
// status == 0 means the packet was handed to the WiFi layer successfully.
// Broadcast packets are not acknowledged by the receiver, so this is not a
// delivery guarantee; board 2 uses a timeout to detect a lost link.
// ---------------------------------------------------------------------------
void onSent(uint8_t *mac, uint8_t status) {
  if (status == 0) {
    sendOk++;
  } else {
    sendFail++;
  }
}

// ---------------------------------------------------------------------------
// HC-SR04 distance
// ---------------------------------------------------------------------------
// One 10 us trigger pulse, then measure the ECHO HIGH time.
// distance_cm = duration_us * 0.0343 / 2
// pulseIn() returns 0 on its 25 ms timeout.
// ---------------------------------------------------------------------------
uint16_t readOnceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duration = pulseIn(PIN_ECHO, HIGH, 25000UL);
  if (duration == 0) {
    return 0;
  }
  return (uint16_t)(duration * 0.0343 / 2.0);
}

// ---------------------------------------------------------------------------
// Median of three - removes a single wild ultrasonic reading.
// ---------------------------------------------------------------------------
uint16_t median3(uint16_t a, uint16_t b, uint16_t c) {
  if (a > b) {
    uint16_t t = a;
    a = b;
    b = t;
  }
  if (b > c) {
    uint16_t t = b;
    b = c;
    c = t;
  }
  if (a > b) {
    uint16_t t = a;
    a = b;
    b = t;
  }
  return b;
}

// ---------------------------------------------------------------------------
// Read distance three times and keep the median.
//   > 400 cm -> DIST_INVALID (no target)
//   0        -> 0 (blocked / no echo, critical)
//   1..400   -> valid centimetres
// ---------------------------------------------------------------------------
uint16_t readDistanceCm() {
  uint16_t a = readOnceCm();
  uint16_t b = readOnceCm();
  uint16_t c = readOnceCm();
  uint16_t m = median3(a, b, c);

  if (m > 400) {
    return DIST_INVALID;
  }
  return m;
}

// ---------------------------------------------------------------------------
// Distance -> zone
// ---------------------------------------------------------------------------
// The boundary value belongs to the safer zone: exactly 120 cm is WATCH.
// DIST_INVALID is reported as SAFE because there is no object to warn about;
// board 2 also checks distanceCm and turns its RGB off for DIST_INVALID.
// ---------------------------------------------------------------------------
uint8_t computeZone(uint16_t cm) {
  if (cm == DIST_INVALID) {
    return ZONE_SAFE;
  }
  if (cm == 0) {
    return ZONE_CRITICAL;
  }
  if (cm > 120) {
    return ZONE_SAFE;
  }
  if (cm > 60) {
    return ZONE_WATCH;
  }
  if (cm > 30) {
    return ZONE_WARN;
  }
  if (cm > 10) {
    return ZONE_CLOSE;
  }
  return ZONE_CRITICAL;
}

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

// ---------------------------------------------------------------------------
// RGB output (common anode + low-side N-MOSFET: PWM HIGH turns the colour on)
// ---------------------------------------------------------------------------
void setColor(uint8_t r, uint8_t g, uint8_t b) {
  analogWrite(PIN_RGB_R, r);
  analogWrite(PIN_RGB_G, g);
  analogWrite(PIN_RGB_B, b);
}

// Blip timing state for Board 1
unsigned long rfTxBlipMs = 0;
bool rfTxBlipActive = false;

void triggerBoard1TxBlip() {
  rfTxBlipMs = millis();
  rfTxBlipActive = true;
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

void applyZoneColor(uint16_t cm) {
  // RF Transmission Spark Blip (20 ms subtle Cyan-White spark every 1 second)
  if (rfTxBlipActive) {
    if (millis() - rfTxBlipMs <= 20) {
      setColor(180, 255, 255); // 20 ms RF Transmission confirmation spark
      return;
    } else {
      rfTxBlipActive = false;
    }
  }

  // Priority 1: PIR Motion Intruder Alert (when path is clear or at safe distance)
  if (motion && (cm > 120 || cm == DIST_INVALID)) {
    setColor(255, 0, 200); // Vibrant Magenta (MOTION ALERT on both boards)
    return;
  }

  // Priority 2: High-Precision Proximity Color Gradient (when obstacle in range)
  if (cm != DIST_INVALID && cm <= 150) {
    uint8_t r = 0, g = 0, b = 0;
    computeProximityColor(cm, r, g, b);
    setColor(r, g, b); // Liquid smooth analog color transition
    return;
  }

  // Priority 3: Clear Operational Buffer (> 150 cm or No Target)
  if (gpsFix) {
    setColor(0, 255, 0); // Pure Green (NOMINAL + GPS FIX on both boards)
  } else {
    setColor(220, 160, 0); // Warm Amber (NOMINAL + SEARCHING GPS on both boards)
  }
}

// Wi-Fi Channel Synchronization (matches router NASA)
const char *WIFI_SSID = "NASA";
const char *WIFI_PASS = "9936@Pari";

// ---------------------------------------------------------------------------
// ESP-NOW setup
// ---------------------------------------------------------------------------
bool initEspNow() {
  WiFi.persistent(false);              // do not write WiFi settings to flash
  WiFi.mode(WIFI_STA);                 // ESP-NOW needs station mode
  WiFi.begin(WIFI_SSID, WIFI_PASS);    // Connect to NASA to sync Wi-Fi channel
  delay(100);

  WiFi.setSleepMode(WIFI_NONE_SLEEP);  // keep the radio awake for low latency
  if (WiFi.channel() == 0) {
    WiFi.channel(1);                   // Fallback to channel 1 if offline
  }
  delay(100);

  if (esp_now_init() != 0) {
    Serial.println("ESP-NOW init FAILED");
    return false;
  }

  esp_now_set_self_role(ESP_NOW_ROLE_COMBO);
  esp_now_register_send_cb(onSent);

  int peerResult = esp_now_add_peer(broadcastMac, ESP_NOW_ROLE_COMBO, 1, NULL, 0);

  Serial.print("ESP-NOW ready, channel=");
  Serial.print(WiFi.channel());
  Serial.print(", peerAdd=");
  Serial.print(peerResult);
  Serial.print(", MAC=");
  Serial.println(WiFi.macAddress());

  return true;
}

// ---------------------------------------------------------------------------
// Build and send one packet
// ---------------------------------------------------------------------------
void sendPacket() {
  if (!espNowReady) {
    return;
  }

  packet.magic = PACKET_MAGIC;
  packet.version = PACKET_VERSION;
  packet.seq = packetSeq++;
  packet.uptimeMs = millis();
  packet.tempC = lastTempC;
  packet.humidity = lastHumidity;
  packet.distanceCm = distanceCm;
  packet.motion = motion;
  packet.zone = currentZone;
  packet.gpsFix = gpsFix;
  packet.satellites = satellites;
  packet.dhtValid = dhtValid;
  packet.latE7 = latE7;
  packet.lngE7 = lngE7;

  int result = esp_now_send(broadcastMac, (uint8_t *)&packet, (int)sizeof(packet));
  if (result == 0) {
    static uint8_t txCount = 0;
    if (++txCount >= 5) { // Every 5 packets = 1 second
      txCount = 0;
      triggerBoard1TxBlip();
    }
  } else {
    sendFail++;
  }
}

// ---------------------------------------------------------------------------
// setup()
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600);
  dht.begin();

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_RGB_R, OUTPUT);
  pinMode(PIN_RGB_G, OUTPUT);
  pinMode(PIN_RGB_B, OUTPUT);

  digitalWrite(PIN_TRIG, LOW);

  Serial.println();
  Serial.println("BOARD 1 - SENSOR NODE (FINAL)");
  Serial.println("DHT=D4 TRIG=D3 ECHO=D2 PIR=D0 GPS=D6/D7 RGB=D1/D5/D8");

  // Visible RGB self-test. Wrong order means wrong channel wiring.
  setColor(255, 0, 0);
  delay(400);
  setColor(0, 255, 0);
  delay(400);
  setColor(0, 0, 255);
  delay(400);
  setColor(255, 255, 255);
  delay(400);
  setColor(0, 0, 0);

  espNowReady = initEspNow();
  if (!espNowReady) {
    Serial.println("Sensors still run, but no packets will be sent.");
  }

  Serial.println("CSV,ms,dhtValid,tempC,humidity,distanceCm,zone,motion,gpsFix,sats,latE7,lngE7,sendOk,sendFail");
}

// ---------------------------------------------------------------------------
// loop()
// ---------------------------------------------------------------------------
void loop() {
  // GPS must be fed continuously; it streams NMEA sentences all the time.
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  unsigned long now = millis();

  // ---- Distance every 300 ms -------------------------------------------
  if (now - lastDistanceMs >= 300) {
    lastDistanceMs = now;
    distanceCm = readDistanceCm();
    currentZone = computeZone(distanceCm);
    applyZoneColor(distanceCm);
  }

  // ---- DHT22 every 2 seconds -------------------------------------------
  // Keep the last valid value if a read fails, but tell board 2 about it.
  if (now - lastDhtMs >= 2000) {
    lastDhtMs = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (isnan(t) || isnan(h)) {
      dhtValid = 0;
    } else {
      lastTempC = t;
      lastHumidity = h;
      dhtValid = 1;
    }
  }

  // ---- PIR -------------------------------------------------------------
  uint8_t prevMotion = motion;
  motion = digitalRead(PIN_PIR) ? 1 : 0;
  if (motion != prevMotion && (distanceCm > 120 || distanceCm == DIST_INVALID)) {
    applyZoneColor(distanceCm);
  }

  // ---- GPS -------------------------------------------------------------
  // A fix older than 5 seconds is treated as invalid for display purposes.
  if (gps.location.isValid() && gps.location.age() < 5000) {
    gpsFix = 1;
    latE7 = (int32_t)(gps.location.lat() * 10000000.0);
    lngE7 = (int32_t)(gps.location.lng() * 10000000.0);
  } else {
    gpsFix = 0;
  }

  uint32_t sats = gps.satellites.value();
  satellites = (uint8_t)(sats > 255 ? 255 : sats);

  // ---- ESP-NOW packet every 200 ms (5 Hz) ------------------------------
  if (now - lastSendMs >= 200) {
    lastSendMs = now;
    sendPacket();
  }

  // ---- Serial CSV once per second --------------------------------------
  if (now - lastDebugMs >= 1000) {
    lastDebugMs = now;

    Serial.print("CSV,");
    Serial.print(now);
    Serial.print(',');
    Serial.print(dhtValid);
    Serial.print(',');
    Serial.print(lastTempC, 1);
    Serial.print(',');
    Serial.print(lastHumidity, 1);
    Serial.print(',');
    Serial.print(distanceCm);
    Serial.print(',');
    Serial.print(zoneName(currentZone));
    Serial.print(',');
    Serial.print(motion);
    Serial.print(',');
    Serial.print(gpsFix);
    Serial.print(',');
    Serial.print(satellites);
    Serial.print(',');
    Serial.print(latE7);
    Serial.print(',');
    Serial.print(lngE7);
    Serial.print(',');
    Serial.print(sendOk);
    Serial.print(',');
    Serial.println(sendFail);
  }
}
