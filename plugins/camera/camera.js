var create_plugin = (function() {
	var m_plugin_host = null;
	var m_options = null;
    var m_camera = null;
	var m_filepath = "";

    const BLE_SRV_PSERVER = "70333680-7067-0000-0001-000000000001";
    const BLE_SRV_PSERVER_C_RX = "70333681-7067-0000-0001-000000000001";
    const BLE_SRV_PSERVER_C_TX = "70333682-7067-0000-0001-000000000001";

	return function(plugin_host) {
		//debugger;
		m_plugin_host = plugin_host;

		function prepare_camera() {
			if (m_camera && m_camera.is_abend()) {
				m_camera = null;
			}
	
			if (!m_camera && m_options.camera) {
				let options = null;
                if(m_options.camera.camera_options){
                    options = m_options.camera.camera_options[m_options.camera.name];
                }
				switch (m_options.camera.name){
                case "pserver_ble":
                    if(bleApi){
                        var ble_device = null;
                        if(rtk){
                            var devs = rtk.get_ble_devices();
                            if(devs && devs.length != 0){
                                ble_device = devs[0].get_ble_device();
                            }
                        }
                        options = {
                            device : ble_device,
                            service_guid : BLE_SRV_PSERVER,
                            primary_service_guid : BLE_SRV_PSERVER,
                            characteristic_write_guid : BLE_SRV_PSERVER_C_RX,
                            characteristic_read_guid : BLE_SRV_PSERVER_C_TX,
                            command_values : {
                                'take_picture': new Uint8Array([0x10, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x03, 0x00, 0x02, 0x0C, 0x00, 0x00, 0x80, 0x00, 0x00]),
                                'read_response': new Uint8Array([0x10, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x0E, 0xC8, 0x02, 0x0C, 0x00, 0x00, 0x80, 0x00, 0x00]),
                                '_read_response': new Uint8Array([0x07, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
                            }
                        };
                        m_camera = bleApi.create_camera('unspecified', options);
                    }
                    break;
                case "ble":
                    if(bleApi){
                        m_camera = bleApi.create_camera('unspecified', options);
                    }
                    break;
                case "osc":
                    if(oscApi){
                        m_camera = oscApi.create_camera('unspecified', options);
                    }
                    break;
				}
			}
		}
		
		var plugin = {
			init_options : function(options) {
				m_options = options;
                if(m_options.camera && m_options.camera.load_html){
                    m_plugin_host.getFile("plugins/camera/camera.html", function(
                        chunk_array) {
                        var txt = (new TextDecoder).decode(chunk_array[0]);
                        var node = $.parseHTML(txt);
                        $('body').append(node);
                        fn.load('camera.html', () => {		
                            console.log('camera.html loaded');

                            document.getElementById('add-btn').addEventListener('click', function () {
                                plugin.take_picture();
                            });
                            document.getElementById('delete-btn').addEventListener('click', function () {
                                alert("delete");
                            });
                            document.getElementById('download-btn').addEventListener('click', function () {
                                alert("download");
                            });
                        });
                    });
                    m_plugin_host.getFile("plugins/camera/camera.css", function (
                        chunk_array) {
                        var txt = (new TextDecoder).decode(chunk_array[0]);
                        const el = document.createElement('style');
                        el.innerHTML = txt;
                        document.head.appendChild(el);
                    });
                }
				pgis.get_point_handler().add_create_table_callback((columns) => {
					columns['filepath'] = "TEXT";
				});
				pgis.get_point_handler().add_insert_callback((columns) => {
					columns['filepath'] = m_filepath;
					m_filepath = "";
				});
                if(rtk){
                    rtk.set_ble_server_connect_options({
                        optionalServices : [ BLE_SRV_PSERVER ],
                        callback : async (ble_server) => {
                            m_ble_server = ble_server;
                        }
                    });
                }
			},
			event_handler : function(sender, event) {
			},
			take_picture: () => {
				try {
					// create camera
					prepare_camera();
                    if (!m_camera) {
                        console.log("no camera");
                        return;
                    }
	
					// take picture
					console.log("taking picture");
					switch (m_options.camera.name) {
                    case "pserver_ble":
                    case "ble":
                        m_camera.take_picture((res) => {
                            if (res.status === 'ok') {
                                let a = res.body.file_name.split('/');
                                let fname = a[a.length - 1];
                                m_filepath = fname;
                                m_point_handler.set_point(cur_pos);
                                refresh_point_layer();
                                console.log(`file: ${fname}`);
                                console.log(`---`);
                            }
                            else if (res.status === 'processing') {
                                console.log(res.body.state);
                            }
                            else {
                                console.log(JSON.stringify(res));
                            }
                        });
                        break;
                    case "osc":
                        m_camera.take_picture((res) => {
                            if (res.status === 'ok') {
                                let a = res.body.file_url.split('/');
                                let fname = a[a.length - 1] + ".json";
                                console.log(`file: ${fname}`);
                                console.log(`---`);
                            } else {
                                console.log(res.body);
                            }
                        });
                        break;
					}
				}
				catch (err) {
					console.log(err);
				}
			},
            add_current_pos: () => {
                if (m_last_gps_info) {
                    var p = convert_gpsinfo_to_gpspoint(m_last_gps_info);
                    m_point_handler.set_point(p);
                    refresh_point_layer();
                }
            },
            remove_pos: () => {
                if (m_map_selected_marker) {
                    var p = m_map_markers[m_map_selected_marker._leaflet_id];
                    if (p) {
                        m_point_handler.delete_point(p.id);
                        refresh_point_layer();
                    }
                }
            },
            clear_pos: () => {
                var points = m_point_handler.get_points();
                points.forEach((p) => {
                    m_point_handler.delete_point(p.id);
                });
                refresh_point_layer();
            },
            load_points: () => {
                if (!m_e_fileinput) {
                    m_e_fileinput = document.getElementById('file-input');
                    m_e_fileinput.addEventListener('change', function (e) {
                        var file = e.target.files[0];
                        if (!file) return;
    
                        var reader = new FileReader();
                        reader.onload = function (e) {
                            var contents = e.target.result;
                            var json = JSON.parse(contents);
                            console.log(json);
    
                            self.clear_pos();
    
                            json.forEach(p => {
                                m_point_handler.set_point(p);
                            });
                            refresh_point_layer();
                        };
                        reader.readAsText(file);
                    });
                }
                m_e_fileinput.click();
            },
			download_json_file: () => {

                let points = pgis.get_point_handler().get_points();
                download_json_file(points);

                function download_json_file(json, fname) {

                    if (!fname) {
                        let date = new Date();
                        fname = date.toLocaleString().replace(/\//g, '-').replace(/:/g, '-') + ".json";
                    }

                    const text = JSON.stringify(json);
                    const blob = new Blob([text], { type: 'application/json' });

                    let dummy_a_el = document.createElement('a');
                    document.body.appendChild(dummy_a_el);
                    dummy_a_el.href = window.URL.createObjectURL(blob);
                    dummy_a_el.download = fname;
                    dummy_a_el.click();
                    document.body.removeChild(dummy_a_el);
                    return fname;
                }
            }
		};
		return plugin;
	}
})();