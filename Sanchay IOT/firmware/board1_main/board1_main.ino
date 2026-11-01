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

// ---------------------------------------------------------------------------
// OPTIONAL DIRECT BUZZER ON BOARD 1 (0ms Latency Hardware Lockstep)
// If you plug the buzzer into Board 1:
// - Default: D6 (GPIO 12) if GPS is not connected
// - Or D0 (GPIO 16) if PIR is not connected (same as Board 2!)
// - Or D7 (GPIO 13), or RX (GPIO 3)
// Set ENABLE_BOARD1_BUZZER = true if buzzer is wired to Board 1.
// ---------------------------------------------------------------------------
const bool ENABLE_BOARD1_BUZZER = true;
const uint8_t PIN_BUZZER = 12;   // D6 / GPIO12 (Change to 16 for D0, or 13 for D7, or 3 for RX)

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
const int32_t DEFAULT_LAT_E7 = 262452630L; // 26.245263 N (Default base location when no GPS lock)
const int32_t DEFAULT_LNG_E7 = 783129140L; // 78.312914 E
uint8_t gpsFix = 0;
uint8_t satellites = 0;
int32_t latE7 = DEFAULT_LAT_E7;
int32_t lngE7 = DEFAULT_LNG_E7;

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
// High-Speed HC-SR04 Proximity Radar
// Optimized for instantaneous response (<14 ms pulse timeout)
// ---------------------------------------------------------------------------
uint16_t readOnceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  // 14ms timeout (~2.4m max range) ensures zero thread blocking
  unsigned long duration = pulseIn(PIN_ECHO, HIGH, 14000UL);
  if (duration == 0) {
    return DIST_INVALID; // Timeout = no obstacle in range / open space
  }
  uint16_t cm = (uint16_t)(duration * 0.0343 / 2.0);
  if (cm < 2 || cm > 250) {
    return DIST_INVALID;
  }
  return cm;
}

uint16_t readDistanceCm() {
  uint16_t a = readOnceCm();
  if (a == DIST_INVALID) return DIST_INVALID;
  uint16_t b = readOnceCm();
  if (b == DIST_INVALID) return a;
  return (a < b) ? a : b; // Responsive low-pass filter
}

// ---------------------------------------------------------------------------
// Distance -> zone
// ---------------------------------------------------------------------------
uint8_t computeZone(uint16_t cm) {
  if (cm == DIST_INVALID || cm >= 120) {
    return ZONE_SAFE;
  }
  if (cm > 50) {
    return ZONE_WATCH;
  }
  if (cm > 20) {
    return ZONE_WARN;
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
// Lockstep Acoustic Buzzer & Visual Engine (0ms Latency)
// Rule: At EXACTLY <= 50 cm: Buzzer sounds AND LED turns Pure Solid Red!
// Continuous solid STOP tone when <= 20 cm.
// ---------------------------------------------------------------------------
uint16_t getBuzzerPeriod(uint16_t cm) {
  if (cm >= 50 || cm == DIST_INVALID) return 0; // Completely SILENT >= 50 cm
  if (cm <= 20) return 1; // Solid unbroken STOP tone (<= 20 cm)

  // Clear warning cadence progression between 20 cm and 50 cm:
  if (cm > 35) {
    return (uint16_t)map(cm, 50, 35, 420, 220); // 2.4 Hz to 4.5 Hz
  } else {
    return (uint16_t)map(cm, 35, 20, 220, 95);  // 4.5 Hz to 10.5 Hz
  }
}

void updateBoard1Buzzer(uint16_t cm) {
  if (!ENABLE_BOARD1_BUZZER) return;
  static unsigned long lastBeepStartMs = 0;
  static bool buzzerActive = false;

  if (cm == DIST_INVALID || cm >= 50) {
    if (buzzerActive) {
      digitalWrite(PIN_BUZZER, LOW);
      buzzerActive = false;
    }
    return;
  }

  // Emergency Collision Stop (<= 20 cm): Continuous solid unbroken tone
  if (cm <= 20) {
    digitalWrite(PIN_BUZZER, HIGH);
    buzzerActive = true;
    return;
  }

  uint16_t period = getBuzzerPeriod(cm);
  if (period <= 1) {
    digitalWrite(PIN_BUZZER, HIGH);
    buzzerActive = true;
    return;
  }

  // Crisp, audible chirp duration: 35-45 ms
  uint16_t onDuration = constrain(period / 4, 30, 48);
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
// Synchronized Color Gradient (Lockstep with Buzzer Threshold)
// ---------------------------------------------------------------------------
void computeProximityColor(uint16_t cm, uint8_t &r, uint8_t &g, uint8_t &b) {
  b = 0; // Pure hazard spectrum

  // 1. Safe Buffer (>= 120 cm or DIST_INVALID): Pure Green
  if (cm == DIST_INVALID || cm >= 120) {
    r = 0;
    g = 255;
    return;
  }

  // 2. Approach Caution (50 cm < cm < 120 cm): Smooth Green -> Yellow -> Orange
  if (cm > 50) {
    r = (uint8_t)map(cm, 120, 50, 0, 255);
    g = (uint8_t)map(cm, 120, 50, 255, 90);
    return;
  }

  // 3. Hazard Alert Zone (<= 50 cm): EXACT LOCKSTEP WITH BUZZER!
  // At the EXACT moment distance reaches 50 cm, Buzzer sounds AND LED is pure Red!
  r = 255;
  g = 0;
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

  // Board 1 RGB is 100% Dedicated to Proximity Radar:
  // >= 200 cm or DIST_INVALID: PURE SOLID GREEN (0, 255, 0)
  // < 200 cm: High-precision analog color gradient (Green -> Yellow -> Orange -> Red)
  // < 8 cm: Pure Solid Red (255, 0, 0)
  uint8_t r = 0, g = 0, b = 0;
  computeProximityColor(cm, r, g, b);
  setColor(r, g, b);
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

  if (ENABLE_BOARD1_BUZZER) {
    pinMode(PIN_BUZZER, OUTPUT);
    digitalWrite(PIN_BUZZER, LOW);
  }

  digitalWrite(PIN_TRIG, LOW);

  Serial.println();
  Serial.println("BOARD 1 - SENSOR NODE (FINAL - DUAL ALERT ENGINE)");
  Serial.println("DHT=D4 TRIG=D3 ECHO=D2 PIR=D0 GPS=D6/D7 RGB=D1/D5/D8 BUZZER=D6/D0");

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

  // Keep Board 1 Buzzer timing clocked continuously (sub-millisecond precision)
  updateBoard1Buzzer(distanceCm);

  // ---- Fast-Track Distance every 60 ms (16 Hz Ultra-Responsive) --------
  if (now - lastDistanceMs >= 60) {
    lastDistanceMs = now;
    uint16_t prevDist = distanceCm;
    distanceCm = readDistanceCm();
    currentZone = computeZone(distanceCm);
    applyZoneColor(distanceCm);
    updateBoard1Buzzer(distanceCm);

    // Fast-dispatch ESP-NOW immediately if zone changed or inside alert zone
    if (abs((int)distanceCm - (int)prevDist) >= 8 || distanceCm <= 50) {
      if (now - lastSendMs >= 60) {
        lastSendMs = now;
        sendPacket();
      }
    }
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
    latE7 = DEFAULT_LAT_E7;
    lngE7 = DEFAULT_LNG_E7;
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
