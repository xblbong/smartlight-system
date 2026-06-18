#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <BH1750.h>

// ===== CONFIG =====
const char* ssid          = "KOS MUSLIMIN 2";
const char* password      = "12341234";
const char* apiDataUrl    = "https://api.munndev.my.id/api/device/data";
const char* apiControlUrl = "https://api.munndev.my.id/api/device/control/pending?device_id=ESP32-001";
const char* apiAckUrl     = "https://api.munndev.my.id/api/device/control/ack";
const char* apiSettingsUrl = "https://api.munndev.my.id/api/settings";
const char* deviceId      = "ESP32-001";

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
  
  // Konek WiFi
  Serial.print("Connecting to WiFi ");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { 
    delay(500); 
    Serial.print("."); 
  }
  Serial.println("\n[OK] WiFi Connected!");

  // Ambil settings dari server segera setelah terhubung WiFi
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
  Serial.println("\n--- MENGAMBIL SETTING DARI SERVER ---");
  Serial.printf("URL: %s\n", apiSettingsUrl);
  
  HTTPClient http;
  http.begin(apiSettingsUrl);
  http.setTimeout(3000);
  
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
  
  // 0. FETCH SETTINGS (Tiap 2 detik agar responsif)
  if (millis() - lastSettingsFetch > 2000) {
    lastSettingsFetch = millis();
    fetchSettings();
  }
  
  // 1. BACA SENSOR FISIK
  if (bhReady) {
    currentLux = lightMeter.readLightLevel();
    if (currentLux < 0) currentLux = 0;
  }
  currentJarak = bacaJarak();
  if (inaReady) {
    currentV = ina219.getBusVoltage_V();
    currentmA = ina219.getCurrent_mA();
    if (currentV < 0.1) currentV = 0;
    if (currentmA < 0) currentmA = 0;
  }
  
  bool adaOrang = (currentJarak < 3 );  // Threshold jarak 3 cm
  bool tombolDitekan = (digitalRead(PIN_SWITCH) == LOW);
  
  // // Debug switch setiap 5 detik
  // static unsigned long lastSwitchLog = 0;
  // if (millis() - lastSwitchLog > 5000) {
  //   lastSwitchLog = millis();
  //   Serial.printf("[SWITCH] Pin 19 = %d (LOW=ditekan, HIGH=lepas)\n", digitalRead(PIN_SWITCH));
  // }
  
  // // Log saat switch state berubah
  // static bool lastSwitchState = false;
  // if (tombolDitekan != lastSwitchState) {
  //   lastSwitchState = tombolDitekan;
  //   Serial.printf("[SWITCH] State changed: %s\n", tombolDitekan ? "DITEKAN (PWM 255)" : "LEPAS (AUTO)");
  // }
  
  // 2. LOGIKA LAMPU (AUTO / MANUAL / TOMBOL) & TERAPKAN KE MOSFET
  for (int i = 0; i < 4; i++) {
    if (tombolDitekan) {
      // Prioritas 1: Tombol Fisik (Nyalakan Semua 100%)
      lampu[i].pwmLevel = 255;
      lampu[i].isON = true;
      lampu[i].trigger = "SWITCH ON";
      lampu[i].kondisi = "NYALA PENUH";
      lampu[i].manualMode = false;
      setLampuZone(i, lampu[i].pwmLevel);
    } else if (lampu[i].manualMode) {
      // Prioritas 2: Kontrol Website (ON/OFF)
      setLampuZone(i, lampu[i].pwmLevel);
    } else {
      // Prioritas 3: Auto Sensor (gunakan threshold dari server)
      if (currentLux < luxThreshold) {
        // Update waktu terakhir ada gerakan
        if (adaOrang) {
          lastGerakanTime[i] = millis();
        }
        
        // Cek apakah masih dalam masa tunggu setelah gerakan terakhir
        unsigned long timeSinceLastGerakan = (millis() - lastGerakanTime[i]) / 1000;  // dalam detik
        bool masihMasaTunggu = (timeSinceLastGerakan < delayUltrasonik);
        
        if (adaOrang || masihMasaTunggu) {
          lampu[i].pwmLevel = 255; 
          lampu[i].trigger = adaOrang ? "AUTO 100%" : "AUTO 100% (TUNGGU)";
          lampu[i].kondisi = "NYALA PENUH";
        } else {
          lampu[i].pwmLevel = 20; 
          lampu[i].trigger = "AUTO 20";
          lampu[i].kondisi = "NYALA REDUP";
        }
        lampu[i].isON = true;
      } else {
        lampu[i].pwmLevel = 0;
        lampu[i].isON = false;
        lampu[i].trigger = "OFF (TERANG)";
        lampu[i].kondisi = "MATI";
      }
      setLampuZone(i, lampu[i].pwmLevel);
    }
  }
  
  // 3. AMBIL PERINTAH KONTROL DARI WEBSITE (Tiap 0,5 detik)
  if (millis() - lastControl > 500) {
    lastControl = millis();
    HTTPClient http;
    http.begin(apiControlUrl);
    http.setTimeout(3000);
    
    int code = http.GET();
    if (code == 200) {
      DynamicJsonDocument doc(2048);
      DeserializationError err = deserializeJson(doc, http.getString());
      
      if (!err && doc.is<JsonArray>()) {
        JsonArray arr = doc.as<JsonArray>();
        for (JsonObject cmd : arr) {
          String zoneCmd = cmd["zone"].as<String>();
          String action = cmd["action"].as<String>();
          int id = cmd["id"].as<int>();
          
          for (int i = 0; i < 4; i++) {
            if (lampu[i].zone == zoneCmd) {
              Serial.printf(">> Perintah Website: Zona %s -> %s\n", zoneCmd.c_str(), action.c_str());
              if (action == "ON" || action == "EMERGENCY") {
                lampu[i].manualMode = true;
                lampu[i].isON = true;
                lampu[i].pwmLevel = 255;  
                lampu[i].trigger = "REMOTE ON";
                lampu[i].kondisi = "NYALA MANUAL";
                Serial.printf(">> Zone %s: Set PWM 255, manualMode=true\n", zoneCmd.c_str());
              } else if (action == "OFF") {
                lampu[i].manualMode = true;
                lampu[i].isON = false;
                lampu[i].pwmLevel = 0;    
                lampu[i].trigger = "REMOTE OFF";
                lampu[i].kondisi = "MATI MANUAL";
                Serial.printf(">> Zone %s: Set PWM 0, manualMode=true\n", zoneCmd.c_str());
              } else if (action == "AUTO") {
                lampu[i].manualMode = false;
                Serial.printf(">> Zone %s: Set manualMode=false (AUTO)\n", zoneCmd.c_str());
              }
            }
          }
          
          // Konfirmasi perintah selesai ke server
          HTTPClient httpAck;
          httpAck.begin(apiAckUrl);
          httpAck.addHeader("Content-Type", "application/json");
          httpAck.POST("{\"ids\":[" + String(id) + "]}");
          httpAck.end();
        }
      }
    }
    http.end();
  }
  
  // 4. KIRIM DATA KE WEBSITE (Tiap 1 detik bergantian antar zona untuk mencegah blocking HTTPS)
  static int currentZoneToSend = 0;
  if (millis() - lastSend > 1000) {
    lastSend = millis();
    
    int i = currentZoneToSend;
    DynamicJsonDocument doc(512);
    
    doc["device_id"] = deviceId;
    doc["zone"] = lampu[i].zone;
    doc["lux"] = currentLux;
    doc["jarak"] = currentJarak;
    doc["voltage"] = currentV;
    doc["current"] = (lampu[i].isON) ? (currentmA / 4.0) : 0; 
    bool zoneMasaTunggu = false;
    if (currentLux < luxThreshold) {
      unsigned long timeSinceLastGerakan = (millis() - lastGerakanTime[i]) / 1000;
      zoneMasaTunggu = (timeSinceLastGerakan < delayUltrasonik) && !adaOrang;
    }

    doc["sedangAdaOrang"] = adaOrang;
    doc["masihMasaTunggu"] = zoneMasaTunggu;
    doc["tombol"] = tombolDitekan;
    
    if (lampu[i].pwmLevel > 0 && currentmA < 5.0 && inaReady) {
       // Lampu seharusnya nyala (PWM > 0) tapi arus mendekati 0
       lampu[i].failCount++;
       if (lampu[i].failCount >= 30) { // Harus 0 mA berturut-turut (~2 menit) baru dianggap rusak
          doc["kondisi"] = "RUSAK";
          doc["trigger"] = "ERROR - ARUS 0";
       } else {
          doc["kondisi"] = lampu[i].kondisi;
          doc["trigger"] = lampu[i].trigger;
       }
    } else {
      doc["kondisi"] = lampu[zone].kondisi;
      doc["trigger"] = lampu[zone].trigger;
    }
    
    doc["powerLampu"] = lampu[i].isON ? lampu[i].pwmLevel : 0;
    
    String payload;
    serializeJson(doc, payload);
    
    Serial.println("\n--- MENGIRIM DATA KE SERVER ---");
    Serial.println("Payload: " + payload);
    
    HTTPClient http;
    http.begin(apiDataUrl);
    http.addHeader("Content-Type", "application/json");
    int res = http.POST(payload);
    
    Serial.printf("[Monitor] Zone %s | Sync: HTTP %d\n", lampu[i].zone.c_str(), res);
    http.end();
    
    // Pindah ke zona berikutnya untuk loop berikutnya
    currentZoneToSend = (currentZoneToSend + 1) % 4;
  }
  
  delay(100);
}