

const BLE_SRV_PSERVER      = "70333680-7067-0000-0001-000000000001";
const BLE_SRV_PSERVER_C_RX = "70333681-7067-0000-0001-000000000001";
const BLE_SRV_PSERVER_C_TX = "70333682-7067-0000-0001-000000000001";
const BLE_CONN_RETRY_MS = 6000;

class IBLECamera {
    constructor() {
        if (this.constructor === IBLECamera) {
            throw new Error('interface can not be called as class');
        }
    }
    take_picture(cbRes) { throw new Error('not implemented'); }
    m_is_abend() { throw new Error('not implemented'); }
}

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
        }else if(str.startsWith("RES RESET_WIFI ")){
            if(this.m_callback.RESET_WIFI){
                var list = str.split(' ');
                this.m_callback.RESET_WIFI(list[2]);
                this.m_callback.RESET_WIFI = null;
            }
        }else if(str.startsWith("RES CONNECT_WIFI ")){
            if(this.m_callback.CONNECT_WIFI){
                var list = str.split(' ');
                this.m_callback.CONNECT_WIFI(list[2]);
                this.m_callback.CONNECT_WIFI = null;
            }
        }else if(str.startsWith("RES ENABLE_APMODE ")){
            if(this.m_callback.ENABLE_APMODE){
                var list = str.split(' ');
                this.m_callback.ENABLE_APMODE(list[2]);
                this.m_callback.ENABLE_APMODE = null;
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
    async reset_wifi(callback){
        this.m_callback.RESET_WIFI = callback;
        this.writeGattValue("REQ RESET_WIFI");
    }
    async connect_wifi(ssid, password, callback){
        this.m_callback.CONNECT_WIFI = callback;
        this.writeGattValue(`REQ CONNECT_WIFI ${ssid} ${password}`);
    }
    async enable_apmode(ipaddress, ssid, password, callback){
        this.m_callback.ENABLE_APMODE = callback;
        this.writeGattValue(`REQ ENABLE_APMODE ${ipaddress} ${ssid} ${password}`);
    }
    
}

var create_plugin = (function() {
	var m_plugin_host = null;
	var m_options = null;
    var m_pserver_ble = null;

	return function(plugin_host) {
		//debugger;
		m_plugin_host = plugin_host;
		
		var plugin = {
			init_options : function(options) {
				m_options = options;

                setTimeout(() => {
                    document.getElementById('config-btn').addEventListener('click', function () {
                        plugin.open_config();
                    });
                }, 1000);
            },
            connect_ble : () => {
                var rtk_plugin = m_plugin_host.get_plugin("rtk");
                if(rtk_plugin){
                    rtk.set_ble_server_connect_options({
                        optionalServices : [ BLE_SRV_PSERVER ],
                        callback : async (ble_device, ble_server) => {
                            m_ble_server = ble_server;
                            if (m_options.name == "pserver"){
                                if(!bleCam_Pserver){
                                    alert("pserver_ble.js might not be loaded.");
                                    return;
                                }
                                var options = {
                                    device : ble_device,
                                    server : ble_server,
                                };
                                m_pserver_ble = new bleCam_Pserver(options);
                                m_pserver_ble.start_connect(() => {
                                    console.log("connect pserver_ble device");
                                }, () => {
                                    console.log("connect pserver_ble server");
                                });
                            }
                        }
                    });
                    rtk_plugin.start_rtk();
                }else{
                    let set_onclick = () => {
                        let btn = document.getElementById("start-dialog-close-btn");
                        btn.onclick = () => {
                            var options = {
                                device : null,
                                server : null,
                            };
                            m_pserver_ble = new bleCam_Pserver(options);
                            m_pserver_ble.start_connect(() => {
                                console.log("connect pserver_ble device");
                            }, () => {
                                console.log("connect pserver_ble server");
                            });
                            document.getElementById('start-dialog').remove();
                        };
                    };
                    ons.createElement('start-dialog.html', { append: true })
                    .then(function (dialog) {
                        set_onclick();
                        dialog.show();
                    });
                }
            },
            open_apmode_config : () => {
                ons.createElement('apmode-dialog.html', { append: true })
                .then(function (dialog) {

                    $("#reset-btn").click(function() {
                        m_pserver_ble.reset_wifi((result) => {
                            if(result == "SUCCEEDED"){
                                alert("Wifi Reset Succeeded!");
                            }else{
                                alert("Wifi Reset Failed!");
                            }
                            $("#apmode-dialog")[0].remove();
                        });
                    });

                    $("#connect-btn").click(function() {
                        let ssid = $("#ssid").val();
                        let password = $("#password").val();
                        let ipaddress = $("#ipaddress").val();
                        if(!ipaddress){
                            ipaddress = "1";
                        }

                        m_pserver_ble.enable_apmode(ipaddress, ssid, password, (result) => {
                            if(result == "SUCCEEDED"){
                                alert("AP Mode Succeeded!");
                            }else{
                                alert("AP Mode Failed!");
                            }
                            $("#apmode-dialog")[0].remove();
                        });
                    });
                
                    $("#cancel-btn").click(function() {
                        $("#apmode-dialog")[0].remove();
                    });

                    dialog.show();
                });
            },
            open_wifi_config : () => {
                m_pserver_ble.get_ssid((current_ssid) => {
                    m_pserver_ble.get_wifi_networks((list) => {
                        ons.createElement('wifi-dialog.html', { append: true })
                        .then(function (dialog) {

                            const ssidSelect = $("#ssid-select")[0];
                            list.forEach(ssid => {
                                const selected = (ssid == current_ssid);
                                ssidSelect.options.add(new Option(ssid, ssid, selected, selected));
                            });
                            {//AP MODE
                                ssidSelect.options.add(new Option("@AP_MODE@", "@AP_MODE@", false, false));
                            }

                            $("#connect-btn").click(function() {
                                const ssid = $("#ssid-select").val();
                                const password = $("#password").val();

                                m_pserver_ble.connect_wifi(ssid, password, (result) => {
                                    if(result == "SUCCEEDED"){
                                        alert("Wifi Connection Succeeded!");
                                    }else{
                                        alert("Wifi Connection Failed!");
                                    }
                                    $("#wifi-dialog")[0].remove();
                                });
                            });
                        
                            $("#cancel-btn").click(function() {
                                $("#wifi-dialog")[0].remove();
                            });

                            dialog.show();
                        });
                    });
                });
            },
            open_config : () => {
                ons.createElement('config-dialog.html', { append: true })
                .then(function (dialog) {
                    $("#config-dialog-default-btn").hide();

                    if(m_options.url){
                        document.getElementById('camera-url').value = m_options.url;
                    }
                    
                    function isValidIPAddress(ip) {
                        const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/;
                        return ipv4Regex.test(ip);
                    }

                    var ip_timer = setInterval(() => {
                        if(m_pserver_ble){
                            m_pserver_ble.get_ip((ip) => {
                                if(!isValidIPAddress(ip)){
                                    return;
                                }
                                document.getElementById('camera-url').value = `https://${ip}:9002`;
                            });
                        }
    
                    }, 1000);

                    var connect_ble = m_options.connect_ble;
                    $("#ble-btn").css('background-color', (connect_ble ? 'steelblue' : 'white'));
                    document.getElementById('ble-btn').addEventListener('click', function () {
                        if(!connect_ble){
                            connect_ble = true;
                            if(!m_pserver_ble){
                                plugin.connect_ble();
                            }
                            $("#ble-btn").css('background-color', 'steelblue');
                        }else{
                            connect_ble = false;
                            $("#ble-btn").css('background-color', 'white');
                        }
                    });

                    if(m_pserver_ble){
                        m_pserver_ble.get_ip((ip) => {
                            if(ip.startsWith("ERROR_NO_RESPONSE")){
                                return;
                            }
                            $("#wifi-btn").show();

                            
                            let pressTimer = 0;
                            const threshold = 3000;
                            document.getElementById('wifi-btn').addEventListener('mousedown', () => {
                                pressTimer = setTimeout(() => {
                                    pressTimer = 0;
                                    plugin.open_apmode_config();
                                }, threshold);
                            });
                            
                            document.getElementById('wifi-btn').addEventListener('mouseup', function () {
                                if(pressTimer){
                                    clearTimeout(pressTimer);
                                    pressTimer = 0;
                                    plugin.open_wifi_config();
                                }
                            });
                        });

                        var rtk_plugin = m_plugin_host.get_plugin("rtk");
                        if(rtk_plugin){
                            $("#rtk-btn").show();
                        
                            document.getElementById('rtk-btn').addEventListener('click', function () {
                                $("#config-dialog")[0].remove();
                                rtk_plugin.open_base_setting_config_page();
                            });
                        }
                    }
                
                    $("#config-dialog-ok-btn").click(function() {
                        m_options.url = document.getElementById('camera-url').value;
                        m_permanent_options.url = m_options.url;

                        m_options.connect_ble = connect_ble;
                        m_permanent_options.connect_ble = m_options.connect_ble;

						localStorage.setItem('camera_js_options', JSON.stringify(m_permanent_options));

                        clearInterval(ip_timer);
                        $("#config-dialog")[0].remove();
                    });
                
                    $("#config-dialog-close-btn").click(function() {
                        clearInterval(ip_timer);
                        $("#config-dialog")[0].remove();
                    });

                    dialog.show();
                });
            },
		};
		return plugin;
	}
})();