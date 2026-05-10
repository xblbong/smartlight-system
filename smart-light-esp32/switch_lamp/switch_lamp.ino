#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_INA219.h>

// ===== CONFIG =====
const char* ssid = "KOS MUSLIMIN 2";
const char* password = "12341234";
const char* apiUrl = "http://192.168.100.36:8000/api/lamp-status";

#define MOSFET1_PIN 17
#define MOSFET2_PIN 5
#define MOSFET3_PIN 6
#define MOSFET4_PIN 7
#define SDA_PIN 1
#define SCL_PIN 2

Adafruit_INA219 ina219;
bool inaReady = false;

void setup() {
  Serial.begin(115200);
  pinMode(MOSFET1_PIN, OUTPUT);
  pinMode(MOSFET2_PIN, OUTPUT);
  pinMode(MOSFET3_PIN, OUTPUT);
  pinMode(MOSFET4_PIN, OUTPUT);
  // Setup I2C untuk ESP32-S3
  Wire.begin(SDA_PIN, SCL_PIN);
  
  if (ina219.begin()) {
    inaReady = true;
    Serial.println("INA219 Terdeteksi!");
  } else {
    Serial.println("INA219 TIDAK Terdeteksi. Cek kabel SDA/SCL.");
  }
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi Connected!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // 1. Baca Data Sensor Arus & Tegangan
    float voltage = 0, current = 0;
    if (inaReady) {
      voltage = ina219.getBusVoltage_V();
      current = ina219.getCurrent_mA();
      
      Serial.printf("Monitoring -> V: %.2fV | I: %.2fmA\n", voltage, current);
    }

    // 2. Ambil Status dari Laravel
    HTTPClient http;
    http.begin(apiUrl);
    
    int httpCode = http.GET();
    if (httpCode == 200) {
      String payload = http.getString();
      Serial.println("Payload dari Server: " + payload);

      DynamicJsonDocument doc(1024); 
      deserializeJson(doc, payload);
      
      JsonArray arr = doc.as<JsonArray>();
            for (JsonObject repo : arr) {
        int id = repo["id"];
        int status = repo["status"];

        if (id == 1) {
          digitalWrite(MOSFET1_PIN, status ? HIGH : LOW);

          if(status == 1 && current < 10.0 && inaReady) {
             Serial.println("Lampu ID 1: RUSAK (Arus < 10mA)");
          } else {
             Serial.printf("Lampu ID 1: %s\n", status ? "ON" : "OFF");
          }
        } 
        
        else if (id == 2) {
          digitalWrite(MOSFET2_PIN, status ? HIGH : LOW);
          Serial.printf("Lampu ID 2: %s\n", status ? "ON" : "OFF");
        }

        else if (id == 3) {
          digitalWrite(MOSFET3_PIN, status ? HIGH : LOW);
          Serial.printf("Lampu ID 3: %s\n", status ? "ON" : "OFF");
        }

        else if (id == 4) {
          digitalWrite(MOSFET4_PIN, status ? HIGH : LOW);
          Serial.printf("Lampu ID 4: %s\n", status ? "ON" : "OFF");
        }
      }
    }
    http.end();
  }
  delay(1000); 
}