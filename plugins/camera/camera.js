var create_plugin = (function() {
	var m_plugin_host = null;
	var m_options = null;
    var m_camera = null;

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

                            document.getElementById('view-btn').addEventListener('click', function () {
                                plugin.open_pviewer();
                            });

                            document.getElementById('add-btn').addEventListener('click', function () {
                                plugin.take_picture();
                            });
                            document.getElementById('delete-btn').addEventListener('click', function () {
                                plugin.remove_pos();
                            });
                            document.getElementById('download-btn').addEventListener('click', function () {
                                plugin.generate_psf();
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
				pgis.get_point_handler().add_insert_callback((columns, gp) => {
					columns['filepath'] = gp.filepath;
				});
                if(window.rtk){
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
            open_pviewer: () => {
                // create camera
                prepare_camera();
                if (!m_camera) {
                    console.log("no camera");
                    return;
                }

                //var pviewer_url = "https://picam360.github.io/pviewer";
                var pviewer_url = "https://localhost/pviewer";

                var features = pgis.get_map_handler().get_selected_points();
                if(features && features.length > 0){
                    var pgis_p = features[0].pgis_point;
                    var pvf_url = m_camera.camera_url + "/pvf/" + pgis_p.filepath;
                    var url = pviewer_url + "?pvf=" + encodeURIComponent(pvf_url);
                    window.open(url, '_blank');
                }else{
                    var psf_config = plugin.get_psf_config();
                    if(psf_config.points.length > 0){
                        for(var psf_p of psf_config.points){
                            var pvf_url = m_camera.camera_url + "/pvf/" + psf_p.path;
                            psf_p.path = pvf_url;
                        }
                        psf_config.start_point = psf_config.points[0].path;
                    }
                    var psf_config_txt = "data:application/json;base64," + btoa(JSON.stringify(psf_config));
                    var url = pviewer_url + "?pvf=" + encodeURIComponent(psf_config_txt);
                    window.open(url, '_blank');
                }
            },
			take_picture: () => {
				try {
					// create camera
					prepare_camera();
                    if (!m_camera) {
                        console.log("no camera");
                        return;
                    }

                    var take_picture_callback = (res) => {
                        if (res.status === 'ok') {
                            let a = res.body.file_name.split('/');
                            let fname = a[a.length - 1];
                            var cur_pos = pgis.get_gps_handler().get_current_position();
                            cur_pos.filepath = fname;
                            pgis.get_point_handler().set_point(cur_pos);
                            pgis.get_map_handler().refresh();
                            console.log(`file: ${fname}`);
                            console.log(`---`);
                        }
                        else if (res.status === 'processing') {
                            console.log(res.body.state);
                        }
                        else {
                            console.log(JSON.stringify(res));
                        }
                    };
	
					// take picture
					console.log("taking picture");
					switch (m_options.camera.name) {
                    case "pserver_ble":
                    case "ble":
                        m_camera.take_picture(take_picture_callback);
                        break;
                    case "osc":
                        m_camera.take_picture(take_picture_callback);
                        break;
					}
				}
				catch (err) {
					console.log(err);
				}
			},
            generate_psf: () => {
                // create camera
                prepare_camera();
                if (!m_camera) {
                    console.log("no camera");
                    return;
                }

                var psf_config = plugin.get_psf_config();

                let cmd = {
                    name: "pserver.generatePsf",
                    psf_config: psf_config,
                }
                m_camera.api_command(JSON.stringify(cmd), (json) => {
                    if (json.id) {
                        let cmd = {
                            id: json.id
                        }
                        m_camera.cmd_check_timer = setInterval(() => {
                            m_camera.api_get_status(JSON.stringify(cmd), (json) => {
                                if (json.state == "done" && m_camera.cmd_check_timer) {
                                    let a = res.body.file_name.split('/');
                                    let fname = a[a.length - 1];
                                    let url = m_camera.camera_url + "/pvf/" + fname;

                                    let dummy_a_el = document.createElement('a');
                                    document.body.appendChild(dummy_a_el);
                                    dummy_a_el.href = url;
                                    dummy_a_el.download = fname;
                                    dummy_a_el.click();
                                    document.body.removeChild(dummy_a_el);
                                    
                                    console.log(`file: ${fname}`);
                                    console.log(`---`);
                                }
                            }, err => {
                                m_camera.stop_timer();
                            });
                        }, 1000);
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
            },
            add_current_pos: () => {
                if (m_last_gps_info) {
                    var p = convert_gpsinfo_to_gpspoint(m_last_gps_info);
                    pgis.get_point_handler().set_point(p);
                    pgis.get_map_handler().refresh();
                }
            },
            remove_pos: () => {
                for (var feature of pgis.get_map_handler().get_selected_points()) {
                    var p = feature.pgis_point;
                    if (p) {
                        pgis.get_point_handler().delete_point(p.id);
                        pgis.get_map_handler().refresh();
                    }
                }
            },
            clear_pos: () => {
                var points = pgis.get_point_handler().get_points();
                points.forEach((p) => {
                    pgis.get_point_handler().delete_point(p.id);
                });
                pgis.get_map_handler().refresh();
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
                                pgis.get_point_handler().set_point(p);
                            });
                            pgis.get_map_handler().refresh();
                        };
                        reader.readAsText(file);
                    });
                }
                m_e_fileinput.click();
            },
            get_psf_config: () => {
                var psf_config = {
                    "format" : "psf",
                    "version" : "1.1",
                    "points" : [],
                };
                var points = pgis.get_point_handler().get_points();
                if(points && points.length > 0){
                    psf_config.start_point = points[0].filepath;
                    for(var pgis_p of points){
                        psf_config.points.push({
                            location : `${pgis_p.x || 0},${pgis_p.y || 0},${pgis_p.z || 0}`,
                            compass : pgis_p.compass || 0,
                            path : pgis_p.filepath,
                        });
                    }
                }
                return psf_config;
            },
			download_file: () => {
                var psf_config = plugin.get_psf_config();
                download_json_file(psf_config);

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