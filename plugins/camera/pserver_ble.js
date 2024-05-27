

const BLE_SRV_PSERVER      = "70333680-7067-0000-0001-000000000001";
const BLE_SRV_PSERVER_C_RX = "70333681-7067-0000-0001-000000000001";
const BLE_SRV_PSERVER_C_TX = "70333682-7067-0000-0001-000000000001";
const BLE_CONN_RETRY_MS = 6000;

const bleCam_Pserver = class extends IBLECamera {
    constructor(options) {
        super();
        this._device_id = options.device_id;
        this._ble_dev = options.device;
        this._ble_server = options.server;
        this._ble_c_camrx = null;
        this._ble_c_camtx = null;
        this._on_device_connected = null;
        this._on_server_connected = null;
        this._writeOperationInProgress = false;

        this.m_callback = {};
        this.m_is_abend = false;
        this.m_ip_address = "ERROR_NO_RESPONSE";
        this.m_ssid = "ERROR_NO_RESPONSE";
    }
    start_connect = (on_device_connected, on_server_connected) => {
        this._on_device_connected = on_device_connected;
        this._on_server_connected = on_server_connected;
        this.connectToDevice();
    }
    get_ble_device = () => {
        return this._ble_dev;
    }
    get_ble_server = () => {
        return this._ble_server;
    }

    async connectToDevice() {
        try {
            if(!this._ble_dev){
                var options = {
                    optionalServices : []
                };
                options.optionalServices.push(BLE_SRV_PSERVER);
                const params = new URLSearchParams(window.location.search);
                if(params.has('disable-ble-filter')){
                    options.acceptAllDevices = true;
                }else{
                    options.filters = [{ namePrefix: "PBD" }];
                }
                this._ble_dev = await navigator.bluetooth.requestDevice(options);
                console.log("Found device: " + this._ble_dev.name);
                this._ble_dev.addEventListener('gattserverdisconnected', (event) => {
                    const device = event.target;
                    console.log(`Device ${device.name} is disconnected.`);
                    this.connectToServer();
                });
            }

            if (this._on_device_connected) {
                this._on_device_connected();
            }

            await this.connectToServer();
        } catch (error) {
            setTimeout(() => this.connectToDevice(), BLE_CONN_RETRY_MS);
            console.error("Failed to connect:", error);
        }
    }
    async connectToServer() {
        try {
            if(!this._ble_server){
                this._ble_server = await this._ble_dev.gatt.connect();
            }
            const service = await this._ble_server.getPrimaryService(BLE_SRV_PSERVER);
            this._ble_c_camrx = await service.getCharacteristic(BLE_SRV_PSERVER_C_RX);
            this._ble_c_camtx = await service.getCharacteristic(BLE_SRV_PSERVER_C_TX);
            console.log("Connected to device: " + this._ble_server.device.name);

            this._ble_c_camtx.startNotifications().then(_ => {
                this._ble_c_camtx.addEventListener('characteristicvaluechanged', this.readCharacteristicValue);

                var request_status = (step) => {
                    switch(step%2){
                    case 0:
                        this.writeGattValue("REQ GET_IP");
                        break;
                    case 1:
                        this.writeGattValue("REQ GET_SSID");
                        break;
                    }
                    setTimeout(() => {
                        request_status(step + 1);
                    }, (step <= 0 ? 1000 : 5000));
                }
                request_status(0);
            });

            if (this._on_server_connected) {
                this._on_server_connected(this._ble_server);
            }
        } catch (error) {
            setTimeout(() => this.connectToServer(), BLE_CONN_RETRY_MS);
            console.error("Failed to connect to ble:", error);
        }
    }

    async writeGattValue(value) {

        if (this._writeOperationInProgress) {
            console.log('GATT operation already in progress.');
            return;
        }

        this._writeOperationInProgress = true;

        try {
            await this._ble_c_camrx.writeValue(new TextEncoder().encode(value));
        } catch (error) {
            console.error('GATT operation failed:', error);
        } finally {
            this._writeOperationInProgress = false;
        }
    }
    readCharacteristicValue = (event) => {
        let data = event.target.value;
        var str = new TextDecoder().decode(data);
        if(str.startsWith("RES GET_IP ")){
            this.m_ip_address = str.substring(11);
        }else if(str.startsWith("RES GET_SSID ")){
            this.m_ssid = str.substring(13);
        }else if(str.startsWith("RES GET_WIFI_NETWORKS ")){
            if(this.m_callback.GET_WIFI_NETWORKS){
                var list = str.split(' ');
                this.m_callback.GET_WIFI_NETWORKS(list.slice(2));
                this.m_callback.GET_WIFI_NETWORKS = null;
            }
        }else if(str.startsWith("RES CONNECT_WIFI ")){
            if(this.m_callback.CONNECT_WIFI){
                var list = str.split(' ');
                this.m_callback.CONNECT_WIFI(list[2]);
                this.m_callback.CONNECT_WIFI = null;
            }
        }
        console.log("BLE_CAMTX", str);
    }

    is_abend() {
        return this.m_is_abend;
    }
    
    take_picture(callback) {
    }
    get_ip(callback){
        callback(this.m_ip_address);
    }
    get_ssid(callback){
        callback(this.m_ssid);
    }
    async get_wifi_networks(callback){
        this.m_callback.GET_WIFI_NETWORKS = callback;
        this.writeGattValue("REQ GET_WIFI_NETWORKS");
    }
    async connect_wifi(ssid, password, callback){
        this.m_callback.CONNECT_WIFI = callback;
        this.writeGattValue(`REQ CONNECT_WIFI ${ssid} ${password}`);
    }
}

var create_plugin = (function() {
	var m_plugin_host = null;
	var m_options = null;

	return function(plugin_host) {
		//debugger;
		m_plugin_host = plugin_host;
		
		var plugin = {
			init_options : function(options) {
				m_options = options;
            },
		};
		return plugin;
	}
})();