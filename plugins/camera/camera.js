
class IBLECamera {
    constructor() {
        if (this.constructor === IBLECamera) {
            throw new Error('interface can not be called as class');
        }
    }
    take_picture(cbRes) { throw new Error('not implemented'); }
    m_is_abend() { throw new Error('not implemented'); }
}

var create_plugin = (function() {
	var m_plugin_host = null;
	var m_options = null;
    var m_permanent_options = {};
    var m_camera = null;
    var m_pserver_ble = null;

	return function(plugin_host) {
		//debugger;
		m_plugin_host = plugin_host;

		function prepare_camera() {
			if (m_camera && m_camera.is_abend()) {
				m_camera = null;
			}
	
			if (!m_camera) {
				switch (m_options.name){
                case "pserver":
                    if(oscApi){
                        var options = {
                            camera_url : m_options.url
                        };
                        m_camera = oscApi.create_camera('unspecified', options);
                    }
                    break;
                case "insta360_ble":
                    if(bleCam_Insta360x3){
                        let options = {};
                        if(m_options.camera_options){
                            options = m_options.camera_options[m_options.name];
                        }
                        m_camera = new bleCam_Insta360x3(options);
                    }
                    break;
                case "osc":
                    if(oscApi){
                        let options = {};
                        if(m_options.camera_options){
                            options = m_options.camera_options[m_options.name];
                        }
                        m_camera = oscApi.create_camera('unspecified', options);
                    }
                    break;
				}
			}
		}
		
		var plugin = {
            name : "camera",
			init_options : function(options) {
                try{
                    m_permanent_options = JSON.parse(localStorage.getItem('camera_js_options')) || {};
                }catch (e){
                    m_permanent_options = {};
                }
                Object.assign(options, m_permanent_options);
				m_options = options;
                if(m_options && m_options.load_html){
                    m_plugin_host.getFile("plugins/camera/camera.html", function(
                        chunk_array) {
                        var txt = (new TextDecoder).decode(chunk_array[0]);
                        var node = $.parseHTML(txt);
                        $('body').append(node);
                        fn.load('camera.html', () => {		
                            console.log('camera.html loaded');

                            document.getElementById('config-btn').addEventListener('click', function () {
                                plugin.open_config();
                            });


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
			},
			event_handler : function(sender, event) {
                if (pgis === sender) {
                    if (event === "loaded") {
                        if(m_options.connect_ble){
                            plugin.connect_ble();
                        }
                    }
                }
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

                    var ip_timer = setInterval(() => {
                        if(m_pserver_ble){
                            m_pserver_ble.get_ip((ip) => {
                                if(!ip || ip == "IP_NOT_FOUND"){
                                    return;
                                }
                                document.getElementById('camera-url').value = `https://${ip}:9002`;
                            });
                        }
    
                    }, 1000);

                    var connect_ble = m_options.connect_ble;
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
                        $("#ble-btn").css('background-color', 'steelblue');

                        $("#wifi-btn").show();
                        
                        document.getElementById('wifi-btn').addEventListener('click', function () {
                            plugin.open_wifi_config();
                        });

                        var rtk_plugin = m_plugin_host.get_plugin("rtk");
                        if(rtk_plugin){
                            $("#rtk-btn").show();
                            
                            document.getElementById('rtk-btn').addEventListener('click', function () {
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
            open_pviewer: () => {
                // create camera
                prepare_camera();
                if (!m_camera) {
                    console.log("no camera");
                    return;
                }
                var pviewer_url = "https://picam360.github.io/pviewer";

                const params = new URLSearchParams(window.location.search);
                if(params.has('pviewer')){
                    pviewer_url = params.get('pviewer');
                }

                var features = pgis.get_map_handler().get_selected_points();
                if(features && features.length > 0){
                    var pgis_p = features[0].pgis_point;
                    var pvf_url = m_camera.camera_url + "/" + pgis_p.filepath;
                    var url = pviewer_url + "?pvf=" + encodeURIComponent(pvf_url);
                    window.open(url, '_blank');
                }else{
                    var psf_config = plugin.get_psf_config();
                    if(psf_config.points.length > 0){
                        for(var psf_p of psf_config.points){
                            var pvf_url = m_camera.camera_url + "/" + psf_p.path;
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
                            var cur_pos = pgis.get_gps_handler().get_current_position();
                            cur_pos.filepath = res.body.file_name;
                            pgis.get_point_handler().set_point(cur_pos);
                            pgis.get_map_handler().refresh();
                            console.log(`file: ${res.body.file_name}`);
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
					switch (m_options.name) {
                    case "ble":
                        m_camera.take_picture(take_picture_callback);
                        break;
                    case "pserver":
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
                                    m_camera.stop_timer();

                                    let url = m_camera.camera_url + "/" + json.results.fileUrl;

                                    let dummy_a_el = document.createElement('a');
                                    document.body.appendChild(dummy_a_el);
                                    dummy_a_el.href = url;
                                    dummy_a_el.download = json.results.fileUrl;
                                    dummy_a_el.click();
                                    document.body.removeChild(dummy_a_el);
                                    
                                    console.log(`file: ${json.results.fileUrl}`);
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