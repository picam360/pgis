var create_plugin = (function() {
	var m_plugin_host = null;
	var m_options = null;
    var m_camera = null;
	var m_filepath = "";

    function display_text(text) {
        let e = document.getElementById("textDisplay");
        e.value = (text + '\n' + e.value);
    }

    /**
     * 
     * BLE
     */
    const bleApi = class {
        static createCamera(camera_type, camera_options) {
            switch (camera_type) {
                case 'insta360x3':
                    return new bleCam_Insta360x3(camera_options);
                default:// not confirmed cameras.
                    return new bleCam_Insta360x3(camera_options);
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
        constructor(camera_options) {
            super();
            this.CMD_TIMEOUT_MS = 20000;
            this.m_camera_options = camera_options;
            this.m_service_guid = camera_options.service_guid;
            this.m_primary_service_guid = camera_options.primary_service_guid;
            this.m_characteristic_write_guid = camera_options.characteristic_write_guid;
            this.m_characteristic_read_guid = camera_options.characteristic_read_guid;
            this.m_command_values = camera_options.command_values;
            this.m_device = null;
            this.m_callback = null;
            this.m_b_subsc_notfications = false;
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
            this.m_command_wait_timer = null;
            this.m_is_abend = true;
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
            }
            else {
                next_cmd();
            }
        }
    }


    /**
     * 
     * OSC
     */
    const oscApi = class {
        static create_camera(camera_type, camera_options) {
            switch (camera_type) {
                case 'insta360x3':
                    return new oscCam_General(camera_options);
                default:// not confirmed cameras.
                    return new oscCam_General(camera_options);
            }
        }
    }

    class IOSCCamera {
        constructor() {
            if (this.constructor === IOSCCamera) {
                throw new Error('interface can not be called as class');
            }
        }
        take_picture(cbRes) { throw new Error('not implemented'); }
        is_abend() { throw new Error('not implemented'); }
    }

    const oscCam_General = class extends IOSCCamera {
        constructor(camera_options) {
            super();
            this.camera_options = camera_options;
            this.cmd_check_timer = null;
            this.camera_url = camera_options['camera_url'];
        }

        take_picture(callback) {

            let cmd = {
                name: "camera.takePicture"
            }
            apiCommand(JSON.stringify(cmd), (json) => {
                if (json.id) {
                    let cmd = {
                        id: json.id
                    }
                    this.cmd_check_timer = setInterval(() => {
                        apiGetStatus(JSON.stringify(cmd), (json) => {
                            if (json.state == "done") {
                                stopTimer();
                                callback({
                                    'status': 'ok',
                                    'body': {
                                        'file_url': json.results.fileUrl
                                    }
                                });
                            }
                        }, err => {
                            stopTimer();
                        });
                    }, 100);
                }
                else {
                    callback({
                        'status': 'invalid_response_from_camera',
                        'body': json
                    });
                }
            }, (err) => {
                callback({
                    'status': 'invalid_response_from_camera',
                    'body': err
                });
            });
        }

        stopTimer() {
            if (this.cmd_check_timer) {
                clearInterval(this.cmd_check_timer);
                this.cmd_check_timer = null;
            }
        }

        api_get_info(cbSuc, cbErr) {
            fetchApi(this.camera_url + "/osc/info", "", cbSuc, cbErr);
        }
        api_command(jsonText, cbSuc, cbErr) {
            fetchApi(this.camera_url + "/osc/commands/execute", jsonText, cbSuc, cbErr);
        }
        api_get_status(jsonText, cbSuc, cbErr) {
            fetchApi(this.camera_url + "/osc/commands/status", jsonText, cbSuc, cbErr);
        }
        fetch_api(url, jsonText, cbSuc, cbErr) {
            var myHeaders = new Headers();
            myHeaders.append("Content-Type", "application/json;charset=utf-8");
            myHeaders.append("Accept", "application/json");
            myHeaders.append("X-XSRF-Protected", "1");

            // var raw = "{\n    \"name\": \"camera.getOptions\",\n    \"parameters\": {\n      \"optionNames\": [\n          \"captureMode\",\n          \"fileFormat\",\n          \"gpsInfo\",\n          \"gpsSupport\"\n      ]\n  }\n}";
            var raw = jsonText;

            var requestOptions = {
                method: 'POST',
                headers: myHeaders,
                body: raw,
                redirect: 'follow'
            };

            fetch(url, requestOptions)
                .then(response => response.json())
                .then(json => { display_text(json); if (cbSuc) cbSuc(json); })
                .catch(error => { display_text(error); if (cbErr) cbErr(error); })
        }
    }

    function fetch_json_file(file_name, callback) {
        let url = `${get_current_url()}/${file_name}`;
        let head = new Headers();
        head.append("Content-Type", "application/json;charset=utf-8");
        head.append("Accept", "application/json");

        var req_op = {
            method: 'GET',
            headers: head,
            redirect: 'follow'
        };

        fetch(url, req_op)
            .then(response => response.json())
            .then(json => { callback(json) })
            .catch(error => { callback(error) })
    }

    function get_current_url() {
        var url = window.location.href;
        var index = url.lastIndexOf("/");
        var baseUrl = url.substring(0, index);
        return baseUrl;
    }

	return function(plugin_host) {
		//debugger;
		m_plugin_host = plugin_host;
		m_plugin_host.getFile("plugins/camera/camera.html", function(
			chunk_array) {
			var txt = (new TextDecoder).decode(chunk_array[0]);
			var node = $.parseHTML(txt);
			$('body').append(node);
			fn.load('camera.html', () => {		
				console.log('camera.html loaded');
			});
		});

		function prepare_camera() {
			if (m_camera && m_camera.is_abend()) {
				m_camera = null;
			}
	
			if (!m_camera) {
				let camera_options = m_options.camera_options[m_options.camera_option_name];
				if (m_options.camera_conn === "bluetooth") {
					m_camera = bleApi.createCamera('unspecified', camera_options);
				}
				else if (m_options.camera_conn === "osc") {
					m_camera = oscApi.create_camera('unspecified', camera_options)
				}
			}
		}
		
		var plugin = {
			init_options : function(options) {
				m_options = options;
				pgis.take_picture = plugin.take_picture;
				pgis.get_point_handler().add_create_table_callback((columns) => {
					columns['filepath'] = "TEXT";
				});
				pgis.get_point_handler().add_insert_callback((columns) => {
					columns['filepath'] = m_filepath;
					m_filepath = "";
				});
			},
			event_handler : function(sender, event) {
			},
			take_picture: () => {
				try {
					// create camera
					prepare_camera();
	
					// take picture
					display_text("taking picture");
					switch (m_options.camera_conn) {
						case "bluetooth":
							m_camera.take_picture((res) => {
								if (res.status === 'ok') {
									let a = res.body.file_name.split('/');
									let fname = a[a.length - 1];
									m_filepath = fname;
									m_point_handler.set_point(cur_pos);
									refresh_point_layer();
									display_text(`file: ${fname}`);
									display_text(`---`);
								}
								else if (res.status === 'processing') {
									display_text(res.body.state);
								}
								else {
									display_text(JSON.stringify(res));
								}
							});
							break;
						case "osc":
							m_camera.take_picture((res) => {
								if (res.status === 'ok') {
									let a = res.body.file_url.split('/');
									let fname = a[a.length - 1] + ".json";
									display_text(`file: ${fname}`);
									display_text(`---`);
								} else {
									display_text(res.body);
								}
							});
							break;
					}
				}
				catch (err) {
					display_text(err);
				}
			},
		};
		return plugin;
	}
})();