#include <Arduino.h>
#include <NimBLEDevice.h>
#include <HTTPClient.h>

#include <unordered_map>

#include "tools.h"
#include "rover_settings.h"
#include "rtk.h"
#include "nmea_gga.h"

#define TARGET_DEVICE_ATOMS3
#ifdef TARGET_DEVICE_ATOMS3
#include <M5AtomS3.h> // ATOMS3用ライブラリ
#endif

// debug flgs

// ble
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
static std::vector<uint8_t> _read_line;
static std::string _ssid = "ERROR_NO_RESPONSE";
static std::string _ip_address = "ERROR_NO_RESPONSE";
static NMEA_GGA _nmea_gga;

static unsigned long last_status_msec = 0;
static long status_interval_msec = 100;

/** >>>> BLE */

void startAdvertising()
{
    if (_ble_adv != nullptr)
    {
        _ble_adv->stop();
    }
    _ble_adv = NimBLEDevice::getAdvertising();

    // only one uuid is valid
    _ble_adv->addServiceUUID(_ble_svc->getUUID());
    // rtk_ble_add_service_uuid(_ble_adv);

    _ble_adv->start();
}

class BleSvrCb : public NimBLEServerCallbacks
{
    void onConnect(NimBLEServer *_ble_svr)
    {
        dbgPrintf("ble client connected\n");
        startAdvertising();
    }
    void onDisconnect(NimBLEServer *_ble_svr)
    {
        dbgPrintf("ble client disconnected\n");
    }
};

static void write_camtx(std::string str)
{
    if (_ble_c_tx->getSubscribedCount() > 0)
    {
        if (xSemaphoreTake(_sem_var_access, 50) != pdFALSE)
        {
            _ble_c_tx->setValue(str);
            _ble_c_tx->notify();

            USBSerial.printf("BLE_CAMTX %s\n", str.c_str());

            xSemaphoreGive(_sem_var_access);
        }
    }
}

class BleChCamRx : public NimBLECharacteristicCallbacks
{
    void onWrite(NimBLECharacteristic *pCharacteristic)
    {
        NimBLEAttValue rxData = pCharacteristic->getValue();
        if (strncmp(rxData.c_str(), "REQ GET_IP", 10) == 0)
        {
            std::string str = "RES GET_IP " + _ip_address;
            write_camtx(str);
        }
        else if (strncmp(rxData.c_str(), "REQ GET_SSID", 12) == 0)
        {
            std::string str = "RES GET_SSID " + _ssid;
            write_camtx(str);
        }
        else
        { // relay
            USBSerial.println(rxData.c_str());
        }
    }
};
class BleChCamTx : public NimBLECharacteristicCallbacks
{
};

/** BLE <<<< */

/********************
 * setup
 */
void setup()
{
#ifdef TARGET_DEVICE_ATOMS3
    auto cfg = M5.config();
    M5.begin(cfg);            // AtomS3初期設定（LCD,UART,I2C,LED）
    M5.Lcd.begin();           // 画面初期化
    M5.Lcd.setRotation(1);    // 画面向き設定（USB位置基準 0：上/ 1：左/ 2：下/ 3：右）
    M5.Lcd.fillScreen(BLACK); // 背景
#endif

    USBSerial.begin(115200);
    USBSerial.setRxBufferSize(4096);//for big rtcm data

    // semaphore
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

    rtk_setup(); // g_settings required
    rtk_ble_setup(_ble_svr, _sem_var_access);

    startAdvertising();
}

void LCD_printf(char *format, ...) {
    char buff[32];
    va_list args;
    va_start(args, format);
    vsnprintf(buff, 32, format, args);
    va_end(args);

    int x = M5.Lcd.textWidth(buff);
    int y = M5.Lcd.getCursorY();
    int w = 128 - x;
    int h = M5.Lcd.fontHeight();
  
    M5.Lcd.printf(buff);
    M5.Lcd.fillRect(x, y, w, h, BLACK);
}

/********************
 * loop
 */
void loop()
{
    unsigned long msec = millis(); 

    _loop_count++;

    rtk_loop();

    if (msec - last_status_msec >= status_interval_msec)
    {
        last_status_msec = msec;

#ifdef TARGET_DEVICE_ATOMS3
        M5.Lcd.setTextColor(WHITE, BLACK);                 // 文字色
        M5.Lcd.setTextFont(2);                             // フォント
        M5.Lcd.setCursor(0, 0);                            // カーソル座標指定
        LCD_printf("SSID:%.11s\n", _ssid.c_str());     // アクセスポイント時のSSID表示
        M5.Lcd.setTextColor(ORANGE, BLACK);                // 文字色
        LCD_printf("IP:%.13s\n", _ip_address.c_str()); // IPアドレス表示
        M5.Lcd.drawFastHLine(0, 34, 128, WHITE);           // 指定座標から横線

        M5.Lcd.setCursor(0, 38);                           // カーソル座標指定
        M5.Lcd.setTextColor(CYAN, BLACK);                  // 文字色
        LCD_printf("LAT:%s\n", _nmea_gga.latitude.c_str());    //
        LCD_printf("LON:%s\n", _nmea_gga.longitude.c_str());   //
        LCD_printf("FIX:%s\n", _nmea_gga.fix_quality.c_str()); //
        LCD_printf("HDOP:%s\n", _nmea_gga.horizontal_dilution.c_str());        //
        LCD_printf("N_S:%s\n", _nmea_gga.num_satellites.c_str());        //
#endif

        _nmea_gga = NMEA_GGA(rtk_get_nmea());
        
        USBSerial.printf("REQ SET_NMEA %s\n", _nmea_gga.sentence.c_str());
    }
    if ((_loop_count % 500) == 0)
    {
        int step = (_loop_count / 500) % 2;
        switch (step)
        {
        case 0:
            USBSerial.println("REQ GET_IP");
            break;
        case 1:
            USBSerial.println("REQ GET_SSID");
            break;
        }
    }
    while (USBSerial.available() > 0)
    {
        int c = USBSerial.read();
        if (c == '\n')
        {
            _read_line.push_back('\0');
            if (strncmp((char *)_read_line.data(), "RES GET_IP ", 11) == 0)
            {
                _ip_address = (char *)(_read_line.data() + 11);
            }
            else if (strncmp((char *)_read_line.data(), "RES GET_SSID ", 13) == 0)
            {
                _ssid = (char *)(_read_line.data() + 13);
            }
            else if (strncmp((char *)_read_line.data(), "RES GET_RTCM ", 13) == 0)
            {
                uint8_t *data = _read_line.data() + 13;
                int len = _read_line.size() - 13;
                if (len > 0)
                {
                    rtk_push_rtcm(data, len);
                }
            }
            else if (strncmp((char *)_read_line.data(), "RES SET_STAT ", 15) == 0)
            {
                //TODO : handle configure
            }
            else
            {
                write_camtx((char *)_read_line.data());
            }
            // if (_read_line.size() > 50) {
            //   _read_line.resize(50);
            //   _read_line.push_back('\0');
            // }
            USBSerial.printf("ECH %s\n", (char *)_read_line.data());
            _read_line.clear();
        }
        else if (c == '\r')
        {
            // do nothing
        }
        else
        {
            _read_line.push_back(c);
        }
    }
}