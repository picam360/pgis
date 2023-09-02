var pgis = (() => {
    const LOWPASS_ALPHA = 0.8;

    var m_options = {};
    var m_last_gps_info = {}
    var m_ort_data = [];
    var m_pos_data = {};
    var m_filtered_ort_data = null;
    var m_point_handler = null;
    var m_map_handler = {
        _tile_layer: new ol.layer.Tile({
            source: new ol.source.OSM()
        }),
        set_tile_layer: (layer) => {
            this._tile_layer = layer;
        },
    };
    var m_map = null;
    var m_map_marker_layer = null;
    var m_map_markers = {};
    var m_map_selected_marker = null;
    var m_default_marker_size = null;
    var m_e_fileinput = null;
    var m_is_DOMContentLoaded = false;
    var m_is_deviceready = false;

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
    window.fn.load = function (page, callback) {
        var content = document.getElementById('content');
        var menu = document.getElementById('menu');
        content.load(page, { callback })
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
    function init_map() {
        subsc_device_orientation();
        setInterval(show_gps_info, 33);

        navigator.geolocation.watchPosition(update_pos_data);

        navigator.geolocation.getCurrentPosition((position) => {
            console.log("current location", position.coords.latitude, position.coords.longitude);
            var userLocation = ol.proj.fromLonLat([position.coords.longitude, position.coords.latitude]);
            m_map.getView().animate({
                center: userLocation,
                zoom: 20
            });

        });

        var map = new ol.Map({
            target: 'mapid',
            layers: [
                m_map_handler._tile_layer
            ],
            view: new ol.View({
                center: ol.proj.fromLonLat([0, 0]),
                zoom: 2
            })
        });
        m_map = map;
    }

    document.addEventListener('deviceready', () => {
        m_is_deviceready = true;
    });

    document.addEventListener("DOMContentLoaded", () => {
        m_is_DOMContentLoaded = true;
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
            console.log("PC非対応")
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
            h['altitude'] = pos.coords.altitude ?? 0;
            h['accuracy'] = pos.coords.accuracy;
            h['altitudeAccuracy'] = pos.coords.altitudeAccuracy;
            h['heading'] = pos.coords.heading;
            h['speed'] = pos.coords.speed;
            h['timestamp'] = pos.timestamp;
            m_last_gps_info = h;

            // if(m_ol_map){
            //     m_ol_map.getView().setCenter([pos.coords.latitude, pos.coords.longitude]);
            // }
        }
    }

    function convert_gpsinfo_to_gpspoint(pgs_info) {

        // info hash
        // 'direction': direction,
        // 'degrees': degrees,
        // 'alpha': m_filtered_ort_data.alpha,
        // 'beta': m_filtered_ort_data.beta,
        // 'gamma': m_filtered_ort_data.gamma
        // h['latitude'] = pos.coords.latitude;
        // h['longitude'] = pos.coords.longitude;
        // h['altitude'] = pos.coords.altitude;
        // h['accuracy'] = pos.coords.accuracy;
        // h['altitudeAccuracy'] = pos.coords.altitudeAccuracy;
        // h['heading'] = pos.coords.heading;
        // h['speed'] = pos.coords.speed;
        // h['timestamp'] = pos.timestamp;

        let inf = pgs_info;
        let p = empty_gps_point();
        p.compass = inf.degrees || 0;
        p.x = inf.longitude || 0;
        p.y = inf.latitude || 0;
        p.z = inf.altitude || 0;
        p.accuracy = inf.accuracy || 0;
        p.altitudeAccuracy = inf.altitudeAccuracy || 0;
        p.timestamp = inf.timestamp || 0;
        return p;
    }

    function show_gps_info() {
        if (!m_last_gps_info) {
            return;
        }
        let data = m_last_gps_info;
        // document.querySelector("#direction").innerHTML = data['direction'] + " : " + data['degrees'];
        // document.querySelector("#absolute").innerHTML = data['absolute'] ?? "-";
        // document.querySelector("#alpha").innerHTML = data['alpha'] ?? "-";
        // document.querySelector("#beta").innerHTML = data['beta'] ?? "-";
        // document.querySelector("#gamma").innerHTML = data['gamma'] ?? "-";

        // document.querySelector("#latitude").innerHTML = data['latitude'] ?? "-";
        // document.querySelector("#longitude").innerHTML = data['longitude'] ?? "-";
        // document.querySelector("#altitude").innerHTML = data['altitude'] ?? "-";
        // document.querySelector("#accuracy").innerHTML = data['accuracy'] ?? "-";
        // document.querySelector("#altitudeAccuracy").innerHTML = data['altitudeAccuracy'] ?? "-";
        // document.querySelector("#heading").innerHTML = data['heading'] ?? "-";
        // document.querySelector("#speed").innerHTML = data['speed'] ?? "-";
        // if(data['timestamp']){
        //     document.querySelector("#datetime").innerHTML = (new Date(data['timestamp'])).toLocaleString();
        // }else{
        //     document.querySelector("#datetime").innerHTML = "-";
        // }
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

    function set_scale_marker(marker, ratio = 1.0) {
        let icon = marker.options.icon;
        icon.options.iconSize = [
            m_default_marker_size[0] * ratio,
            m_default_marker_size[1] * ratio];
        marker.setIcon(icon);
    }

    function refresh_point_layer() {
        m_map_marker_layer.clearLayers();
        m_map_markers = {};
        m_map_selected_marker = null;
        var points = m_point_handler.get_points();
        points.forEach((p) => {
            let marker = L.marker([p.y, p.x]).addTo(m_map_marker_layer);
            m_map_markers[marker._leaflet_id] = p;
            if (!m_default_marker_size) {
                let icon = marker.options.icon;
                m_default_marker_size = [icon.options.iconSize[0], icon.options.iconSize[1]];
            }
            set_scale_marker(marker, 1.0);

            marker.on('click', function () {
                let prev = m_map_selected_marker;
                m_map_selected_marker = marker;

                if (!m_default_marker_size) {
                    let icon = marker.options.icon;
                    m_default_marker_size = [icon.options.iconSize[0], icon.options.iconSize[1]];
                }
                if (prev) {
                    set_scale_marker(prev, 1.0);
                }
                set_scale_marker(m_map_selected_marker, 1.3);
            });
        });
    }

    var self = {
        debug: 0,
        plugin_host: null,
        map: () => { return m_map; },

        init: (options) => {
            m_options = options;
            console.log("loading config...");
            console.log(m_options);

            m_point_handler = new PointHanlder();
            self.plugin_host = PluginHost(self, m_options);
            var timer = setInterval(() => {
                if (window.cordova) {
                    if (!m_is_deviceready) {
                        return;
                    }
                }
                if (!m_is_DOMContentLoaded) {
                    return;
                }
                clearInterval(timer);
                self.plugin_host.init_plugins().then(() => {
                    setTimeout(() => {
                        init_map();
                        pgis.plugin_host.send_event(self, "loaded");
                    }, 1000);
                });
            }, 100);
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
        download_points: () => {
            let points = m_point_handler.get_points();
            download_json_file(points);
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
        get_point_handler: () => { return m_point_handler; },
        get_map_handler: () => { return m_map_handler; },
    }
    return self;
})();
pgis.init(pgis_conf);