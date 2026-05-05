/**
 * Smart Lighting ESP32-S3 — ZONE A (Testing Hardware)
 * ====================================================
 * Board   : ESP32-S3 DevKitC-1
 * Sensor  : BH1750 (LDR/Lux) + HC-SR04 (Ultrasonik) — SHARED
 * Lampu   : MOSFET per zone (PWM)
 * Status  : ZONE_COUNT 1 — testing Zone A saja
 *
 * Sensor siap : BH1750 ✓  HC-SR04 ✓  INA219 ✗ (belum terpasang)
 */

#define SENSOR_ONLY_MODE true   // true = lampu tidak dikendalikan fisik (hanya log)

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_INA219.h>
#include <BH1750.h>


// KONFIGURASI WIFI & API

const char* WIFI_SSID      = "KOS MUSLIMIN 2";  // Ganti dengan WiFi SSID Anda
const char* WIFI_PASSWORD  = "12341234";        // Ganti dengan password WiFi Anda
const char* API_BASE_URL   = "http://192.168.100.36:8000";  // Ganti dengan IP server Anda
const char* DEVICE_ID      = "ESP32-001";  // Satu ID untuk satu ESP32


// KONFIGURASI ZONE (MULTI ZONE)

#define ZONE_COUNT 1  // ← Ganti ke 2 setelah Zone A OK

// Shared sensor pins (1 set sensor untuk semua zone)
#define PIN_TRIG  11   // HC-SR04 Trigger
#define PIN_ECHO  12   // HC-SR04 Echo
// I2C: SDA=GPIO1, SCL=GPIO2 (BH1750 + INA219)

struct ZoneConfig {
  String code;          // "A", "B", dst.
  String name;          // "Lokasi 1", "Lokasi 2", dst.
  int    pinMosfet;     // GPIO PWM lampu zone ini
  float  thresholdLux;  // Lux threshold (outdoor std: 20 lux min)
  float  thresholdJarak;// Jarak threshold (cm) untuk deteksi objek
};

// thresholdLux  : 20 lux = standar minimum outdoor (halaman/jalan)
// thresholdJarak : 5 cm  = testing (dekatkan tangan 5 cm ke sensor)
ZoneConfig zones[ZONE_COUNT] = {
  {"A", "Lokasi 1", 17, 20.0, 5.0},   // ← jarak 5cm untuk testing
  // {"B", "Lokasi 2", 19, 20.0, 30.0},  // Aktifkan + ZONE_COUNT=2 setelah siap
};

// DATA PER ZONE

struct ZoneData {
  float         lux               = 0;
  float         jarak             = 0;
  float         voltage           = 0;
  float         current           = 0;
  bool          sedangAdaOrang    = false;
  bool          masihMasaTunggu   = false;
  bool          tombol            = false;
  int           powerLampu        = 0;
  String        trigger           = "OFF";
  String        kondisi           = "MATI";
  bool          isFaulty          = false;
  unsigned long orangPergiTime    = 0;
  bool          sedangMasaTunggu  = false;
};

ZoneData zoneData[ZONE_COUNT];

// Sensor global (shared)
bool       ina219Ready  = false;
bool       bh1750Ready  = false;
Adafruit_INA219 ina219;
BH1750     lightMeter;

// Timing
unsigned long lastSendTime    = 0;
unsigned long lastControlTime = 0;
unsigned long loopCount       = 0;

const unsigned long INTERVAL_SEND_MS    = 5000;
const unsigned long INTERVAL_CONTROL_MS = 3000;
const unsigned long DELAY_TUNGGU_MS     = 5000;


//  HELPER — Garis pemisah log

void logSep(char c = '-') {
  for (int i = 0; i < 60; i++) Serial.print(c);
  Serial.println();
}

void logHeader(const char* title) {
  logSep('=');
  Serial.printf("  %s\n", title);
  logSep('=');
}


//  FORWARD DECLARATIONS
float bacaJarak(int trigPin, int echoPin);
void  setLampuZone(int zoneIdx, int pwmValue);
void  updateLogikaZone(int zoneIdx);
void  kirimDataSemuaZone();
void  pollingControlSemuaZone();
void  bacaSensorGlobal();
void  bacaSensorPerZone(int zoneIdx);
void  logStatusZone(int zoneIdx);


//  SETUP

void setup() {
  Serial.begin(115200);
  delay(1200);

  logHeader("Smart Lighting ESP32-S3  |  Startup");
  Serial.printf("  Device ID   : %s\n", DEVICE_ID);
  Serial.printf("  Zone count  : %d\n", ZONE_COUNT);
  Serial.printf("  Sensor mode : %s\n", SENSOR_ONLY_MODE ? "SENSOR ONLY (lampu tidak aktif)" : "FULL CONTROL");
  Serial.printf("  API target  : %s\n", API_BASE_URL);
  logSep();

  // ── I2C ──────────────────────────────────────────────────
  Serial.println("\n[I2C] Memulai bus I2C  SDA=GPIO1  SCL=GPIO2");
  Wire.begin(1, 2);
  delay(100);

  // ── BH1750 (LDR / Lux) ──────────────────────────────────
  Serial.print("[BH1750] Inisialisasi ... ");
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire)) {
    bh1750Ready = true;
    Serial.println("OK  ✓");
  } else {
    Serial.println("GAGAL  ✗  — periksa kabel SDA/SCL & alamat 0x23");
  }

  // ── INA219 (Arus/Voltage) ────────────────────────────────
  Serial.print("[INA219] Inisialisasi ... ");
  if (ina219.begin()) {
    ina219Ready = true;
    Serial.println("OK  ✓");
  } else {
    Serial.println("SKIP  ✗  — belum terpasang (diabaikan)");
  }

  // ── HC-SR04 (Ultrasonik) ─────────────────────────────────
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);
  Serial.printf("[HC-SR04] Siap  TRIG=GPIO%d  ECHO=GPIO%d  ✓\n", PIN_TRIG, PIN_ECHO);

  // ── Inisialisasi pin lampu per zone ──────────────────────
  Serial.println();
  for (int i = 0; i < ZONE_COUNT; i++) {
    pinMode(zones[i].pinMosfet, OUTPUT);
    ledcAttach(zones[i].pinMosfet, 5000, 8);
    ledcWrite(zones[i].pinMosfet, 0);
    Serial.printf("[ZONE-%s] %-10s | Lampu GPIO%d | Thr.Lux=%.0f lx | Thr.Jarak=%.0f cm\n",
                  zones[i].code.c_str(),
                  zones[i].name.c_str(),
                  zones[i].pinMosfet,
                  zones[i].thresholdLux,
                  zones[i].thresholdJarak);
  }

  // ── WiFi ─────────────────────────────────────────────────
  Serial.println();
  Serial.printf("[WiFi] Menghubungkan ke \"%s\" ", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int wifiAttempt = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (++wifiAttempt % 20 == 0) Serial.println();
  }
  Serial.println();
  Serial.printf("[WiFi] TERHUBUNG  IP: %s  RSSI: %d dBm\n",
                WiFi.localIP().toString().c_str(),
                WiFi.RSSI());

  logSep();
  Serial.println("[SYSTEM] Setup selesai — memulai loop utama");
  logSep();
  Serial.println();
}


//  MAIN LOOP
void loop() {
  unsigned long now = millis();
  loopCount++;

  // Baca semua sensor shared
  bacaSensorGlobal();

  // Proses tiap zone
  for (int i = 0; i < ZONE_COUNT; i++) {
    bacaSensorPerZone(i);
    updateLogikaZone(i);
  }

  // Print status ringkas setiap loop (throttled: tiap ~1 detik)
  static unsigned long lastPrintTime = 0;
  if (now - lastPrintTime >= 1000) {
    lastPrintTime = now;
    for (int i = 0; i < ZONE_COUNT; i++) logStatusZone(i);
  }

  // Kirim data ke server setiap INTERVAL_SEND_MS
  if (now - lastSendTime >= INTERVAL_SEND_MS) {
    lastSendTime = now;
    kirimDataSemuaZone();
  }

  // Polling perintah manual dari server
  if (now - lastControlTime >= INTERVAL_CONTROL_MS) {
    lastControlTime = now;
    pollingControlSemuaZone();
  }

  delay(50);
}


//  LOG STATUS RINGKAS PER ZONE (tiap detik)

void logStatusZone(int i) {
  ZoneData   &zd = zoneData[i];
  ZoneConfig &zc = zones[i];
  Serial.printf(
    "[%s|%-9s] Lux=%7.2f lx | Jarak=%6.2f cm | Orang=%-3s | Tunggu=%-3s | PWM=%3d | %-14s\n",
    zc.code.c_str(),
    zc.name.c_str(),
    zd.lux,
    (zd.jarak >= 999 ? 999.0f : zd.jarak),
    zd.sedangAdaOrang  ? "YA" : "TDK",
    zd.masihMasaTunggu ? "YA" : "TDK",
    zd.powerLampu,
    zd.kondisi.c_str()
  );
}


//  BACA SENSOR GLOBAL (SHARED)

void bacaSensorGlobal() {
  // BH1750 — lux
  float lux = 0;
  if (bh1750Ready) {
    lux = lightMeter.readLightLevel();
    if (lux < 0) {
      Serial.println("[BH1750] Bacaan negatif, reset ke 0");
      lux = 0;
    }
  } else {
    // BH1750 belum ready — coba reinit sekali
    if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire)) {
      bh1750Ready = true;
      Serial.println("[BH1750] Reinit berhasil  ✓");
    }
  }

  // HC-SR04 — jarak
  float jarak = bacaJarak(PIN_TRIG, PIN_ECHO);
  if (jarak < 0) {
    // Timeout — tidak ada echo (terlalu jauh atau tidak ada objek)
    jarak = 999;
  }

  // INA219 — arus & voltage (skip jika belum siap)
  float voltage = 0, current = 0;
  if (ina219Ready) {
    voltage = ina219.getBusVoltage_V();
    current = ina219.getCurrent_mA();
    if (voltage < 0.1) voltage = 0;
    if (current < 0)   current = 0;
  }

  // Distribusi ke semua zone (shared)
  for (int i = 0; i < ZONE_COUNT; i++) {
    zoneData[i].lux     = lux;
    zoneData[i].jarak   = jarak;
    zoneData[i].voltage = voltage;
    zoneData[i].current = (ZONE_COUNT > 1) ? (current / ZONE_COUNT) : current;
  }
}


//  BACA SENSOR PER ZONE (switch manual)

void bacaSensorPerZone(int zoneIdx) {
  // Switch manual: Zone A → GPIO21, Zone B → GPIO22
  int switchPin = (zoneIdx == 0) ? 21 : 22;
  pinMode(switchPin, INPUT_PULLUP);
  bool tombolSebelumnya = zoneData[zoneIdx].tombol;
  zoneData[zoneIdx].tombol = (digitalRead(switchPin) == LOW);

  // Log hanya saat ada perubahan
  if (zoneData[zoneIdx].tombol != tombolSebelumnya) {
    Serial.printf("[ZONE-%s] Tombol manual: %s\n",
                  zones[zoneIdx].code.c_str(),
                  zoneData[zoneIdx].tombol ? "DITEKAN (OFF paksa)" : "DILEPAS");
  }
}


//  BACA JARAK ULTRASONIK

float bacaJarak(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 30000);  // timeout 30ms
  if (duration == 0) return -1;                   // -1 = timeout/no echo
  return duration * 0.034f / 2.0f;
}


//  SET LAMPU PER ZONE

void setLampuZone(int zoneIdx, int pwmValue) {
  pwmValue = constrain(pwmValue, 0, 255);
  int sebelumnya = zoneData[zoneIdx].powerLampu;

  if (!SENSOR_ONLY_MODE) {
    // Mode FULL: kirim PWM ke GPIO fisik
    ledcWrite(zones[zoneIdx].pinMosfet, pwmValue);
  }
  zoneData[zoneIdx].powerLampu = pwmValue;

  // Log hanya saat nilai berubah
  if (pwmValue != sebelumnya) {
    int pct = (pwmValue * 100) / 255;
    if (SENSOR_ONLY_MODE) {
      Serial.printf("[ZONE-%s] [SENSOR_ONLY] Lampu → %d%% (PWM=%d)  *tidak dikirim ke MOSFET*\n",
                    zones[zoneIdx].code.c_str(), pct, pwmValue);
    } else {
      Serial.printf("[ZONE-%s] Lampu → %d%% (PWM=%d)  GPIO%d\n",
                    zones[zoneIdx].code.c_str(), pct, pwmValue, zones[zoneIdx].pinMosfet);
    }
  }
}


//  LOGIKA LAMPU PER ZONE

void updateLogikaZone(int zoneIdx) {
  unsigned long now = millis();
  ZoneData   &zd = zoneData[zoneIdx];
  ZoneConfig &zc = zones[zoneIdx];

  // ── P1: Manual switch ──────────────────────────────────
  if (zd.tombol) {
    setLampuZone(zoneIdx, 0);
    zd.trigger = "MANUAL OFF";
    zd.kondisi = "MATI";
    zd.sedangAdaOrang   = false;
    zd.masihMasaTunggu  = false;
    return;
  }

  // ── P2: Deteksi objek + masa tunggu ───────────────────
  bool adaObjek = (zd.jarak > 0 && zd.jarak < 999 && zd.jarak <= zc.thresholdJarak);

  if (adaObjek) {
    if (!zd.sedangAdaOrang) {
      Serial.printf("[ZONE-%s] Objek TERDETEKSI  jarak=%.1f cm  (threshold=%.0f cm)\n",
                    zc.code.c_str(), zd.jarak, zc.thresholdJarak);
    }
    zd.sedangAdaOrang   = true;
    zd.sedangMasaTunggu = false;

  } else {
    if (zd.sedangAdaOrang && !zd.sedangMasaTunggu) {
      zd.sedangMasaTunggu = true;
      zd.orangPergiTime   = now;
      Serial.printf("[ZONE-%s] Objek pergi — masa tunggu %lums dimulai\n",
                    zc.code.c_str(), DELAY_TUNGGU_MS);
    }
    if (zd.sedangMasaTunggu) {
      unsigned long elapsed = now - zd.orangPergiTime;
      if (elapsed >= DELAY_TUNGGU_MS) {
        Serial.printf("[ZONE-%s] Masa tunggu selesai (%lums) — lampu mati\n",
                      zc.code.c_str(), elapsed);
        zd.sedangAdaOrang   = false;
        zd.sedangMasaTunggu = false;
      }
    }
  }
  zd.masihMasaTunggu = zd.sedangMasaTunggu;

  // ── P3: Fault detection (INA219 belum terpasang - dinonaktifkan)
  // TODO: Aktifkan kembali setelah INA219 siap
  // if (zd.powerLampu > 50 && zd.current < 10.0) {
  //   zd.isFaulty = true;
  //   zd.trigger = "ERROR - RUSAK";
  //   zd.kondisi = "RUSAK";
  //   Serial.printf("[ZONE %s] FAULT DETECTED!\n", zc.code.c_str());
  //   return;
  // }
  zd.isFaulty = false;  // INA219 belum siap, nonaktifkan fault detection

  // ── P4: Auto mode ─────────────────────────────────────
  if (!zd.sedangAdaOrang) {
    setLampuZone(zoneIdx, 0);
    if (zd.lux < zc.thresholdLux) {
      zd.trigger = "OFF (GELAP-AMAN)";   // Gelap tapi tidak ada orang
    } else {
      zd.trigger = "OFF (TERANG)";       // Masih cukup cahaya
    }
    zd.kondisi = "MATI";

  } else {
    // Ada orang — nyalakan sesuai kondisi cahaya
    if (zd.lux < zc.thresholdLux) {
      // Gelap + ada orang → 100%
      setLampuZone(zoneIdx, 255);
      zd.trigger = "AUTO 100%";
      zd.kondisi = "NYALA NORMAL";
    } else {
      // Masih terang + ada orang → 40% (hemat daya)
      setLampuZone(zoneIdx, 50);
      zd.trigger = "AUTO 40%";
      zd.kondisi = "NYALA NORMAL";
    }
  }
}


//  KIRIM DATA KE API

void kirimDataSemuaZone() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] WiFi PUTUS — data tidak dikirim");
    Serial.printf("[WiFi] Status: %d | RSSI: %d dBm\n", WiFi.status(), WiFi.RSSI());
    return;
  }

  logSep('>');
  Serial.printf("[HTTP] Mengirim data  uptime=%lus  loop#%lu\n",
                millis() / 1000, loopCount);

  for (int i = 0; i < ZONE_COUNT; i++) {
    ZoneData   &zd = zoneData[i];
    ZoneConfig &zc = zones[i];

    // Bangun JSON payload
    StaticJsonDocument<512> doc;
    doc["device_id"]        = DEVICE_ID;
    doc["zone"]             = zc.code;
    doc["lux"]              = round(zd.lux * 10.0f) / 10.0f;   // 1 desimal
    doc["jarak"]            = round(zd.jarak * 10.0f) / 10.0f;
    doc["sedangAdaOrang"]   = zd.sedangAdaOrang;
    doc["masihMasaTunggu"]  = zd.masihMasaTunggu;
    doc["tombol"]           = zd.tombol;
    doc["voltage"]          = zd.voltage;
    doc["current"]          = zd.current;
    doc["trigger"]          = zd.trigger;
    doc["kondisi"]          = zd.kondisi;
    doc["powerLampu"]       = zd.powerLampu;
    doc["timestamp"]        = nullptr;  // server pakai now()

    JsonObject ss = doc.createNestedObject("sensor_status");
    ss["ldr"]        = bh1750Ready  ? "OK" : "ERROR";
    ss["ultrasonic"] = "OK";
    ss["ina219"]     = ina219Ready  ? "OK" : "N/A";

    String payload;
    serializeJson(doc, payload);

    // Debug: print payload ringkas
    Serial.printf("  [ZONE-%s] Payload: lux=%.1f lx | jarak=%.1f cm | PWM=%d | %s\n",
                  zc.code.c_str(), zd.lux, zd.jarak, zd.powerLampu, zd.kondisi.c_str());
    Serial.printf("           orang=%-3s | tunggu=%-3s | trigger=%s\n",
                  zd.sedangAdaOrang  ? "YA" : "TDK",
                  zd.masihMasaTunggu ? "YA" : "TDK",
                  zd.trigger.c_str());

    // POST ke API
    HTTPClient http;
    String url = String(API_BASE_URL) + "/api/device/data";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000);

    int httpCode = http.POST(payload);

    if (httpCode == 200 || httpCode == 201) {
      Serial.printf("  [ZONE-%s] ✓ HTTP %d — data diterima server\n",
                    zc.code.c_str(), httpCode);

      // Cek response untuk update threshold dari server
      String response = http.getString();
      StaticJsonDocument<256> resp;
      if (!deserializeJson(resp, response)) {
        if (resp.containsKey("threshold_lux")) {
          float newThr = resp["threshold_lux"];
          Serial.printf("  [ZONE-%s] Threshold lux diperbarui server: %.0f → %.0f lx\n",
                        zc.code.c_str(), zc.thresholdLux, newThr);
          zc.thresholdLux = newThr;
        }
        if (resp.containsKey("threshold_jarak")) {
          float newThr = resp["threshold_jarak"];
          Serial.printf("  [ZONE-%s] Threshold jarak diperbarui server: %.0f → %.0f cm\n",
                        zc.code.c_str(), zc.thresholdJarak, newThr);
          zc.thresholdJarak = newThr;
        }
      }
    } else if (httpCode > 0) {
      Serial.printf("  [ZONE-%s] ✗ HTTP %d — respon error dari server\n",
                    zc.code.c_str(), httpCode);
      Serial.printf("           Respons: %s\n", http.getString().substring(0, 120).c_str());
    } else {
      Serial.printf("  [ZONE-%s] ✗ Koneksi gagal (kode: %d) — server tidak merespons\n",
                    zc.code.c_str(), httpCode);
      Serial.printf("           URL: %s\n", url.c_str());
    }

    http.end();
    delay(100);
  }
  logSep('>');
}


//  POLLING PERINTAH MANUAL DARI SERVER

void pollingControlSemuaZone() {
  if (WiFi.status() != WL_CONNECTED) return;

  for (int i = 0; i < ZONE_COUNT; i++) {
    HTTPClient http;
    String url = String(API_BASE_URL)
               + "/api/device/control?device_id=" + DEVICE_ID
               + "&zone=" + zones[i].code;
    http.begin(url);
    http.setTimeout(3000);

    int httpCode = http.GET();

    if (httpCode == 200) {
      String response = http.getString();
      StaticJsonDocument<256> doc;
      if (!deserializeJson(doc, response)) {
        const char* action = doc["action"] | "";
        if (strlen(action) > 0) {
          Serial.printf("[CTRL] Zone-%s terima perintah: %s\n",
                        zones[i].code.c_str(), action);
        }
        if (strcmp(action, "OFF") == 0) {
          setLampuZone(i, 0);
          zoneData[i].trigger = "REMOTE OFF";
          zoneData[i].kondisi = "MATI";
        } else if (strcmp(action, "ON") == 0) {
          // Kembalikan ke mode auto (biarkan logika berjalan)
          Serial.printf("[CTRL] Zone-%s kembali ke AUTO\n", zones[i].code.c_str());
        }
      }
    } else if (httpCode != 404) {
      // 404 = normal (tidak ada perintah antri) — jangan log
      Serial.printf("[CTRL] Zone-%s polling HTTP %d\n",
                    zones[i].code.c_str(), httpCode);
    }

    http.end();
    delay(50);
  }
}