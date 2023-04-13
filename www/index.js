// const HOST_URL = "http://192.168.42.1:80";//insta360x3
const HOST_URL = "http://THETAYR15104038.local";//theta x
var cmdChkTimer;

function showStatus() {
    apiGetInfo();
}

function takePicture() {
    displayText("");

    let cmd = {
        name: "camera.takePicture"
    }
    apiCommand(JSON.stringify(cmd), (json) => {
        if (json.id) {
            let cmd = {
                id: json.id
            }
            cmdChkTimer = setInterval(() => {
                apiGetStatus(JSON.stringify(cmd), (json) => {
                    if(json.state == "done"){
                        stopStatusChecker();
                        displayText(json.results.fileUrl);

                        let a = json.results.fileUrl.split('/');
                        let fname = a[a.length -1] + ".json";
                        navigator.geolocation.getCurrentPosition((position) => {
                            downloadGpsInfo(fname, position);
                            displayText("--- File Downloaded ---", true);
                        });
                    }
                }, err => {
                    stopStatusChecker
                });
            }, 100);
        }
        else {

        }
    }, (err) => { });
    displayText("takeing...");
}

function stopStatusChecker() {
    if (cmdChkTimer) {
        clearInterval(cmdChkTimer);
        cmdChkTimer = null;
    }
}

function downloadGpsInfo(fileName, gpsInfo){

    const json = JSON.stringify({
        lat: gpsInfo.coords.latitude,
        lon: gpsInfo.coords.longitude,
        alt: gpsInfo.coords.altitude
    });
    const blob = new Blob([json], { type: 'application/json' });
    
    let dummy_a_el = document.createElement('a');
    document.body.appendChild(dummy_a_el);
    dummy_a_el.href = window.URL.createObjectURL(blob);
    dummy_a_el.download = fileName;
    dummy_a_el.click();
    document.body.removeChild(dummy_a_el);
}

function showGpsInfo() {
    navigator.geolocation.getCurrentPosition((position) => {
        var geo_text = "緯度:" + position.coords.latitude + "\n";
        geo_text += "経度:" + position.coords.longitude + "\n";
        geo_text += "高度:" + position.coords.altitude + "\n";
        geo_text += "位置精度:" + position.coords.accuracy + "\n";
        geo_text += "高度精度:" + position.coords.altitudeAccuracy + "\n";
        geo_text += "移動方向:" + position.coords.heading + "\n";
        geo_text += "速度:" + position.coords.speed + "\n";
        var date = new Date(position.timestamp);
        geo_text += "取得時刻:" + date.toLocaleString() + "\n";
        displayText(geo_text);
    });
}

function apiGetInfo(cbSuc, cbErr) {
    fetchApi(HOST_URL + "/osc/info", "", cbSuc, cbErr);
}
function apiCommand(jsonText, cbSuc, cbErr) {
    fetchApi(HOST_URL + "/osc/commands/execute", jsonText, cbSuc, cbErr);
}
function apiGetStatus(jsonText, cbSuc, cbErr) {
    fetchApi(HOST_URL + "/osc/commands/status", jsonText, cbSuc, cbErr);
}
function fetchApi(url, jsonText, cbSuc, cbErr) {
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

function displayText(text, bAppend = false) {
    let e = document.getElementById("textDisplay");
    if(bAppend){
        e.value += text;
    }
    else{
        e.value = text;
    }
}