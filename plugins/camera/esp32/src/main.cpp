#include <Arduino.h>
#include <NimBLEDevice.h>
#include <WiFi.h>

#include <unordered_map>

#include "tools.h"
#include "rover_settings.h"
#include "rtk.h"

#define TARGET_DEVICE_ATOMS3
#ifdef TARGET_DEVICE_ATOMS3
#include <M5AtomS3.h>     // ATOMS3用ライブラリ
#endif

#define WIFI_SSID "picam360"
#define WIFI_PWD "picam360"

// debug flgs

//ble
#define BLE_SRV_PSERVER "70333680-7067-0000-0001-000000000001"
#define BLE_SRV_PSERVER_C_RX "70333681-7067-0000-0001-000000000001"
#define BLE_SRV_PSERVER_C_TX "70333682-7067-0000-0001-000000000001"
static NimBLEServer *_ble_svr = nullptr;
static NimBLEAdvertising *_ble_adv = nullptr;
static NimBLEService *_ble_svc = nullptr;
static NimBLECharacteristic *_ble_c_rx = nullptr;
static NimBLECharacteristic *_ble_c_tx = nullptr;
static SemaphoreHandle_t _sem_var_access;

static int _loop_count = 0;

/** >>>> BLE */

void startAdvertising() {
  if (_ble_adv != nullptr) {
    _ble_adv->stop();
  }
  _ble_adv = NimBLEDevice::getAdvertising();

  rtk_ble_add_service_uuid(_ble_adv);
  _ble_adv->start();
}

class BleSvrCb : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *_ble_svr) {
    dbgPrintf("ble client connected\n");
    startAdvertising();
  }
  void onDisconnect(NimBLEServer *_ble_svr) {
    dbgPrintf("ble client disconnected\n");
  }
};

class BleChCamRx : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *pCharacteristic) {
    NimBLEAttValue rxData = pCharacteristic->getValue();
    for(int i=0;i<rxData.length();i++){
      USBSerial.printf("%x", rxData.data()[i]);
    }
    USBSerial.println(" : camrx");
  }
};
class BleChCamTx : public NimBLECharacteristicCallbacks {
};

/** BLE <<<< */

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
  WiFi.begin(WIFI_SSID, WIFI_PWD);

  //semaphore
  _sem_var_access = xSemaphoreCreateMutex();

  // read nvs values
  start_use_NVS();
  g_settings = new RoverSettings();
  g_settings->Load();

  NimBLEDevice::init(g_settings->Ssid.begin());
  dbgPrintf(false, "ble addr: %s\n",
            NimBLEDevice::getAddress().toString().c_str());
  _ble_svr = NimBLEDevice::createServer();
  _ble_svr->setCallbacks(new BleSvrCb());

  _ble_svc = _ble_svr->createService(BLE_SRV_PSERVER);
  {
    _ble_c_rx = _ble_svc->createCharacteristic(BLE_SRV_PSERVER_C_RX, NIMBLE_PROPERTY::WRITE);
    _ble_c_rx->setCallbacks(new BleChCamRx());
    _ble_c_tx = _ble_svc->createCharacteristic(BLE_SRV_PSERVER_C_TX, NIMBLE_PROPERTY::NOTIFY);
    _ble_c_tx->setCallbacks(new BleChCamTx());
  }
  _ble_svc->start();

  rtk_setup();//g_settings required
  rtk_ble_setup(_ble_svr, _sem_var_access);

  startAdvertising();
}

/********************
 * loop
 */
void loop() {
  _loop_count++;

  rtk_loop();

#ifdef TARGET_DEVICE_ATOMS3
  M5.Lcd.setTextColor(WHITE, BLACK);              // 文字色
  M5.Lcd.setTextFont(2);                          // フォント
  M5.Lcd.setCursor(0, 0);                        // カーソル座標指定
  //M5.Lcd.printf("SSID: %.10s\n", WiFi.SSID());       // SSID表示
  M5.Lcd.printf("SSID: %s\n", WiFi.softAPSSID()); // アクセスポイント時のSSID表示
  M5.Lcd.setTextColor(ORANGE, BLACK);             // 文字色
  M5.Lcd.print("IP: ");                         // IPアドレス表示
  if (WiFi.status() != WL_CONNECTED) {
    M5.Lcd.println("Connecting...");
  }else{
    M5.Lcd.println(WiFi.localIP());
  }
  M5.Lcd.drawFastHLine(0, 34, 128, WHITE);        // 指定座標から横線

  M5.Lcd.setCursor(0, 38);                        // カーソル座標指定
  M5.Lcd.setTextColor(CYAN, BLACK);               // 文字色
  M5.Lcd.printf("Lat: %s\n", rtk_get_latitude());            // 
  M5.Lcd.printf("lng: %s\n", rtk_get_longitude());                 // 
  M5.Lcd.printf("fix: %s\n", rtk_get_fix_quality());                 // 
#endif

  if((_loop_count%100) == 0){

    if (_ble_c_tx->getSubscribedCount() > 0) {//debug
      if (xSemaphoreTake(_sem_var_access, 50) != pdFALSE) {
        auto str = std::to_string(_loop_count);
        _ble_c_tx->setValue(str);
        _ble_c_tx->notify();

        USBSerial.printf("%s : camtx\n", str.c_str());
        
        xSemaphoreGive(_sem_var_access);
      }
    }
  }
}