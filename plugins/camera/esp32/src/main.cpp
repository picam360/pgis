#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include <NimBLEDevice.h>
#include <DNSServer.h>

#include <unordered_map>

#include "tools.h"
#include "rover_settings.h"
#include "rtk.h"
#include "secrets.h"

#define TARGET_DEVICE_ATOMS3
#ifdef TARGET_DEVICE_ATOMS3
#include <M5AtomS3.h>     // ATOMS3用ライブラリ
#endif

#define SERVER_PC_NAME "rover"
#define SERVER_PC_URL "http://rover.local"
#define DNS_PORT 53

static DNSServer DNS;

// debug flgs
static bool _bbg_print_rtcm = true;
static bool _use_dummy_pos = false;

static int _loop_count = 0;
static AsyncWebServer _server(80);
static String _ssid;
static SemaphoreHandle_t _sem_var_access;

/**
 * WIFI
 */
void start_server() {
  _server.on("/pos", HTTP_POST, [](AsyncWebServerRequest *request) {
    auto ms = millis();

    int params = request->params();
    for (int i = 0; i < params; i++) {
      AsyncWebParameter *p = request->getParam(i);
      if (p->name() == "pos") {
      }
    }
    request->send(200, "text/plain", "Data received");

    dbgPrintf("recv pos POST %d\n", millis() - ms);
  });

  _server.begin();
}

/** WIFI <<<< */

/********************
 * setup
 */
void setup() {
#ifdef TARGET_DEVICE_ATOMS3
  auto cfg = M5.config();
  M5.begin(cfg); // AtomS3初期設定（LCD,UART,I2C,LED）
  M5.Lcd.begin();                   // 画面初期化
  M5.Lcd.setRotation(2);            // 画面向き設定（USB位置基準 0：上/ 1：左/ 2：下/ 3：右）
  M5.Lcd.fillScreen(BLACK);         // 背景
#endif

  USBSerial.begin(115200);

  // read nvs values
  start_use_NVS();
  g_settings = new RoverSettings();
  g_settings->Load();

  rtk_setup();//g_settings required

  _ssid = g_settings->Ssid;
  dbgPrintf("SSID: %s\n", _ssid.c_str());

  // start wifi AP
  WiFi.mode(WIFI_AP);
  WiFi.softAP(_ssid.c_str(), WIFI_AP_PASSWD);
  dbgPrintf(false, "wifi ap started: %s\n", _ssid.c_str());

	// start dns server
	if (!DNS.start(DNS_PORT, SERVER_PC_NAME, WiFi.softAPIP())){
    USBSerial.printf("\n failed to start dns service \n");
  }
  // start web server
  _sem_var_access = xSemaphoreCreateMutex();
  start_server();
  dbgPrintf(false, "web server started: %s.local\n", SERVER_PC_NAME);
}

/********************
 * loop
 */
void loop() {
  _loop_count++;

  rtk_loop();

  //dns server
	DNS.processNextRequest();

#ifdef TARGET_DEVICE_ATOMS3
  M5.Lcd.setTextColor(WHITE, BLACK);              // 文字色
  M5.Lcd.setTextFont(2);                          // フォント
  M5.Lcd.setCursor(0, 0);                        // カーソル座標指定
  //M5.Lcd.printf("SSID: %.10s\n", WiFi.SSID());       // SSID表示
  M5.Lcd.printf("SSID: %s\n", WiFi.softAPSSID()); // アクセスポイント時のSSID表示
  M5.Lcd.setTextColor(ORANGE, BLACK);             // 文字色
  M5.Lcd.print("IP  : ");                         // IPアドレス表示
  //M5.Lcd.println(WiFi.localIP());
  M5.Lcd.println(WiFi.softAPIP());             // アクセスポイント時のIPアドレス表示
  M5.Lcd.drawFastHLine(0, 34, 128, WHITE);        // 指定座標から横線

  M5.Lcd.setCursor(0, 38);                        // カーソル座標指定
  M5.Lcd.setTextColor(CYAN, BLACK);               // 文字色
  M5.Lcd.printf("Lat: %s\n", rtk_get_latitude());            // 
  M5.Lcd.printf("lng: %s\n", rtk_get_longitude());                 // 
  M5.Lcd.printf("fix: %s\n", rtk_get_fix_quality());                 // 

#endif

}