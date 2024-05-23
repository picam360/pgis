

const BLE_SRV_PSERVER = "70333680-7067-0000-0001-000000000001";
const BLE_SRV_PSERVER_C_RX = "70333681-7067-0000-0001-000000000001";
const BLE_SRV_PSERVER_C_TX = "70333682-7067-0000-0001-000000000001";

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

        this.m_callback = null;
        this.m_is_abend = false;
        this.m_ip_address = "";
        this.m_ssid = "";
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
                this._ble_dev = await navigator.bluetooth.requestDevice({
                    //acceptAllDevices: true,
                    filters: [{
                        services: [BLE_SRV_PSERVER]
                    }],
                });
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

                var step = 0;
                setInterval(() => {
                    switch(step%2){
                    case 0:
                        this._ble_c_camrx.writeValue(new TextEncoder().encode("REQ GET_IP"));
                        break;
                    case 1:
                        this._ble_c_camrx.writeValue(new TextEncoder().encode("REQ GET_SSID"));
                        break;
                    }
                    step++;
                }, 2000);
            });

            if (this._on_server_connected) {
                this._on_server_connected(this._ble_server);
            }
        } catch (error) {
            setTimeout(() => this.connectToServer(), BLE_CONN_RETRY_MS);
            console.error("Failed to connect to ble:", error);
        }
    }
    readCharacteristicValue = (event) => {
        let data = event.target.value;
        var str = new TextDecoder().decode(data);
        if(str.startsWith("RES GET_IP ")){
            this.m_ip_address = str.substring(11);
        }else if(str.startsWith("RES GET_SSID ")){
            this.m_ssid = str.substring(13);
        }
        console.log("BLE_CAMTX", str);
    }

    is_abend() {
        return this.m_is_abend;
    }

    _command_write(command_value) {
        if (this.m_command_wait_timer) {
            console.log('command skipped because prev command runnning')
            return;
        }

        this._clear_command_result();
        this.m_device.gatt.connect()
            .then(server => {
                return server.getPrimaryService(this.m_primary_service_guid);
            })
            .then(service => {
                return service.getCharacteristic(this.m_characteristic_write_guid);
            })
            .then(characteristic => {
                this.m_characteristic_write = characteristic;
                this.m_command_wait_timer = setTimeout(
                    this._command_timeout.bind(this),
                    this.CMD_TIMEOUT_MS);
                return characteristic.writeValue(command_value);
            })
            .then((data) => {
                // this.m_callback({
                //     'status': 'ok'
                // });
            })
            .catch(err => {
                throw new Error({
                    'status': 'connection_failed',
                    'body': err
                });
            });
    }

    _command_timeout() {
        this._clear_command_result();
        this.m_command_wait_timer = null;
        this.m_is_abend = true;
        if(this.m_b_subsc_notfications){
            this.m_b_subsc_notfications = false;
            this.m_characteristic_read.stopNotifications().then(() => {
                console.log('Notifications stopped');
            }).catch(error => {
                console.log('Failed to stop notifications: ', error);
            });
            this.m_characteristic_read = null;
        }
        this.m_callback({
            'status': 'command_timeout',
            'body': {
                'command': this.m_cur_command
            }
        });
    }

    _stop_command_timer() {
        if (this.m_command_wait_timer) {
            clearTimeout(this.m_command_wait_timer);
            this.m_command_wait_timer = null;
        }
    }
    take_picture(callback) {
    }
    get_ip(callback){
        callback(this.m_ip_address);
    }
    get_ssid(callback){
        callback(this.m_ssid);
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