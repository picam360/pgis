
/**
 * 
 * OSC
 */
const oscApi = class {
    static create_camera(camera_type, options) {
        switch (camera_type) {
            case 'insta360x3':
                return new oscCam_General(options);
            default:// not confirmed cameras.
                return new oscCam_General(options);
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
    constructor(options) {
        super();
        this.options = options;
        this.cmd_check_timer = null;
        this.camera_url = options['camera_url'];
    }

    is_abend() {
        return false;
    }

    take_picture(callback) {

        let cmd = {
            name: "camera.takePicture"
        }
        this.api_command(JSON.stringify(cmd), (json) => {
            if (json.id) {
                let cmd = {
                    id: json.id
                }
                this.cmd_check_timer = setInterval(() => {
                    this.api_get_status(JSON.stringify(cmd), (json) => {
                        if (json.state == "done" && this.cmd_check_timer) {
                            this.stop_timer();
                            callback({
                                'status': 'ok',
                                'body': {
                                    'file_name': json.results.fileUrl
                                }
                            });
                        }
                    }, err => {
                        this.stop_timer();
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
    }

    stop_timer() {
        if (this.cmd_check_timer) {
            clearInterval(this.cmd_check_timer);
            this.cmd_check_timer = null;
        }
    }

    api_get_info(cbSuc, cbErr) {
        this.fetch_api(this.camera_url + "/ocs/info", "", cbSuc, cbErr);
    }
    api_command(jsonText, cbSuc, cbErr) {
        this.fetch_api(this.camera_url + "/ocs/commands/execute", jsonText, cbSuc, cbErr);
    }
    api_get_status(jsonText, cbSuc, cbErr) {
        this.fetch_api(this.camera_url + "/ocs/commands/status", jsonText, cbSuc, cbErr);
    }
    fetch_api(url, jsonText, cbSuc, cbErr) {
        var myHeaders = new Headers();
        myHeaders.append('Content-Type', 'application/json');
        //myHeaders.append("Content-Type", "application/json;charset=utf-8");
        //myHeaders.append("Accept", "application/json");
        //myHeaders.append("X-XSRF-Protected", "1");

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
        .then(json => {
            console.log(json);
            if (cbSuc) {
                cbSuc(json);
            }
        })
        .catch(error => {
            console.log(error);
            if (cbErr) {
                cbErr(error);
            }
        });
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