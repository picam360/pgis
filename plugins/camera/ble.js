
/**
 * 
 * BLE
 */
const bleApi = class {
    static create_camera(camera_type, options) {
        switch (camera_type) {
            case 'insta360x3':
                return new bleCam_Insta360x3(options);
            default:// not confirmed cameras.
                return new bleCam_Insta360x3(options);
        }
    }
}

class IBLECamera {
    constructor() {
        if (this.constructor === IBLECamera) {
            throw new Error('interface can not be called as class');
        }
    }
    take_picture(cbRes) { throw new Error('not implemented'); }
    m_is_abend() { throw new Error('not implemented'); }
}

const bleCam_Insta360x3 = class extends IBLECamera {
    constructor(options) {
        super();
        this.CMD_TIMEOUT_MS = 20000;
        this.m_options = options;
        this.m_service_guid = options.service_guid;
        this.m_primary_service_guid = options.primary_service_guid;
        this.m_characteristic_write_guid = options.characteristic_write_guid;
        this.m_characteristic_read_guid = options.characteristic_read_guid;
        this.m_command_values = options.command_values;
        this.m_device = options.device;
        this.m_callback = null;
        this.m_b_subsc_notfications = false;
        this.m_characteristic_write = null;
        this.m_characteristic_read = null;
        this.m_command_wait_timer = null;
        this.m_is_abend = false;
        this.m_cur_command;
        this.m_res_text;
        this.m_n_res_bytes;
        this.m_command_step;
    }

    is_abend() {
        return this.m_is_abend;
    }

    _connect_device(next_action) {
        navigator.bluetooth.requestDevice({
            filters: [{
                services: [this.m_service_guid]
            }]
        })
        .then(device => {
            this.m_device = device;
            this._subsc_nogifications(
                next_action
            )
        })
        .catch(err => {
            throw new Error({
                'status': 'connection_failed',
                'body': err
            });
        });
    }

    _handle_notification(data) {
        if (this.m_cur_command === "take_picture") {
            const CMD_LEN = 16;
            let offset = 0;
            let u8a = new Uint8Array(data.buffer);
            if (u8a.byteLength >= CMD_LEN) {

                // on shuttred.
                if (u8a[4] == 0x04 &&
                    u8a[7] == 0x10 &&
                    u8a[9] == 0x02 &&
                    u8a[10] == 0xff) {
                    if (this.m_command_step == 0) {
                        this.m_callback({
                            'status': 'processing',
                            'body': {
                                'state': "shuttered"
                            }
                        });
                        this.m_command_step++;
                    }
                }

                // on start saving image.
                if (u8a[4] == 0x04 &&
                    u8a[7] == 0x0a &&
                    u8a[9] == 0x02 &&
                    u8a[10] == 0xff) {
                    this.m_callback({
                        'status': 'processing',
                        'body': {
                            'state': "saving image"
                        }
                    });
                    this.m_command_step++;
                }

                // on iamge saved.
                if (u8a[4] == 0x04 &&
                    u8a[7] == 0xc8 &&
                    u8a[9] == 0x02 &&
                    u8a[10] == 0x0c) {
                    this.m_n_res_bytes = u8a[0];
                    offset = 16;
                    this._stop_command_timer();
                }
            }
            if (this.m_n_res_bytes > 0) {
                let a0 = Array.prototype.slice.call(u8a, offset);
                this.m_res_text += String.fromCharCode.apply(null, a0);
                this.m_n_res_bytes -= (a0.length + offset);
                if (this.m_n_res_bytes == 0) {
                    this.m_res_text = trimNullAndDLE(this.m_res_text);
                    console.log(this.m_res_text);
                    this.m_callback({
                        'status': 'ok',
                        'body': {
                            'file_name': this.m_res_text
                        }
                    });
                    this._clear_command_result();
                }
            }
        }
        else {
            this._stop_command_timer();
        }

        let hexString = "";
        for (let i = 0; i < data.byteLength; i++) {
            let byte = data.getUint8(i).toString(16);
            if (byte.length === 1) {
                byte = "0" + byte;
            }
            hexString += byte;
        }
        console.log(hexString);
    }

    _subsc_nogifications(on_connected) {
        if (this.m_b_subsc_notfications) {
            if (on_connected) {
                on_connected();
            }
            return;
        }

        if (!this.m_device) {
            throw new Error("error: _subsc_nogifications: device must be connected");
        }
        else {
            this.m_device.gatt.connect()
                .then(server => {
                    return server.getPrimaryService(this.m_primary_service_guid);
                })
                .then(service => {
                    return service.getCharacteristic(this.m_characteristic_read_guid);
                })
                .then(characteristic => {
                    characteristic.startNotifications()
                        .then(() => {
                            this.m_b_subsc_notfications = true;
                            this.m_characteristic_read = characteristic;
                            console.log('notification subscribed...');
                            characteristic.addEventListener('characteristicvaluechanged',
                                (event) => {
                                    this._handle_notification(characteristic.value);
                                });
                            if (on_connected) {
                                on_connected();
                            }
                        })
                        .catch(error => {
                            console.error(error);
                        });
                });
        }
    }

    _clear_command_result() {
        this.m_cur_command = '';
        this.m_n_res_bytes = 0;
        this.m_res_text = '';
        this.m_command_step = 0;
    }

    _command_write(command_name, command_value) {
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
                this.m_cur_command = command_name;
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
        this.m_callback = callback;
        let command_name = 'take_picture';
        let command_value = this.m_command_values[command_name];
        let next_cmd = () => {
            this._command_write(command_name, command_value);
        };
        if (!this.m_device) {
            this._connect_device(next_cmd);
        } else if(!this.m_b_subsc_notfications) {
            this._subsc_nogifications(next_cmd);
        } else {
            next_cmd();
        }
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