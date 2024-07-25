#include <Arduino.h>
#include <NimBLEDevice.h>
#include <HTTPClient.h>

#include <unordered_map>

#include "tools.h"
#include "rover_settings.h"
#include "rtk.h"

#define TARGET_DEVICE_ATOMS3
#ifdef TARGET_DEVICE_ATOMS3
#include <M5AtomS3.h>     // ATOMS3用ライブラリ
#endif

// debug flgs

//ble
#define BLE_SRV_PSERVER      "70333680-7067-0000-0001-000000000001"
#define BLE_SRV_PSERVER_C_RX "70333681-7067-0000-0001-000000000001"
#define BLE_SRV_PSERVER_C_TX "70333682-7067-0000-0001-000000000001"
static NimBLEServer *_ble_svr = nullptr;
static NimBLEAdvertising *_ble_adv = nullptr;
static NimBLEService *_ble_svc = nullptr;
static NimBLECharacteristic *_ble_c_rx = nullptr;
static NimBLECharacteristic *_ble_c_tx = nullptr;
static SemaphoreHandle_t _sem_var_access;

static int _loop_count = 0;
static std::vector<uint8_t> _read_line;
static std::string _ssid = "ERROR_NO_RESPONSE";
static std::string _ip_address = "ERROR_NO_RESPONSE";
static std::string _ntrip_data = "ERROR_NO_RESPONSE";

/** >>>> BLE */

void startAdvertising() {
  if (_ble_adv != nullptr) {
    _ble_adv->stop();
  }
  _ble_adv = NimBLEDevice::getAdvertising();

  //only one uuid is valid
  _ble_adv->addServiceUUID(_ble_svc->getUUID());
  //rtk_ble_add_service_uuid(_ble_adv);
  
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

static void write_camtx(std::string str){
  if (_ble_c_tx->getSubscribedCount() > 0) {
    if (xSemaphoreTake(_sem_var_access, 50) != pdFALSE) {
      _ble_c_tx->setValue(str);
      _ble_c_tx->notify();

      USBSerial.printf("BLE_CAMTX %s\n", str.c_str());

      xSemaphoreGive(_sem_var_access);
    }
  }
}

class BleChCamRx : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *pCharacteristic) {
    NimBLEAttValue rxData = pCharacteristic->getValue();
    if(strncmp(rxData.c_str(), "REQ GET_IP", 10) == 0){
      std::string str = "RES GET_IP " + _ip_address;
      write_camtx(str);
    }else if(strncmp(rxData.c_str(), "REQ GET_SSID", 12) == 0){
      std::string str = "RES GET_SSID " + _ssid;
      write_camtx(str);
    }else{//relay
      USBSerial.println(rxData.c_str());
    }
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

  //semaphore
  _sem_var_access = xSemaphoreCreateMutex();

  // read nvs values
  start_use_NVS();
  g_settings = new RoverSettings();
  g_settings->Load();
  
  USBSerial.printf("BLE Device Name : %s\n", g_settings->Ssid.c_str());

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
  M5.Lcd.printf("SSID: %.10s\n", _ssid.c_str()); // アクセスポイント時のSSID表示
  M5.Lcd.setTextColor(ORANGE, BLACK);             // 文字色
  M5.Lcd.printf("IP: %.10s\n", _ip_address.c_str());                         // IPアドレス表示
  M5.Lcd.drawFastHLine(0, 34, 128, WHITE);        // 指定座標から横線

  M5.Lcd.setCursor(0, 38);                        // カーソル座標指定
  M5.Lcd.setTextColor(CYAN, BLACK);               // 文字色
  M5.Lcd.printf("LAT: %s\n", rtk_get_latitude());            // 
  M5.Lcd.printf("LNG: %s\n", rtk_get_longitude());                 // 
  M5.Lcd.printf("FIX: %s\n", rtk_get_fix_quality());                 // 
#endif
  if((_loop_count%1000) == 0){
    int step = (_loop_count/1000)%2;
    switch(step){
    case 0:
      USBSerial.println("REQ GET_IP");
      break;
    case 1:
      USBSerial.println("REQ GET_SSID");
      break;
    }
  }
  if (USBSerial.available() > 0) {
    int c = USBSerial.read();
    if(c == '\n'){
      _read_line.push_back('\0');
      if (strncmp((char*)_read_line.data(), "RES GET_IP ", 11) == 0){
        _ip_address = (char*)(_read_line.data() + 11);
      }else if (strncmp((char*)_read_line.data(), "RES GET_SSID ", 13) == 0){
        _ssid = (char*)(_read_line.data() + 13);
      }else if (strncmp((char*)_read_line.data(), "RES GET_NTRIP_DATA ", 19) == 0){
        _ntrip_data = (char*)(_read_line.data() + 19);
        rtk_push_ntrip_data((uint8_t*)_ntrip_data.c_str(), _ntrip_data.size());
      }else{
        write_camtx((char*)_read_line.data());
      }
      USBSerial.printf("ECHO %s\n", (char*)_read_line.data());
      _read_line.clear();
    }else if(c == '\r'){
      //do nothing
    }else{
      _read_line.push_back(c);
    }
  }
}