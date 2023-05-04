
var pgis = (() => {
    const LOWPASS_ALPHA = 0.8;

    var m_options = {};
    var m_last_gps_info = {}
    let m_ort_data = [];
    let m_pos_data = {};
    var m_filtered_ort_data = null;

    /**
     * onsen ui
     */
    window.fn = {};
    window.fn.open = function () {
        openMenu();
    };
    window.fn.close = function () {
        closeMenu();
    };
    window.fn.load = function (page) {
        var content = document.getElementById('content');
        var menu = document.getElementById('menu');
        content.load(page)
            .then(menu.close.bind(menu));
    };

    function closeMenu() {
        var menu = document.getElementById('menu');
        menu.close();
    }
    function openMenu() {
        var menu = document.getElementById('menu');
        menu.open();
    }

    window.addEventListener("DOMContentLoaded", () => {
        subsc_device_orientation();
        setInterval(show_gps_info, 33);
        navigator.geolocation.watchPosition(update_pos_data);
    });

    function subsc_device_orientation() {
        let os;
        if (
            navigator.userAgent.indexOf("iPhone") > 0 ||
            navigator.userAgent.indexOf("iPad") > 0 ||
            navigator.userAgent.indexOf("iPod") > 0
        ) {
            // iPad OS13のsafariはデフォルト「Macintosh」なので別途要対応
            os = "iphone";
        } else if (navigator.userAgent.indexOf("Android") > 0) {
            os = "android";
        } else {
            os = "pc";
        }

        if (os == "iphone") {
            // safari用。DeviceOrientation APIの使用をユーザに許可して貰う
            document.querySelector("#permit").addEventListener("click", () => {
                DeviceOrientationEvent.requestPermission()
                    .then(response => {
                        if (response === "granted") {
                            window.addEventListener(
                                "deviceorientation",
                                push_ort_data,
                                true
                            );
                        }
                    })
                    .catch(console.error);
            });
        } else if (os == "android") {
            window.addEventListener(
                "deviceorientationabsolute",
                push_ort_data,
                true
            );
        } else {
            window.alert("PC未対応サンプル");
            window.addEventListener(
                "deviceorientationabsolute",
                push_ort_data,
                true
            );
        }
    }

    function update_pos_data(position) {
        m_pos_data = position;
        update_gps_info();
    }

    function update_gps_info() {
        let ort = get_ort_data();
        let pos = m_pos_data;
        if (ort && pos && pos.coords) {
            let h = Object.assign({}, ort);
            h['latitude'] = pos.coords.latitude;
            h['longitude'] = pos.coords.longitude;
            h['altitude'] = pos.coords.altitude;
            h['accuracy'] = pos.coords.accuracy;
            h['altitudeAccuracy'] = pos.coords.altitudeAccuracy;
            h['heading'] = pos.coords.heading;
            h['speed'] = pos.coords.speed;
            h['datetime'] = (new Date(pos.timestamp)).toLocaleString();
            m_last_gps_info = h;
        }
    }

    function show_gps_info() {
        if (!m_last_gps_info) {
            return;
        }
        let data = m_last_gps_info;
        document.querySelector("#direction").innerHTML = data['direction'] + " : " + data['degrees'];
        document.querySelector("#absolute").innerHTML = data['absolute'] ?? "-";
        document.querySelector("#alpha").innerHTML = data['alpha'] ?? "-";
        document.querySelector("#beta").innerHTML = data['beta'] ?? "-";
        document.querySelector("#gamma").innerHTML = data['gamma'] ?? "-";

        document.querySelector("#latitude").innerHTML = data['latitude'] ?? "-";
        document.querySelector("#longitude").innerHTML = data['longitude'] ?? "-";
        document.querySelector("#altitude").innerHTML = data['altitude'] ?? "-";
        document.querySelector("#accuracy").innerHTML = data['accuracy'] ?? "-";
        document.querySelector("#altitudeAccuracy").innerHTML = data['altitudeAccuracy'] ?? "-";
        document.querySelector("#heading").innerHTML = data['heading'] ?? "-";
        document.querySelector("#speed").innerHTML = data['speed'] ?? "-";
        document.querySelector("#datetime").innerHTML = data['datetime'] ?? "-";
    }

    function lowpass_ort_data() {
        if (m_ort_data.length === 0) {
            return;
        }

        let filteredData = {
            absolute: m_ort_data[0].absolute,
            alpha: m_ort_data[0].alpha,
            beta: m_ort_data[0].beta,
            gamma: m_ort_data[0].gamma
        };

        for (let i = 1; i < m_ort_data.length; i++) {
            const currentData = m_ort_data[i];

            filteredData.alpha = LOWPASS_ALPHA * filteredData.alpha + (1 - LOWPASS_ALPHA) * currentData.alpha;
            filteredData.beta = LOWPASS_ALPHA * filteredData.beta + (1 - LOWPASS_ALPHA) * currentData.beta;
            filteredData.gamma = LOWPASS_ALPHA * filteredData.gamma + (1 - LOWPASS_ALPHA) * currentData.gamma;
        }

        m_filtered_ort_data = filteredData;
        m_ort_data = [];
    }

    function push_ort_data(event) {
        const absolute = event.absolute;
        const alpha = event.alpha;
        const beta = event.beta;
        const gamma = event.gamma;

        const validAlpha = alpha == null ? 0 : alpha;
        const validBeta = beta == null ? 0 : beta;
        const validGamma = gamma == null ? 0 : gamma;

        let filteredData = {
            absolute: absolute,
            alpha: validAlpha,
            beta: validBeta,
            gamma: validGamma
        };
        m_filtered_ort_data = filteredData;

        update_gps_info();
    }

    function get_ort_data() {

        if (!m_filtered_ort_data) {
            return null;
        }

        let degrees = m_filtered_ort_data.alpha;
        let direction = "N";
        if (
            (degrees > 337.5 && degrees < 360) ||
            (degrees > 0 && degrees < 22.5)
        ) {
            direction = "N";
        } else if (degrees > 22.5 && degrees < 67.5) {
            direction = "NE";
        } else if (degrees > 67.5 && degrees < 112.5) {
            direction = "E";
        } else if (degrees > 112.5 && degrees < 157.5) {
            direction = "ES";
        } else if (degrees > 157.5 && degrees < 202.5) {
            direction = "S";
        } else if (degrees > 202.5 && degrees < 247.5) {
            direction = "SW";
        } else if (degrees > 247.5 && degrees < 292.5) {
            direction = "W";
        } else if (degrees > 292.5 && degrees < 337.5) {
            direction = "NW";
        }

        return {
            'direction': direction,
            'degrees': degrees,
            'alpha': m_filtered_ort_data.alpha,
            'beta': m_filtered_ort_data.beta,
            'gamma': m_filtered_ort_data.gamma
        };
    }

    function take_picture() {
        display_text("takeing...");

        let camera_options = m_options.camera_options[m_options.camera_option_name];
        if (m_options.camera_conn === "bluetooth") {
            let camera = bleApi.createCamera('unspecified', camera_options);
            camera.take_picture((res) => {
                if (res.status === 'ok') {
                    display_text("!!! The command was sent, but not sure if the picture was taken. You can judge by the shutter sound !!!", false);
                    download_gps_file();
                } else {
                    display_text(res.data);
                }
            });
        }
        else if (m_options.camera_conn === "osc") {
            let camera = oscApi.create_camera('unspecified', camera_options)
            camera.take_picture((res) => {
                if (res.status === 'ok') {
                    let file_url = res.file_url;
                    let a = file_url.split('/');
                    let fname = a[a.length - 1] + ".json";
                    downloadGpsInfo(fname, m_last_gps_info);
                    display_text("--- File Downloaded ---", true);
                } else {
                    display_text(res.data);
                }
            });
        }
    }

    function download_gps_file() {
        let date = new Date();
        let fname = date.toLocaleString().replace(/\//g, '-').replace(/:/g, '-') + ".json";
        downloadGpsInfo(fname, m_last_gps_info);
        display_text("--- File Downloaded ---", true);
    }

    function downloadGpsInfo(fileName, gpsInfoJson) {

        const text = JSON.stringify(gpsInfoJson);
        const blob = new Blob([text], { type: 'application/json' });

        let dummy_a_el = document.createElement('a');
        document.body.appendChild(dummy_a_el);
        dummy_a_el.href = window.URL.createObjectURL(blob);
        dummy_a_el.download = fileName;
        dummy_a_el.click();
        document.body.removeChild(dummy_a_el);
    }

    function display_text(text, bAppend = false) {
        let e = document.getElementById("textDisplay");
        if (bAppend) {
            e.value += text;
        }
        else {
            e.value = text;
        }
    }

    /**
     * 
     * BLE
     */
    const bleApi = class {
        static createCamera(camera_type, camera_options) {
            switch (camera_type) {
                case 'insta360x3':
                    return new bleCam_General(camera_options);
                default:// not confirmed cameras.
                    return new bleCam_General(camera_options);
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
    }

    const bleCam_General = class extends IBLECamera {
        constructor(camera_options) {
            super();
            this.camera_options = camera_options;
            this.service_guid = camera_options.service_guid;
            this.primary_service_guid = camera_options.primary_service_guid;
            this.characteristic_guid = camera_options.characteristic_guid;
            this.command_values = camera_options.command_values;
            this.device = null;
            this.callback = null;
        }

        take_picture(callback) {
            this.callback = callback;
            let command_value = this.command_values['take_picture'];
            let next_cmd = () => {
                this._command(command_value);
            };
            if (!this.device) {
                this._connect_device(next_cmd);
            }
            else {
                next_cmd();
            }
        }

        _command(command_value) {
            this.device.gatt.connect()
                .then(server => {
                    return server.getPrimaryService(this.primary_service_guid);
                })
                .then(service => {
                    return service.getCharacteristic(this.characteristic_guid);
                })
                .then(characteristic => {
                    return characteristic.writeValue(command_value);
                    // return characteristic.writeValue(command_value).then(() => {
                    //     return characteristic.readValue();
                    // });
                })
                .then((data) => {
                    this.callback({
                        'status': 'ok'
                    });
                })
                .catch(err => {
                    this.callback({
                        'status': 'connection_failed',
                        'data': err
                    });
                });
        }

        _connect_device(next_action) {
            navigator.bluetooth.requestDevice({
                filters: [{
                    services: [this.service_guid]
                }]
            })
                .then(device => {
                    this.device = device;
                    next_action();
                })
                .catch(err => {
                    this.callback({
                        'status': 'connection_failed',
                        'data': err
                    });
                });
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
                                    'file_url': json.results.fileUrl,
                                    'data': json
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
                        'data': json
                    });
                }
            }, (err) => {
                callback({
                    'status': 'invalid_response_from_camera',
                    'data': err
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

    var self = {
        init: (options) => {
            m_options = options;
            console.log("loading config...");
            console.log(m_options);
        },
        download_gps_file: () => {
            download_gps_file();
        },
        take_picture: () => {
            take_picture();
        }
    }
    return self;
})();
pgis.init(pgis_conf);