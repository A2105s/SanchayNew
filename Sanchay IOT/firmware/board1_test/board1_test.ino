/*
 * ============================================================================
 *  BOARD 1 - SENSOR NODE TEST SKETCH
 * ============================================================================
 *
 *  Boards: NodeMCU 1.0 (ESP-12E Module), ESP8266 core 3.1.2
 *  Purpose: Prove every sensor on board 1 works before adding ESP-NOW.
 *
 *  Hardware connected to this board
 *  --------------------------------
 *    DHT22 temperature/humidity sensor
 *    HC-SR04 ultrasonic distance sensor
 *    HC-SR501 PIR motion sensor
 *    NEO-M8 GPS module (UART)
 *    Common-anode RGB LED driven by 3x logic-level N-channel MOSFETs
 *
 *  Wiring, NodeMCU label -> ESP8266 GPIO
 *  -------------------------------------
 *    DHT22 VCC        -> 3V3
 *    DHT22 DATA       -> D4  / GPIO2   (plus 10k pull-up to 3V3)
 *    DHT22 GND        -> GND
 *
 *    HC-SR04 VCC      -> VIN / 5V
 *    HC-SR04 TRIG     -> D3  / GPIO0   (plus 10k pull-up to 3V3)
 *    HC-SR04 ECHO     -> D2  / GPIO4   (1k series + 2k to GND divider)
 *    HC-SR04 GND      -> GND
 *
 *    PIR VCC          -> VIN / 5V
 *    PIR OUT          -> D0  / GPIO16
 *    PIR GND          -> GND
 *
 *    GPS VCC          -> VIN / 5V (or 3V3 only if the module is 3.3V-only)
 *    GPS TX           -> D6  / GPIO12  (this is the ESP software-serial RX)
 *    GPS RX           -> D7  / GPIO13  (this is the ESP software-serial TX)
 *    GPS GND          -> GND
 *
 *    RGB common anode -> external +5V
 *    RGB R channel    -> MOSFET drain; gate -> D1 / GPIO5  via 100R
 *    RGB G channel    -> MOSFET drain; gate -> D5 / GPIO14 via 100R
 *    RGB B channel    -> MOSFET drain; gate -> D8 / GPIO15 via 100R
 *    Every MOSFET gate -> 10k to GND (keeps the LED off during boot)
 *    Every MOSFET source -> GND (common ground with the NodeMCU)
 *
 *  ESP8266 boot-pin rules used here
 *  --------------------------------
 *    - D3 / GPIO0 must be HIGH at boot. The 10k TRIG pull-up does that.
 *    - D8 / GPIO15 must be LOW at boot. The 10k gate pulldown does that.
 *    - D4 / GPIO2 must be HIGH at boot. The 10k DHT pull-up does that.
 *    - D0 / GPIO16 has no PWM, so it is used only for the PIR input.
 *
 *  Serial monitor
 *  --------------
 *    115200 baud. You should see DIST, DHT, PIR and GPS lines.
 *    GPS chars=0 means no serial characters arrived at all (wiring/baud),
 *    not simply "no satellite fix".
 *
 *  Libraries
 *  ---------
 *    DHT sensor library (Adafruit) + Adafruit Unified Sensor
 *    TinyGPSPlus
 *    SoftwareSerial (bundled with the ESP8266 core)
 * ============================================================================
 */

#include <DHT.h>
#include <SoftwareSerial.h>
#include <TinyGPSPlus.h>

// ---------------------------------------------------------------------------
// Pin map. The number is the ESP8266 GPIO number, not the NodeMCU label.
// Keeping all pins in one place makes rewiring a one-line change.
// ---------------------------------------------------------------------------
const uint8_t PIN_DHT = 2;       // D4  / GPIO2  - DHT22 data, needs 10k pull-up
const uint8_t PIN_TRIG = 0;      // D3  / GPIO0  - HC-SR04 trigger, needs 10k pull-up
const uint8_t PIN_ECHO = 4;      // D2  / GPIO4  - HC-SR04 echo, must use 1k/2k divider
const uint8_t PIN_PIR = 16;      // D0  / GPIO16 - PIR output (input only, no PWM)
const uint8_t PIN_GPS_RX = 12;   // D6  / GPIO12 - ESP receives GPS TX here
const uint8_t PIN_GPS_TX = 13;   // D7  / GPIO13 - ESP transmits to GPS RX here
const uint8_t PIN_RGB_R = 5;     // D1  / GPIO5  - red MOSFET gate
const uint8_t PIN_RGB_G = 14;    // D5  / GPIO14 - green MOSFET gate
const uint8_t PIN_RGB_B = 15;    // D8  / GPIO15 - blue MOSFET gate

// Set this to false if the RGB is not wired yet. Sensors keep working.
const bool TEST_RGB = true;

// Sentinel used when the ultrasonic reading is out of range (>400 cm).
// It is deliberately different from 0 because 0 means "blocked / no echo"
// and must show the critical red colour.
const uint16_t DIST_INVALID = 999;

// ---------------------------------------------------------------------------
// Library objects
// ---------------------------------------------------------------------------
// DHT22 on PIN_DHT; the second argument selects the sensor model.
DHT dht(PIN_DHT, DHT22);

// Software serial for GPS. The first argument is the ESP RX pin, the second
// is the ESP TX pin. GPS module TX must go to GPIO12, GPS RX to GPIO13.
SoftwareSerial gpsSerial(PIN_GPS_RX, PIN_GPS_TX);

// TinyGPSPlus parses NMEA sentences one character at a time.
TinyGPSPlus gps;

// ---------------------------------------------------------------------------
// readOnceCm()
// ---------------------------------------------------------------------------
// Sends one 10 microsecond trigger pulse to the HC-SR04, then measures how
// long the ECHO pin stays HIGH. Sound travels 343 m/s = 0.0343 cm/us.
// The pulse travels to the object and back, so the distance is:
//
//     distance_cm = duration_us * 0.0343 / 2
//
// pulseIn() returns 0 if no echo arrives before the 25 ms timeout.
// 25 ms is about 4.3 m of round-trip travel, which is beyond the HC-SR04's
// reliable range. A return value of 0 therefore means "no usable echo".
// ---------------------------------------------------------------------------
uint16_t readOnceCm() {
  // Make sure the trigger starts from a known LOW level.
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);

  // 10 us HIGH pulse tells the HC-SR04 to send a burst.
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  // Wait for ECHO to go HIGH, then measure how long it stays HIGH.
  // 0 means the sensor saw no echo (out of range, too close, or unplugged).
  unsigned long duration = pulseIn(PIN_ECHO, HIGH, 25000UL);
  if (duration == 0) {
    return 0;
  }

  // Convert microseconds to centimetres, then divide by 2 for the round trip.
  return (uint16_t)(duration * 0.0343 / 2.0);
}

// ---------------------------------------------------------------------------
// median3()
// ---------------------------------------------------------------------------
// Returns the middle value of three readings. A median filter removes a
// single wild reading (for example a 0 from a missed echo or a 400 from a
// reflection) without slowing the loop down like an average would.
//
// The three if-statements are a tiny sorting network: after them,
// a <= b <= c and the middle value is simply b.
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
// readDistanceCm()
// ---------------------------------------------------------------------------
// Takes three readings and keeps the median. This is called every 300 ms.
//
// Return values:
//   DIST_INVALID (999) -> more than 400 cm, treat as "no target" and turn RGB off
//   0                  -> no echo / object touching the sensor, treat as CRITICAL
//   1..400             -> valid distance in centimetres
//
// Note: the HC-SR04 cannot report a true 0 cm; 0 is what pulseIn() returns
// when no echo comes back. For this project "no echo" is safest as a red
// critical alert, because the object may be too close or the sensor blocked.
// ---------------------------------------------------------------------------
uint16_t readDistanceCm() {
  uint16_t a = readOnceCm();
  uint16_t b = readOnceCm();
  uint16_t c = readOnceCm();

  uint16_t m = median3(a, b, c);

  // Beyond the useful range of the sensor: not a target, so mark invalid.
  if (m > 400) {
    return DIST_INVALID;
  }

  // 0 is intentionally returned as-is: applyZone() turns it red.
  return m;
}

// ---------------------------------------------------------------------------
// setColor()
// ---------------------------------------------------------------------------
// Writes PWM values to the three MOSFET gates.
//
//   0   = channel fully off
//   255 = channel fully on (100% duty cycle)
//
// This assumes a common-anode RGB with a low-side N-channel MOSFET:
// pulling a gate HIGH turns that colour ON. If your LED is common-cathode,
// or if the colours are inverted, fix the wiring before trusting this code.
//
// TEST_RGB lets you disable the LED section without touching the rest.
// ---------------------------------------------------------------------------
void setColor(uint8_t r, uint8_t g, uint8_t b) {
  if (!TEST_RGB) {
    return;
  }
  analogWrite(PIN_RGB_R, r);
  analogWrite(PIN_RGB_G, g);
  analogWrite(PIN_RGB_B, b);
}

// ---------------------------------------------------------------------------
// applyZone()
// ---------------------------------------------------------------------------
// Converts a distance into the same alert colours used by board 2.
// Board 1 will later send the zone number over ESP-NOW so both RGB LEDs
// always show the same state.
//
//   Distance        Colour          Meaning
//   ---------------------------------------------------------------------
//   > 120 cm        green           SAFE
//   60 - 120 cm     yellow          WATCH
//   30 - 60 cm      orange          WARN
//   10 - 30 cm      red-orange      CLOSE
//   0 - 10 cm       red             CRITICAL
//   0 cm (no echo)  red             blockages are treated as CRITICAL
//   > 400 cm        off             no target / out of range
//
// The comparisons use ">" so the boundary value belongs to the safer zone
// (for example exactly 120 cm is still WATCH, not SAFE).
// ---------------------------------------------------------------------------
void applyZone(uint16_t cm) {
  // Out of range: no target, turn the LED off so it does not cry wolf.
  if (cm == DIST_INVALID) {
    setColor(0, 0, 0);
    return;
  }

  // A zero reading means no echo came back or something is touching the
  // sensor. Treat it as the most dangerous case, not as "no reading".
  if (cm == 0) {
    setColor(255, 0, 0);
    return;
  }

  if (cm > 120) {
    setColor(0, 255, 0);        // SAFE       - green
  } else if (cm > 60) {
    setColor(255, 255, 0);      // WATCH      - yellow
  } else if (cm > 30) {
    setColor(255, 128, 0);      // WARN       - orange
  } else if (cm > 10) {
    setColor(255, 40, 0);       // CLOSE      - red-orange
  } else {
    setColor(255, 0, 0);        // CRITICAL   - red
  }
}

// ---------------------------------------------------------------------------
// setup()
// ---------------------------------------------------------------------------
// Runs once after reset. Initialises serial ports and pin directions, then
// performs a visible RGB self-test so wiring mistakes are obvious.
// ---------------------------------------------------------------------------
void setup() {
  // USB serial monitor. 115200 is also the upload speed used by the IDE.
  Serial.begin(115200);

  // NEO-M8 default baud rate. If the GPS output is garbage or empty, try
  // 38400 or 115200 with the gps_probe sketch.
  gpsSerial.begin(9600);

  // Start the DHT library; this configures the data pin internally.
  dht.begin();

  // Trigger is an output; echo, PIR are inputs.
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_PIR, INPUT);

  // The three MOSFET gates are PWM outputs.
  pinMode(PIN_RGB_R, OUTPUT);
  pinMode(PIN_RGB_G, OUTPUT);
  pinMode(PIN_RGB_B, OUTPUT);

  // Keep the trigger line quiet between measurements.
  digitalWrite(PIN_TRIG, LOW);

  Serial.println();
  Serial.println("BOARD1 SENSOR TEST");
  Serial.println("DHT=D4 TRIG=D3 ECHO=D2 PIR=D0 GPS=D6/D7 RGB=D1/D5/D8");

  // RGB self-test: red -> green -> blue -> white -> off.
  // If the order is wrong, the channel wires or the pin constants are wrong.
  setColor(255, 0, 0);
  delay(400);
  setColor(0, 255, 0);
  delay(400);
  setColor(0, 0, 255);
  delay(400);
  setColor(255, 255, 255);
  delay(400);
  setColor(0, 0, 0);
}

// ---------------------------------------------------------------------------
// loop()
// ---------------------------------------------------------------------------
// Runs forever. Each sensor has its own timer so one slow sensor (DHT) does
// not block the others. The loop itself is fast and non-blocking.
// ---------------------------------------------------------------------------
void loop() {
  // "static" means these variables keep their value between loop() calls.
  // lastDistance/lastDht/lastGps store the last time each task ran.
  // lastMotion starts at -1 so the first PIR read always prints a line.
  static unsigned long lastDistance = 0;
  static unsigned long lastDht = 0;
  static unsigned long lastGps = 0;
  static int lastMotion = -1;

  // Feed every received GPS character into TinyGPSPlus. This must run
  // often, because the GPS sends a continuous stream of NMEA sentences.
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  unsigned long now = millis();

  // ---- Ultrasonic every 300 ms -----------------------------------------
  // Three pings take roughly 3 x 30 ms, so 300 ms is a safe period.
  // Each result updates the RGB immediately.
  if (now - lastDistance >= 300) {
    lastDistance = now;
    uint16_t cm = readDistanceCm();
    applyZone(cm);

    Serial.print("DIST cm=");
    if (cm == DIST_INVALID) {
      Serial.println("invalid");
    } else {
      Serial.println(cm);
    }
  }

  // ---- DHT22 every 2 seconds -------------------------------------------
  // The DHT22 needs at least 2 s between samples. The library blocks
  // interrupts for a few milliseconds while reading, which is normal.
  if (now - lastDht >= 2000) {
    lastDht = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (isnan(t) || isnan(h)) {
      // NaN usually means bad wiring, missing pull-up, or too-frequent reads.
      Serial.println("DHT read failed");
    } else {
      Serial.print("DHT T=");
      Serial.print(t, 1);
      Serial.print("C H=");
      Serial.print(h, 1);
      Serial.println("%");
    }
  }

  // ---- PIR -------------------------------------------------------------
  // Polling is enough; GPIO16 does not support interrupts. Print only when
  // the state changes so the serial log is not flooded.
  int motion = digitalRead(PIN_PIR);
  if (motion != lastMotion) {
    lastMotion = motion;
    Serial.print("PIR ");
    Serial.println(motion ? "MOTION" : "CLEAR");
  }

  // ---- GPS status every second -----------------------------------------
  // charsProcessed() is the total number of characters TinyGPSPlus has seen.
  // If it stays 0, no serial data is arriving: check GPS TX -> D6, power,
  // ground, and baud rate. It does not mean "waiting for satellites".
  if (now - lastGps >= 1000) {
    lastGps = now;

    Serial.print("GPS chars=");
    Serial.print(gps.charsProcessed());

    Serial.print(" sats=");
    Serial.print(gps.satellites.value());

    Serial.print(" fix=");
    Serial.print(gps.location.isValid() ? 1 : 0);

    // Only print coordinates when the module says the fix is valid.
    if (gps.location.isValid()) {
      Serial.print(" lat=");
      Serial.print(gps.location.lat(), 6);
      Serial.print(" lon=");
      Serial.print(gps.location.lng(), 6);
    }

    Serial.println();
  }
}
