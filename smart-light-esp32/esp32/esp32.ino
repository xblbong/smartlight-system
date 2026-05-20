#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <BH1750.h>

// ===== CONFIG =====
const char* ssid          = "KOS MUSLIMIN 2";
const char* password      = "12341234";
const char* apiDataUrl    = "http://192.168.100.36:8000/api/device/data";
const char* apiControlUrl = "http://192.168.100.36:8000/api/device/control/pending?device_id=ESP32-001";
const char* apiAckUrl     = "http://192.168.100.36:8000/api/device/control/ack";
const char* apiSettingsUrl = "http://192.168.100.36:8000/api/settings";
const char* deviceId      = "ESP32-001";

#define PIN_TRIG 11
#define PIN_ECHO 12
#define SDA_PIN  1
#define SCL_PIN  2
#define PIN_SWITCH 21

struct Lampu {
  String zone;
  int pin;
  bool manualMode;
  bool isON;
  int pwmLevel;   // 0-255 PWM value
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

unsigned long lastSend = 0;
unsigned long lastControl = 0;
unsigned long lastSettingsFetch = 0;
float currentLux = 0;
float currentJarak = 0;
float currentV = 0;
float currentmA = 0;

// ── Threshold Settings (default values) ──
float luxThreshold = 100.0;      // Lux untuk nyala/mati (0-500 scale)
int delayUltrasonik = 15;        // Delay setelah tidak ada gerakan (detik)

// ── Tracking gerakan per zona ──
unsigned long lastGerakanTime[4] = {0, 0, 0, 0};  // Waktu terakhir ada gerakan per zona

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== SMART LIGHTING ===");

  // Set pin mosfet
  for (int i = 0; i < 4; i++) {
    pinMode(lampu[i].pin, OUTPUT);
    digitalWrite(lampu[i].pin, LOW);
  }
  
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_SWITCH, INPUT_PULLUP);
  
  // Inisialisasi I2C
  Wire.begin(SDA_PIN, SCL_PIN);
  if (ina219.begin()) {
    inaReady = true;
    ina219.setCalibration_16V_400mA();
    Serial.println("[OK] INA219 Terdeteksi");
  } else {
    Serial.println("[FAIL] INA219 Tidak Ditemukan");
  }
  
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire)) {
    bhReady = true;
    Serial.println("[OK] BH1750 Terdeteksi");
  } else {
    Serial.println("[FAIL] BH1750 Tidak Ditemukan");
  }
  
  // Konek WiFi
  Serial.print("Connecting to WiFi ");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { 
    delay(500); 
    Serial.print("."); 
  }
  Serial.println("\n[OK] WiFi Connected!");
}

float bacaJarak() {
  digitalWrite(PIN_TRIG, LOW); delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long dur = pulseIn(PIN_ECHO, HIGH, 30000);
  if (dur == 0) return 999.0;
  return dur * 0.034 / 2.0;
}

void setLampuZone(int idx, int level) {
  if (idx < 0 || idx >= 4) return;
  lampu[idx].pwmLevel = level;
  lampu[idx].isON = (level > 0);
  
  // Gunakan analogWrite untuk PWM (kompatibel dengan semua pin ESP32)
  analogWrite(lampu[idx].pin, level);
}

void fetchSettings() {
  HTTPClient http;
  http.begin(apiSettingsUrl);
  http.setTimeout(3000);
  
  int code = http.GET();
  
  if (code == 200) {
    String response = http.getString();
    DynamicJsonDocument doc(1024);
    DeserializationError err = deserializeJson(doc, response);
    
    if (!err && doc.is<JsonObject>()) {
      JsonObject obj = doc.as<JsonObject>();
      
      // Update threshold dari server
      if (obj.containsKey("lux_threshold")) {
        float newThreshold = obj["lux_threshold"].as<float>();
        if (newThreshold != luxThreshold) {
          Serial.printf("[SETTINGS] Lux Threshold updated: %.1f → %.1f\n", luxThreshold, newThreshold);
          luxThreshold = newThreshold;
        }
      }
      
      // Update delay ultrasonik dari server
      if (obj.containsKey("pir_delay")) {
        int newDelay = obj["pir_delay"].as<int>();
        if (newDelay != delayUltrasonik) {
          Serial.printf("[SETTINGS] Delay Ultrasonik updated: %d → %d detik\n", delayUltrasonik, newDelay);
          delayUltrasonik = newDelay;
        }
      }
    }
  }
  http.end();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  // 0. FETCH SETTINGS (Tiap 30 detik)
  if (millis() - lastSettingsFetch > 30000) {
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
  
  // 3. AMBIL PERINTAH KONTROL DARI WEBSITE (Tiap 2 detik)
  if (millis() - lastControl > 2000) {
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
  
  // 4. KIRIM DATA KE WEBSITE (Tiap 3 detik)
  if (millis() - lastSend > 3000) {
    lastSend = millis();
    
    for (int i = 0; i < 4; i++) {
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
         if (lampu[i].failCount >= 10) { // Harus 0 mA berturut-turut (~30 detik) baru dianggap rusak
            doc["kondisi"] = "RUSAK";
            doc["trigger"] = "ERROR - ARUS 0";
         } else {
            doc["kondisi"] = lampu[i].kondisi;
            doc["trigger"] = lampu[i].trigger;
         }
      } else {
         lampu[i].failCount = 0; // Reset counter
         doc["kondisi"] = lampu[i].kondisi;
         doc["trigger"] = lampu[i].trigger;
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
      delay(50); // Jeda sedikit antar request
    }
  }
  
  delay(100);
}