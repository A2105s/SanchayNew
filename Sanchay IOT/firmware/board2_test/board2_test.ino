/*
 * ============================================================================
 *  BOARD 2 - DISPLAY AND ALERT NODE TEST SKETCH
 * ============================================================================
 *
 *  Boards: NodeMCU 1.0 (ESP-12E Module), ESP8266 core 3.1.2
 *  Purpose: Prove the OLED, RGB LED and buzzer work before adding ESP-NOW.
 *
 *  Hardware connected to this board
 *  --------------------------------
 *    0.96" 128x64 SSD1306 OLED, 7-pin SPI version
 *    Active buzzer
 *    Common-anode RGB LED driven by 3x logic-level N-channel MOSFETs
 *
 *  Wiring, NodeMCU label -> ESP8266 GPIO
 *  -------------------------------------
 *    OLED GND         -> GND
 *    OLED VCC         -> 3V3
 *    OLED D0 / SCK    -> D1  / GPIO5
 *    OLED D1 / MOSI   -> D2  / GPIO4
 *    OLED CS          -> D3  / GPIO0   (plus 10k pull-up to 3V3)
 *    OLED RES         -> D4  / GPIO2   (plus 10k pull-up to 3V3)
 *    OLED DC          -> D8  / GPIO15
 *
 *    Buzzer +         -> D0  / GPIO16
 *    Buzzer -         -> GND
 *
 *    RGB common anode -> external +5V
 *    RGB R channel    -> MOSFET drain; gate -> D5 / GPIO14 via 100R
 *    RGB G channel    -> MOSFET drain; gate -> D6 / GPIO12 via 100R
 *    RGB B channel    -> MOSFET drain; gate -> D7 / GPIO13 via 100R
 *    Every MOSFET gate -> 10k to GND
 *    Every MOSFET source -> GND (common ground with the NodeMCU)
 *
 *  Important warnings
 *  ------------------
 *    - The OLED pins labelled D0 and D1 are NOT the NodeMCU pins D0 and D1.
 *      OLED D0 is the clock and goes to NodeMCU D1. OLED D1 is data and goes
 *      to NodeMCU D2.
 *    - D3 / GPIO0 must be HIGH at boot, hence the 10k CS pull-up.
 *    - D4 / GPIO2 must be HIGH at boot, hence the 10k RES pull-up.
 *    - D8 / GPIO15 must be LOW at boot, which the OLED DC pin tolerates.
 *    - The buzzer is wired directly to D0. That is safe only for an active
 *      3.3V buzzer that draws 10 mA or less. A louder 5V buzzer needs a
 *      transistor driver; otherwise it may damage the ESP pin.
 *
 *  Serial monitor
 *  --------------
 *    115200 baud. The sketch prints each zone and RGB value it tests.
 *
 *  Libraries
 *  ---------
 *    Adafruit SSD1306
 *    Adafruit GFX
 * ============================================================================
 */

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------------------------------------------------------------------------
// Display geometry
// ---------------------------------------------------------------------------
const int SCREEN_WIDTH = 128;
const int SCREEN_HEIGHT = 64;

// ---------------------------------------------------------------------------
// Pin map. The number is the ESP8266 GPIO number, not the NodeMCU label.
// ---------------------------------------------------------------------------
const uint8_t PIN_OLED_SCK = 5;     // D1 / GPIO5  - OLED SPI clock
const uint8_t PIN_OLED_MOSI = 4;    // D2 / GPIO4  - OLED SPI data
const uint8_t PIN_OLED_CS = 0;      // D3 / GPIO0  - OLED chip select, 10k pull-up
const uint8_t PIN_OLED_RES = 2;     // D4 / GPIO2  - OLED reset, 10k pull-up
const uint8_t PIN_OLED_DC = 15;     // D8 / GPIO15 - OLED data/command select
const uint8_t PIN_BUZZER = 16;      // D0 / GPIO16 - active buzzer (no PWM)
const uint8_t PIN_RGB_R = 14;       // D5 / GPIO14 - red MOSFET gate
const uint8_t PIN_RGB_G = 12;       // D6 / GPIO12 - green MOSFET gate
const uint8_t PIN_RGB_B = 13;       // D7 / GPIO13 - blue MOSFET gate

// ---------------------------------------------------------------------------
// SSD1306 display object
// ---------------------------------------------------------------------------
// This is the SOFTWARE SPI constructor. The argument order is important:
//
//     Adafruit_SSD1306(width, height, mosi, clk, dc, rst, cs)
//
// The OLED is a 7-pin SPI module, not an I2C module. Do not use the I2C
// constructor and do not connect it to the I2C pins.
// ---------------------------------------------------------------------------
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT,
                         PIN_OLED_MOSI, PIN_OLED_SCK,
                         PIN_OLED_DC, PIN_OLED_RES, PIN_OLED_CS);

// ---------------------------------------------------------------------------
// setColor()
// ---------------------------------------------------------------------------
// PWM values for the three MOSFET gates:
//   0   = off
//   255 = full brightness
//
// Assumes a common-anode RGB with low-side N-channel MOSFETs, so a HIGH gate
// turns that colour ON. If the colours are inverted, check the common wire
// polarity and the MOSFET wiring.
// ---------------------------------------------------------------------------
void setColor(uint8_t r, uint8_t g, uint8_t b) {
  analogWrite(PIN_RGB_R, r);
  analogWrite(PIN_RGB_G, g);
  analogWrite(PIN_RGB_B, b);
}

// ---------------------------------------------------------------------------
// showStatus()
// ---------------------------------------------------------------------------
// Draws a simple status screen on the OLED:
//   - which zone is being simulated
//   - the RGB values being sent to the LED
//   - the buzzer pattern name
//   - the wiring reminder
//
// display.display() is the call that actually pushes the buffer to the panel;
// without it the screen stays unchanged.
// ---------------------------------------------------------------------------
void showStatus(const char *zone, uint8_t r, uint8_t g, uint8_t b, const char *beep) {
  display.clearDisplay();                 // clear the internal pixel buffer
  display.setTextSize(1);                 // 6x8 pixel characters
  display.setTextColor(SSD1306_WHITE);    // monochrome panel: on or off
  display.setCursor(0, 0);                // top-left corner
  display.println("BOARD 2 TEST");
  display.println("OLED OK");
  display.print("ZONE: ");
  display.println(zone);
  display.print("RGB : ");
  display.print(r);
  display.print(",");
  display.print(g);
  display.print(",");
  display.println(b);
  display.print("BEEP: ");
  display.println(beep);
  display.println("D0 BZ D5/6/7 RGB");
  display.display();                      // send the buffer to the OLED
}

// ---------------------------------------------------------------------------
// beepPattern()
// ---------------------------------------------------------------------------
// Repeats an on/off buzzer pattern until totalMs has elapsed.
// Example: beepPattern(100, 900, 1500) is a 1 Hz beep for 1.5 seconds.
//
// This function uses delay(), so it blocks the CPU. That is fine for this
// wiring test. The final firmware should use millis() timing instead so the
// ESP-NOW link and display never pause.
// ---------------------------------------------------------------------------
void beepPattern(uint16_t onMs, uint16_t offMs, uint16_t totalMs) {
  unsigned long start = millis();

  while (millis() - start < totalMs) {
    digitalWrite(PIN_BUZZER, HIGH);   // active buzzer sounds
    delay(onMs);
    digitalWrite(PIN_BUZZER, LOW);    // active buzzer silent
    delay(offMs);
  }

  // Always leave the buzzer off when the pattern ends.
  digitalWrite(PIN_BUZZER, LOW);
}

// ---------------------------------------------------------------------------
// beepContinuous()
// ---------------------------------------------------------------------------
// Holds the buzzer on for totalMs, then turns it off. Used for the CRITICAL
// zone. This is blocking, which is acceptable in this test sketch.
// ---------------------------------------------------------------------------
void beepContinuous(uint16_t totalMs) {
  digitalWrite(PIN_BUZZER, HIGH);
  delay(totalMs);
  digitalWrite(PIN_BUZZER, LOW);
}

// ---------------------------------------------------------------------------
// runStep()
// ---------------------------------------------------------------------------
// Runs one zone test:
//   1. prints the zone and RGB values to the serial monitor
//   2. updates the OLED
//   3. sets the RGB LED
//   4. plays the buzzer pattern
//   5. waits 500 ms before the next step
//
// totalMs == 0 means silent. offMs == 0 with totalMs > 0 means continuous.
// ---------------------------------------------------------------------------
void runStep(const char *zone, uint8_t r, uint8_t g, uint8_t b,
             uint16_t onMs, uint16_t offMs, uint16_t totalMs, const char *beepLabel) {
  Serial.print("ZONE ");
  Serial.print(zone);
  Serial.print(" RGB ");
  Serial.print(r);
  Serial.print(",");
  Serial.print(g);
  Serial.print(",");
  Serial.println(b);

  showStatus(zone, r, g, b, beepLabel);
  setColor(r, g, b);

  if (totalMs > 0) {
    if (offMs == 0) {
      beepContinuous(totalMs);        // continuous tone
    } else {
      beepPattern(onMs, offMs, totalMs); // pulsed tone
    }
  } else {
    digitalWrite(PIN_BUZZER, LOW);    // silent zone
  }

  delay(500);                         // small pause so the colour is visible
}

// ---------------------------------------------------------------------------
// setup()
// ---------------------------------------------------------------------------
// Runs once after reset. It sets pin directions, initialises the OLED, shows
// the wiring page for two seconds, then runs RGB and buzzer self-tests.
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  // Buzzer first: drive it LOW before making it an output so it cannot
  // chirp during boot.
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  // RGB MOSFET gates are PWM outputs; start with all channels off.
  pinMode(PIN_RGB_R, OUTPUT);
  pinMode(PIN_RGB_G, OUTPUT);
  pinMode(PIN_RGB_B, OUTPUT);
  setColor(0, 0, 0);

  Serial.println();
  Serial.println("BOARD2 TEST");
  Serial.println("OLED D1/D2/D3/D4/D8 BZ D0 RGB D5/D6/D7");

  // SSD1306_SWITCHCAPVCC enables the display's internal charge pump.
  // If the panel stays blank, check the 7-pin wiring first, then try
  // SSD1306_EXTERNALVCC if your module expects an external VCC.
  if (!display.begin(SSD1306_SWITCHCAPVCC)) {
    Serial.println("OLED init failed");
    while (true) {
      delay(1000);                    // stop here so the error is obvious
    }
  }

  // Static wiring page. If this text appears, SPI and the OLED are working.
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("BOARD 2 TEST");
  display.println("OLED OK");
  display.println("CLK D1  MOSI D2");
  display.println("CS D3   RES D4");
  display.println("DC D8");
  display.println("BZ D0");
  display.println("RGB D5 D6 D7");
  display.display();
  delay(2000);

  // RGB colour sweep. Each colour should be pure; if red and green are
  // swapped, the channel wiring or the PIN_RGB_* constants are wrong.
  const char *colors[] = {"RED", "GREEN", "BLUE", "WHITE"};
  const uint8_t rgb[][3] = {{255, 0, 0}, {0, 255, 0}, {0, 0, 255}, {255, 255, 255}};

  for (uint8_t i = 0; i < 4; i++) {
    Serial.print("RGB ");
    Serial.println(colors[i]);
    showStatus(colors[i], rgb[i][0], rgb[i][1], rgb[i][2], "off");
    setColor(rgb[i][0], rgb[i][1], rgb[i][2]);
    delay(600);
  }
  setColor(0, 0, 0);

  // Buzzer self-test: three short beeps, then one continuous beep.
  Serial.println("BUZZER 3 short beeps");
  showStatus("BUZZER", 0, 0, 0, "3 short");
  beepPattern(120, 180, 900);

  Serial.println("BUZZER continuous 500 ms");
  beepContinuous(500);
}

// ---------------------------------------------------------------------------
// loop()
// ---------------------------------------------------------------------------
// Repeats the five alert zones forever so you can compare the OLED, RGB and
// buzzer. In the final firmware this loop will instead read the zone from the
// ESP-NOW packet sent by board 1; the colours and beep rates stay the same.
//
//   SAFE      green       silent
//   WATCH     yellow      1 beep per second
//   WARN      orange      about 3 beeps per second
//   CLOSE     red-orange  fast beeps
//   CRITICAL  red         continuous
// ---------------------------------------------------------------------------
void loop() {
  runStep("SAFE", 0, 255, 0, 0, 0, 0, "silent");
  runStep("WATCH", 255, 255, 0, 100, 900, 1500, "1 Hz");
  runStep("WARN", 255, 128, 0, 100, 250, 1500, "3 Hz");
  runStep("CLOSE", 255, 40, 0, 80, 80, 1500, "fast");
  runStep("CRITICAL", 255, 0, 0, 0, 0, 1500, "continuous");
}
