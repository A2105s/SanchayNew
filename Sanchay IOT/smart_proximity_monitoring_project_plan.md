# Smart Proximity and Environmental Monitoring System

## Project Overview

The project is an ESP8266-based monitoring and alert system that
demonstrates live readings from multiple sensors and provides visual and
audible feedback when an object approaches.

The system will use two ESP8266 boards and a 0.96-inch OLED screen. One
screen will display the sensor readings, while an RGB light and buzzer
will indicate how close an object is.

## Components

1.  1 × Buzzer
2.  1 × HC-SR501 PIR motion sensor
3.  1 × NEO-M8 GPS module
4.  1 × RGB bulb/light with four wires (red, black, blue and green)
5.  1 × HC-SR04 ultrasonic distance sensor
6.  1 × DHT22 temperature and humidity sensor
7.  2 × ESP8266 development boards (NodeMCU)
8.  1 × 0.96-inch OLED display

## Main Objectives and Behaviour

### 1. OLED Display

The 0.96-inch OLED display will show live readings and status
information, including:

-   Temperature from the DHT22 sensor.
-   Humidity from the DHT22 sensor.
-   Distance measured by the HC-SR04 ultrasonic sensor.
-   Motion detection status from the HC-SR501 PIR sensor.
-   GPS information from the NEO-M8 module, including location
    coordinates when a GPS fix is available.

### 2. Distance-Based RGB Light

The ultrasonic sensor will continuously measure the distance between the
system and a nearby object.

The RGB light will indicate the object's proximity:

-   **Green:** Object is at a safe distance.
-   **Intermediate colour(s):** Object is getting closer.
-   **Red:** Object has crossed the configured close-distance threshold.

The colour should change according to the measured distance.

### 3. Distance-Based Buzzer Alert

The buzzer will provide an audible proximity warning:

-   At a safe distance, the buzzer remains silent.
-   As an object approaches, the buzzer beeps intermittently.
-   The beep interval becomes shorter as the object gets closer.
-   At a critical distance, the buzzer can provide a continuous or rapid
    alert.

### 4. Motion Detection

The HC-SR501 PIR sensor will detect movement and its status will be
shown on the OLED display.

### 5. GPS

The NEO-M8 GPS module will provide location information. The display
should indicate whether a GPS fix is available and show coordinates once
the module has acquired a valid fix.

## Role of the Two ESP8266 Boards

The project has two ESP8266 boards. Their exact division of
responsibilities and communication method will be finalized during
implementation.

A possible arrangement is:

-   **ESP8266 #1 --- Sensor controller:** Reads the ultrasonic sensor,
    PIR sensor, DHT22 and GPS module.
-   **ESP8266 #2 --- Display and alert controller:** Updates the OLED
    display and controls the RGB light and buzzer.

The two boards can exchange sensor readings wirelessly, for example
using ESP-NOW.

## Expected Demonstration

During the demonstration:

1.  The OLED continuously displays temperature, humidity, distance, PIR
    status and GPS status/location.
2.  When an object approaches the ultrasonic sensor, the RGB light
    changes progressively from green through intermediate colours to
    red.
3.  The buzzer begins beeping as the object enters the warning range.
4.  The buzzer beeps faster as the object gets closer.
5.  The PIR sensor independently reports detected motion on the display.
6.  GPS coordinates are displayed when a valid satellite fix is
    available.

## Implementation Notes

-   Distance thresholds and buzzer intervals will be configurable in
    software.
-   The RGB light's voltage, wiring and common-anode/common-cathode
    configuration must be identified before connecting it.
-   The HC-SR04 ECHO output must be reduced to a safe 3.3 V logic level
    before connecting it to an ESP8266 GPIO.
-   Each component should be tested individually before integrating the
    complete system.
-   Power requirements and driver circuits must be checked before
    connecting the RGB light and buzzer.
