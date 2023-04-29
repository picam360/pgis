
const HOST_URL = "http://192.168.42.1:80";//insta360x3
//const HOST_URL = "http://THETAYR15104038.local";//theta x

var m_cmd_check_timer;
var m_os;
var m_last_gps_info = {}

window.addEventListener("DOMContentLoaded", () => {
    initForDeviceOrientation();
    initContorls();
});

function initForDeviceOrientation() {
    m_os = detectOSSimply();
    if (m_os == "iphone") {
        // safari用。DeviceOrientation APIの使用をユーザに許可して貰う
        document.querySelector("#permit").addEventListener("click", permitDeviceOrientationForSafari);

        window.addEventListener(
            "deviceorientation",
            showGpsInfo,
            true
        );
    } else if (m_os == "android") {
        window.addEventListener(
            "deviceorientationabsolute",
            showGpsInfo,
            true
        );
    } else {
        window.alert("PC未対応サンプル");
        window.addEventListener(
            "deviceorientationabsolute",
            showGpsInfo,
            true
        );
    }
}

function initContorls() {
    {
        const e_name = 'sel-camera';
        const e = document.getElementById(e_name);
        const ls_v = localStorage.getItem(e_name);
        if (ls_v) {
            e.value = ls_v;
        }
    }
    {
        const e_name = 'camera-options';
        const e = document.getElementById(e_name);
        const ls_v = localStorage.getItem(e_name);
        if (ls_v) {
            e.value = ls_v;
        }
    }
}

function getControlValues(bSaveValueToLocalStorage = true) {
    let res = {}
    {
        const e_name = 'sel-camera';
        const e = document.getElementById(e_name);
        const v = e.value;
        if (bSaveValueToLocalStorage) localStorage.setItem(e_name, v);
        res[e_name] = v;
    }
    {
        const e_name = 'camera-options';
        const e = document.getElementById(e_name);
        const v = e.value;
        if (bSaveValueToLocalStorage) localStorage.setItem(e_name, v);
        res[e_name] = v;
    }
    return res;
}

function showGpsInfo(event) {
    let ret = orientation(event);
    navigator.geolocation.getCurrentPosition((position) => {
        ret['latitude'] = position.coords.latitude;
        ret['longitude'] = position.coords.longitude;
        ret['altitude'] = position.coords.altitude;
        ret['accuracy'] = position.coords.accuracy;
        ret['altitudeAccuracy'] = position.coords.altitudeAccuracy;
        ret['heading'] = position.coords.heading;
        ret['speed'] = position.coords.speed;
        var date = new Date(position.timestamp);
        ret['datetime'] = date.toLocaleString();
        m_last_gps_info = ret;

        document.querySelector("#direction").innerHTML = ret['direction'] + " : " + ret['degrees'];
        document.querySelector("#absolute").innerHTML = ret['absolute'] ?? "-";
        document.querySelector("#alpha").innerHTML = ret['alpha'] ?? "-";
        document.querySelector("#beta").innerHTML = ret['beta'] ?? "-";
        document.querySelector("#gamma").innerHTML = ret['gamma'] ?? "-";

        document.querySelector("#latitude").innerHTML = ret['latitude'] ?? "-";
        document.querySelector("#longitude").innerHTML = ret['longitude'] ?? "-";
        document.querySelector("#altitude").innerHTML = ret['altitude'] ?? "-";
        document.querySelector("#accuracy").innerHTML = ret['accuracy'] ?? "-";
        document.querySelector("#altitudeAccuracy").innerHTML = ret['altitudeAccuracy'] ?? "-";
        document.querySelector("#heading").innerHTML = ret['heading'] ?? "-";
        document.querySelector("#speed").innerHTML = ret['speed'] ?? "-";
        document.querySelector("#datetime").innerHTML = ret['datetime'] ?? "-";
    });
}

// ジャイロスコープと地磁気をセンサーから取得
function orientation(event) {
    let absolute = event.absolute;
    let alpha = event.alpha;
    let beta = event.beta;
    let gamma = event.gamma;

    let degrees;
    if (m_os == "iphone") {
        // webkitCompasssHeading値を採用
        degrees = event.webkitCompassHeading;

    } else {
        // deviceorientationabsoluteイベントのalphaを補正
        degrees = compassHeading(alpha, beta, gamma);
    }

    let direction;
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
        'absolute': absolute,
        'alpha': alpha,
        'beta': beta,
        'gamma': gamma
    };
}

// 端末の傾き補正（Android用）
// https://www.w3.org/TR/orientation-event/
function compassHeading(alpha, beta, gamma) {
    var degtorad = Math.PI / 180; // Degree-to-Radian conversion

    var _x = beta ? beta * degtorad : 0; // beta value
    var _y = gamma ? gamma * degtorad : 0; // gamma value
    var _z = alpha ? alpha * degtorad : 0; // alpha value

    var cX = Math.cos(_x);
    var cY = Math.cos(_y);
    var cZ = Math.cos(_z);
    var sX = Math.sin(_x);
    var sY = Math.sin(_y);
    var sZ = Math.sin(_z);

    // Calculate Vx and Vy components
    var Vx = -cZ * sY - sZ * sX * cY;
    var Vy = -sZ * sY + cZ * sX * cY;

    // Calculate compass heading
    var compassHeading = Math.atan(Vx / Vy);

    // Convert compass heading to use whole unit circle
    if (Vy < 0) {
        compassHeading += Math.PI;
    } else if (Vx < 0) {
        compassHeading += 2 * Math.PI;
    }

    return compassHeading * (180 / Math.PI); // Compass Heading (in degrees)
}

// 簡易OS判定
function detectOSSimply() {
    let ret;
    if (
        navigator.userAgent.indexOf("iPhone") > 0 ||
        navigator.userAgent.indexOf("iPad") > 0 ||
        navigator.userAgent.indexOf("iPod") > 0
    ) {
        // iPad OS13のsafariはデフォルト「Macintosh」なので別途要対応
        ret = "iphone";
    } else if (navigator.userAgent.indexOf("Android") > 0) {
        ret = "android";
    } else {
        ret = "pc";
    }

    return ret;
}

// iPhone + Safariの場合はDeviceOrientation APIの使用許可をユーザに求める
function permitDeviceOrientationForSafari() {
    DeviceOrientationEvent.requestPermission()
        .then(response => {
            if (response === "granted") {
                window.addEventListener(
                    "deviceorientation",
                    detectDirection
                );
            }
        })
        .catch(console.error);
}

function takePicture() {
    displayText("takeing...");

    let cv = getControlValues();
    if (cv['sel-camera'] === 'sel-cam-ble') {
        let camera = bleApi.createCamera('unspecified', {
            'service_guid': '0000be80-0000-1000-8000-00805f9b34fb',
            'primary_service_guid': '0000be80-0000-1000-8000-00805f9b34fb',
            'characteristic_guid': '0000be81-0000-1000-8000-00805f9b34fb',
            'command_values': {
                'take_picture': data = new Uint8Array([0x10, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x03, 0x00, 0x02, 0x0C, 0x00, 0x00, 0x80, 0x00, 0x00])
            }
        })
        camera.takePicture((res) => {
            if (res.status === 'ok') {
                displayText("!!! The command was sent, but not sure if the picture was taken. You can judge by the shutter sound !!!", false);
                navigator.geolocation.getCurrentPosition((position) => {
                    saveGpsInfo();
                });
            } else {
                displayText(res.data);
            }
        });
    }
    else if (cv['sel-camera'] === 'sel-cam-osc') {
        let camera = oscApi.createCamera('unspecified', {
            camera_url: HOST_URL
        })
        camera.takePicture((res) => {
            if (res.status === 'ok') {
                let file_url = res.file_url;
                let a = file_url.split('/');
                let fname = a[a.length - 1] + ".json";
                navigator.geolocation.getCurrentPosition((position) => {
                    downloadGpsInfo(fname, position);
                    displayText("--- File Downloaded ---", true);
                });
            } else {
                displayText(res.data);
            }
        });
    }
}

function saveGpsInfo() {
    let date = new Date();
    let fname = date.toLocaleString().replace(/\//g, '-').replace(/:/g, '-') + ".json";
    downloadGpsInfo(fname, m_last_gps_info);
    displayText("--- File Downloaded ---", true);
}

function stopStatusChecker() {
    if (m_cmd_check_timer) {
        clearInterval(m_cmd_check_timer);
        m_cmd_check_timer = null;
    }
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

function displayText(text, bAppend = false) {
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

class iBleCamera {
    constructor() {
        if (this.constructor === iBleCamera) {
            throw new Error('interface can not be called as class');
        }
    }
    takePicture(cbRes) { throw new Error('not implemented'); }
}

const bleCam_General = class extends iBleCamera {
    constructor(camera_options) {
        super();
        this.camera_options = camera_options;
        this.service_guid = camera_options.service_guid;
        this.primary_service_guid = camera_options.primary_service_guid;
        this.characteristic_guid = camera_options.characteristic_guid;
        this.command_values = camera_options.command_values;
        this.device = null;
        this.cbRes = null;
    }

    takePicture(cbRes) {
        this.cbRes = cbRes;
        let command_value = this.command_values['take_picture'];
        let next_cmd = () => {
            this._command(command_value);
        };
        if (!this.device) {
            this._connectDevice(next_cmd);
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
                return characteristic.writeValue(command_value).then(() => {
                    return characteristic.readValue();
                });
            })
            .then((data) => {
                this.cbRes({
                    'status': 'ok'
                });
            })
            .catch(err => {
                this.cbRes({
                    'status': 'connection_failed',
                    'data': err
                });
            });
    }

    _connectDevice(nextAction) {
        navigator.bluetooth.requestDevice({
            filters: [{
                services: [this.service_guid]
            }]
        })
            .then(device => {
                this.device = device;
                nextAction();
            })
            .catch(err => {
                this.cbRes({
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
    static createCamera(camera_type, camera_options) {
        switch (camera_type) {
            case 'insta360x3':
                return new oscCam_General(camera_options);
            default:// not confirmed cameras.
                return new oscCam_General(camera_options);
        }
    }
}

class iOscCamera {
    constructor() {
        if (this.constructor === iOscCamera) {
            throw new Error('interface can not be called as class');
        }
    }
    takePicture(cbRes) { throw new Error('not implemented'); }
}

const oscCam_General = class extends iOscCamera {
    constructor(camera_options) {
        super();
        this.camera_options = camera_options;
        this.cmd_check_timer = null;
        this.camera_url = camera_options['camera_url'];
    }

    takePicture(cbRes) {

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
                            cbRes({
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
                cbRes({
                    'status': 'invalid_response_from_camera',
                    'data': json
                });
            }
        }, (err) => {
            cbRes({
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

    apiGetInfo(cbSuc, cbErr) {
        fetchApi(this.camera_url + "/osc/info", "", cbSuc, cbErr);
    }
    apiCommand(jsonText, cbSuc, cbErr) {
        fetchApi(this.camera_url + "/osc/commands/execute", jsonText, cbSuc, cbErr);
    }
    apiGetStatus(jsonText, cbSuc, cbErr) {
        fetchApi(this.camera_url + "/osc/commands/status", jsonText, cbSuc, cbErr);
    }
    fetchApi(url, jsonText, cbSuc, cbErr) {
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
            .then(json => { displayText(json); if (cbSuc) cbSuc(json); })
            .catch(error => { displayText(error); if (cbErr) cbErr(error); })
    }
}
