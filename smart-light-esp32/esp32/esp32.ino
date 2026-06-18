#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <BH1750.h>
#include "config.h"

// ═══════════════════════════════════════════════
// DEBUG — Set ke false untuk production (hemat Serial)
// ═══════════════════════════════════════════════
#define DEBUG true
#define DEBUG_SENSOR false    // Log sensor setiap 500ms (verbose)
#define DEBUG_LAMPU true      // Log perubahan PWM
#define DEBUG_NETWORK true    // Log HTTP request/response
#define DEBUG_INTERVAL 1000   // Interval log sensor (ms)

String apiDataUrl;
String apiControlUrl;
String apiAckUrl;
String apiSettingsUrl;

#define PIN_TRIG 11
#define PIN_ECHO 12
#define SDA_PIN  1
#define SCL_PIN  2
#define PIN_SWITCH 21

#define TRIG_HIGH digitalWrite(PIN_TRIG, HIGH)
#define TRIG_LOW  digitalWrite(PIN_TRIG, LOW)
#define ECHO_READ digitalRead(PIN_ECHO)
#define SWITCH_READ digitalRead(PIN_SWITCH)

struct Lampu {
  String zone;
  int pin;
  bool manualMode;
  bool isON;
  int pwmLevel;
  String trigger;
  String kondisi;
  int failCount;
};

Lampu lampu[4] = {
  {"A", 17, false, false, 0, "AUTO", "MATI", 0},
  {"B", 5,  false, false, 0, "AUTO", "MATI", 0},
  {"C", 15, false, false, 0, "AUTO", "MATI", 0},
  {"D", 7,  false, false, 0, "AUTO", "MATI", 0}
};

Adafruit_INA219 ina219;
BH1750 lightMeter;
bool inaReady = false;
bool bhReady = false;

unsigned long now = 0;
unsigned long lastSensorRead = 0;
unsigned long lastUltraTrigger = 0;
unsigned long lastLuxRead = 0;
unsigned long lastInaRead = 0;
unsigned long lastSwitchRead = 0;
unsigned long lastSend = 0;
unsigned long lastControl = 0;
unsigned long lastSettingsFetch = 0;
unsigned long lastDebugLog = 0;

float currentLux = 0;
float currentJarak = 999.0;
float currentV = 0;
float currentmA = 0;
bool tombolDitekan = false;

volatile unsigned long echoStart = 0;
volatile unsigned long echoEnd = 0;
volatile bool echoDone = false;
float lastJarak = 999.0;
bool waitingEcho = false;
unsigned long echoTimeout = 0;

float luxThreshold = 100.0;
int delayUltrasonik = 15;

unsigned long lastGerakanTime[4] = {0, 0, 0, 0};

bool lastAdaOrang = false;
unsigned long lastOrangTime = 0;
#define ORANG_HYSTERESIS 100

// Track perubahan untuk log
int lastPwmLevel[4] = {-1, -1, -1, -1};
String lastTrigger[4] = {"", "", "", ""};
bool lastSwitchState = false;

void IRAM_ATTR echoISR() {
  if (ECHO_READ == HIGH) {
    echoStart = micros();
  } else {
    echoEnd = micros();
    echoDone = true;
  }
}

// ═══════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("╔══════════════════════════════════════════╗");
  Serial.println("║     SMART LIGHTING SYSTEM v2.0           ║");
  Serial.println("║     UB Adaptive — ESP32 Firmware         ║");
  Serial.println("╚══════════════════════════════════════════╝");
  Serial.println();

  // ── GPIO Init ──
  Serial.println("[INIT] GPIO Pin Setup...");
  for (int i = 0; i < 4; i++) {
    pinMode(lampu[i].pin, OUTPUT);
    analogWrite(lampu[i].pin, 0);
    Serial.printf("  Zone %s → Pin %d (PWM)\n", lampu[i].zone.c_str(), lampu[i].pin);
  }
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_SWITCH, INPUT_PULLUP);
  Serial.printf("  Ultrasonic TRIG → Pin %d\n", PIN_TRIG);
  Serial.printf("  Ultrasonic ECHO → Pin %d (Interrupt)\n", PIN_ECHO);
  Serial.printf("  Switch → Pin %d (INPUT_PULLUP)\n", PIN_SWITCH);

  attachInterrupt(digitalPinToInterrupt(PIN_ECHO), echoISR, CHANGE);
  Serial.println("[OK] GPIO & Interrupt initialized");

  // ── I2C Init ──
  Serial.println("\n[I2C] Initializing bus...");
  Serial.printf("  SDA → Pin %d\n", SDA_PIN);
  Serial.printf("  SCL → Pin %d\n", SCL_PIN);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);
  Serial.println("[OK] I2C bus ready (400kHz)");

  // ── INA219 ──
  Serial.println("\n[SENSOR] Initializing INA219 (Current/Voltage)...");
  if (ina219.begin()) {
    inaReady = true;
    ina219.setCalibration_16V_400mA();
    Serial.println("[OK] INA219 detected — Current/Voltage monitoring active");
  } else {
    Serial.println("[FAIL] INA219 not found — Current monitoring disabled");
  }

  // ── BH1750 ──
  Serial.println("\n[SENSOR] Initializing BH1750 (Light/Lux)...");
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire)) {
    bhReady = true;
    Serial.println("[OK] BH1750 detected — Lux monitoring active");
  } else {
    Serial.println("[FAIL] BH1750 not found — Lux monitoring disabled");
  }

  // ── WiFi ──
  Serial.println("\n[WIFI] Connecting...");
  Serial.printf("  SSID: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    wifiAttempts++;
    if (wifiAttempts > 40) {  // 20 detik timeout
      Serial.println("\n[ERROR] WiFi connection timeout! Restarting...");
      ESP.restart();
    }
  }
  Serial.println();
  Serial.println("[OK] WiFi Connected!");
  Serial.printf("  IP Address: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("  RSSI: %d dBm\n", WiFi.RSSI());

  // ── API URLs ──
  Serial.println("\n[API] Endpoint Configuration:");
  apiDataUrl     = String(API_BASE_URL) + "/device/data";
  apiControlUrl  = String(API_BASE_URL) + "/device/control/pending?device_id=" + DEVICE_ID;
  apiAckUrl      = String(API_BASE_URL) + "/device/control/ack";
  apiSettingsUrl = String(API_BASE_URL) + "/settings";
  Serial.printf("  Base URL: %s\n", API_BASE_URL);
  Serial.printf("  Device ID: %s\n", DEVICE_ID);
  Serial.printf("  Data: %s\n", apiDataUrl.c_str());
  Serial.printf("  Control: %s\n", apiControlUrl.c_str());
  Serial.printf("  Settings: %s\n", apiSettingsUrl.c_str());

  // ── Fetch Initial Settings ──
  Serial.println("\n[INIT] Fetching settings from server...");
  fetchSettings();

  Serial.println();
  Serial.println("╔══════════════════════════════════════════╗");
  Serial.println("║  SYSTEM READY — Starting main loop       ║");
  Serial.println("╚══════════════════════════════════════════╝");
  Serial.println();
}

// ═══════════════════════════════════════════════
// ULTRASONIC — Non-blocking
// ═══════════════════════════════════════════════
void triggerUltrasonic() {
  if (waitingEcho) return;
  echoDone = false;
  waitingEcho = true;
  echoTimeout = micros() + 25000;

  TRIG_LOW;
  delayMicroseconds(2);
  TRIG_HIGH;
  delayMicroseconds(10);
  TRIG_LOW;
}

float getJarak() {
  if (!waitingEcho) return lastJarak;

  if (echoDone) {
    unsigned long dur = echoEnd - echoStart;
    if (dur > 0 && dur < 25000) {
      lastJarak = dur * 0.034 / 2.0;
    } else {
      lastJarak = 999.0;
    }
    waitingEcho = false;
    echoDone = false;
  } else if (micros() > echoTimeout) {
    lastJarak = 999.0;
    waitingEcho = false;
  }

  return lastJarak;
}

// ═══════════════════════════════════════════════
// PWM
// ═══════════════════════════════════════════════
void setPWM(int idx, int level) {
  if (idx < 0 || idx >= 4) return;
  if (lampu[idx].pwmLevel == level) return;

  int oldLevel = lampu[idx].pwmLevel;
  lampu[idx].pwmLevel = level;
  lampu[idx].isON = (level > 0);
  analogWrite(lampu[idx].pin, level);

  if (DEBUG && DEBUG_LAMPU) {
    Serial.printf("[PWM] Zone %s: %d → %d (%s)\n",
      lampu[idx].zone.c_str(), oldLevel, level,
      level > 0 ? "NYALA" : "MATI");
  }
}

// ═══════════════════════════════════════════════
// NETWORK — Settings
// ═══════════════════════════════════════════════
void fetchSettings() {
  if (WiFi.status() != WL_CONNECTED) {
    if (DEBUG && DEBUG_NETWORK) Serial.println("[NET] Settings skipped — WiFi disconnected");
    return;
  }

  if (DEBUG && DEBUG_NETWORK) Serial.println("[NET] Fetching settings...");

  HTTPClient http;
  http.begin(apiSettingsUrl);
  http.addHeader("X-API-Key", API_KEY);
  http.setTimeout(1500);

  unsigned long t0 = millis();
  int code = http.GET();
  unsigned long dt = millis() - t0;

  if (DEBUG && DEBUG_NETWORK) {
    Serial.printf("[NET] Settings response: %d (%lums)\n", code, dt);
  }

  if (code == 200) {
    String response = http.getString();
    if (DEBUG && DEBUG_NETWORK) Serial.printf("[NET] Settings payload: %s\n", response.c_str());

    DynamicJsonDocument doc(1024);
    if (!deserializeJson(doc, response)) {
      JsonObject obj = doc.as<JsonObject>();
      if (obj.containsKey("lux_threshold")) {
        float v = obj["lux_threshold"].as<float>();
        if (v != luxThreshold) {
          Serial.printf("[SET] Lux Threshold: %.0f → %.0f lux\n", luxThreshold, v);
          luxThreshold = v;
        }
      }
      if (obj.containsKey("pir_delay")) {
        int d = obj["pir_delay"].as<int>();
        if (d != delayUltrasonik) {
          Serial.printf("[SET] Delay Ultrasonik: %d → %d detik\n", delayUltrasonik, d);
          delayUltrasonik = d;
        }
      }
    } else {
      Serial.println("[ERROR] Settings JSON parse failed!");
    }
  } else {
    Serial.printf("[ERROR] Settings fetch failed: HTTP %d\n", code);
  }
  http.end();
}

// ═══════════════════════════════════════════════
// NETWORK — Control Commands
// ═══════════════════════════════════════════════
void fetchControl() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(apiControlUrl);
  http.addHeader("X-API-Key", API_KEY);
  http.setTimeout(1000);

  unsigned long t0 = millis();
  int code = http.GET();
  unsigned long dt = millis() - t0;

  if (DEBUG && DEBUG_NETWORK) {
    Serial.printf("[NET] Control poll: HTTP %d (%lums)\n", code, dt);
  }

  if (code == 200) {
    String response = http.getString();
    DynamicJsonDocument doc(2048);
    if (!deserializeJson(doc, response)) {
      JsonArray arr = doc.as<JsonArray>();

      if (arr.size() > 0) {
        Serial.printf("[CMD] Received %d command(s)!\n", arr.size());
      }

      for (JsonObject cmd : arr) {
        String zone = cmd["zone"].as<String>();
        String action = cmd["action"].as<String>();
        int id = cmd["id"].as<int>();

        Serial.printf("[CMD] → Zone %s: %s (id=%d)\n", zone.c_str(), action.c_str(), id);

        for (int i = 0; i < 4; i++) {
          if (lampu[i].zone == zone) {
            if (action == "ON" || action == "EMERGENCY") {
              lampu[i].manualMode = true;
              setPWM(i, 255);
              lampu[i].trigger = "REMOTE ON";
              lampu[i].kondisi = "NYALA MANUAL";
              Serial.printf("[CMD] Zone %s: PWM 255 (MANUAL ON)\n", zone.c_str());
            } else if (action == "OFF") {
              lampu[i].manualMode = true;
              setPWM(i, 0);
              lampu[i].trigger = "REMOTE OFF";
              lampu[i].kondisi = "MATI MANUAL";
              Serial.printf("[CMD] Zone %s: PWM 0 (MANUAL OFF)\n", zone.c_str());
            } else if (action == "AUTO") {
              lampu[i].manualMode = false;
              Serial.printf("[CMD] Zone %s: AUTO mode restored\n", zone.c_str());
            }
          }
        }

        // ACK
        HTTPClient ack;
        ack.begin(apiAckUrl);
        ack.addHeader("Content-Type", "application/json");
        ack.addHeader("X-API-Key", API_KEY);
        ack.setTimeout(500);
        int ackCode = ack.POST("{\"ids\":[" + String(id) + "]}");
        if (DEBUG && DEBUG_NETWORK) {
          Serial.printf("[CMD] ACK id=%d: HTTP %d\n", id, ackCode);
        }
        ack.end();
      }
    }
  }
  http.end();
}

// ═══════════════════════════════════════════════
// NETWORK — Send Sensor Data
// ═══════════════════════════════════════════════
void sendData() {
  if (WiFi.status() != WL_CONNECTED) return;
  static int zone = 0;
  bool adaOrang = (currentJarak < 3);

  DynamicJsonDocument doc(512);
  doc["device_id"] = DEVICE_ID;
  doc["zone"] = lampu[zone].zone;
  doc["lux"] = currentLux;
  doc["jarak"] = currentJarak;
  doc["voltage"] = currentV;
  doc["current"] = lampu[zone].isON ? (currentmA / 4.0) : 0;
  doc["sedangAdaOrang"] = adaOrang;
  doc["tombol"] = tombolDitekan;

  bool masaTunggu = false;
  if (currentLux < luxThreshold) {
    unsigned long dt = (now - lastGerakanTime[zone]) / 1000;
    masaTunggu = (dt < delayUltrasonik) && !adaOrang;
  }
  doc["masihMasaTunggu"] = masaTunggu;

  if (lampu[zone].pwmLevel > 0 && currentmA < 5.0 && inaReady) {
    lampu[zone].failCount++;
    if (lampu[zone].failCount >= 30) {
      doc["kondisi"] = "RUSAK";
      doc["trigger"] = "ERROR";
    } else {
      doc["kondisi"] = lampu[zone].kondisi;
      doc["trigger"] = lampu[zone].trigger;
    }
  } else {
    lampu[zone].failCount = 0;
    doc["kondisi"] = lampu[zone].kondisi;
    doc["trigger"] = lampu[zone].trigger;
  }
  doc["powerLampu"] = lampu[zone].isON ? lampu[zone].pwmLevel : 0;

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  http.begin(apiDataUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);
  http.setTimeout(1500);

  unsigned long t0 = millis();
  int code = http.POST(payload);
  unsigned long dt = millis() - t0;

  if (DEBUG && DEBUG_NETWORK) {
    Serial.printf("[NET] Send Zone %s: HTTP %d (%lums)\n", lampu[zone].zone.c_str(), code, dt);
  }

  if (code != 200 && code != 201) {
    Serial.printf("[ERROR] Send failed for Zone %s: HTTP %d\n", lampu[zone].zone.c_str(), code);
  }

  http.end();
  zone = (zone + 1) % 4;
}

// ═══════════════════════════════════════════════
// LOOP UTAMA
// ═══════════════════════════════════════════════
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Connection lost! Reconnecting...");
    WiFi.reconnect();
    delay(1000);
    return;
  }
  now = millis();

  // ── SENSOR READ: Setiap 20ms ──
  if (now - lastSensorRead >= 20) {
    lastSensorRead = now;

    // Trigger ultrasonic tiap 30ms
    if (now - lastUltraTrigger >= 30) {
      lastUltraTrigger = now;
      triggerUltrasonic();
    }

    // Baca ultrasonic
    currentJarak = getJarak();

    // Baca switch
    tombolDitekan = (SWITCH_READ == LOW);

    // Log switch state change
    if (tombolDitekan != lastSwitchState) {
      lastSwitchState = tombolDitekan;
      Serial.printf("[SWITCH] State: %s\n", tombolDitekan ? "DITEKAN → Semua PWM 255" : "LEPAS → AUTO");
    }

    // Baca lux (50ms)
    if (bhReady && now - lastLuxRead >= 50) {
      lastLuxRead = now;
      float newLux = lightMeter.readLightLevel();
      if (newLux < 0) newLux = 0;
      currentLux = newLux;
    }

    // Baca INA219 (200ms)
    if (inaReady && now - lastInaRead >= 200) {
      lastInaRead = now;
      currentV = ina219.getBusVoltage_V();
      currentmA = ina219.getCurrent_mA();
      if (currentV < 0.1) currentV = 0;
      if (currentmA < 0) currentmA = 0;
    }

    // ── LOGIKA LAMPU ──
    bool adaOrang = (currentJarak < 3);

    // Hysteresis
    if (adaOrang) {
      lastOrangTime = now;
      lastAdaOrang = true;
    } else if (now - lastOrangTime < ORANG_HYSTERESIS) {
      adaOrang = true;
    } else {
      lastAdaOrang = false;
    }

    for (int i = 0; i < 4; i++) {
      if (tombolDitekan) {
        setPWM(i, 255);
        lampu[i].trigger = "SWITCH";
        lampu[i].kondisi = "NYALA PENUH";
        lampu[i].manualMode = false;
      } else if (lampu[i].manualMode) {
        // Mode manual
      } else {
        if (currentLux < luxThreshold) {
          if (adaOrang) lastGerakanTime[i] = now;
          unsigned long dt = (now - lastGerakanTime[i]) / 1000;
          bool tunggu = (dt < delayUltrasonik);

          if (adaOrang || tunggu) {
            setPWM(i, 255);
            lampu[i].trigger = adaOrang ? "AUTO 100%" : "TUNGGU";
            lampu[i].kondisi = "NYALA PENUH";
          } else {
            setPWM(i, 20);
            lampu[i].trigger = "AUTO 20";
            lampu[i].kondisi = "NYALA REDUP";
          }
          lampu[i].isON = true;
        } else {
          setPWM(i, 0);
          lampu[i].trigger = "TERANG";
          lampu[i].kondisi = "MATI";
        }
      }
    }

    // ── DEBUG LOG: Sensor & Status (tiap 1 detik) ──
    if (DEBUG && DEBUG_SENSOR && now - lastDebugLog >= DEBUG_INTERVAL) {
      lastDebugLog = now;

      Serial.println("┌─────────────────────────────────────────┐");
      Serial.printf("│ SENSOR │ Lux: %6.1f │ Jarak: %5.1f cm │ Switch: %s\n",
        currentLux, currentJarak, tombolDitekan ? "ON " : "OFF");
      Serial.printf("│ POWER  │ V: %5.2fV │ I: %6.1fmA     │\n", currentV, currentmA);
      Serial.printf("│ THRESH │ Lux: %.0f   │ Delay: %ds       │\n", luxThreshold, delayUltrasonik);
      Serial.println("├─────────────────────────────────────────┤");

      for (int i = 0; i < 4; i++) {
        unsigned long dt = (now - lastGerakanTime[i]) / 1000;
        Serial.printf("│ Zone %s │ PWM: %3d │ %s │ %s │ %lus ago\n",
          lampu[i].zone.c_str(),
          lampu[i].pwmLevel,
          lampu[i].kondisi.c_str(),
          lampu[i].trigger.c_str(),
          dt);
      }

      Serial.printf("│ WIFI   │ RSSI: %ddBm │ IP: %s\n",
        WiFi.RSSI(), WiFi.localIP().toString().c_str());
      Serial.printf("│ UPTIME │ %lu detik\n", now / 1000);
      Serial.println("└─────────────────────────────────────────┘");
    }
  }

  // ── NETWORK ──
  if (now - lastSettingsFetch > 30000) {
    lastSettingsFetch = now;
    fetchSettings();
  }
  if (now - lastControl > 2000) {
    lastControl = now;
    fetchControl();
  }
  if (now - lastSend > 1000) {
    lastSend = now;
    sendData();
  }
}
