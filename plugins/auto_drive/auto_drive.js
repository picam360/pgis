var create_plugin = (function () {
    let m_plugin_host = null;
    let m_options = null;
    let m_waypoints_layer = null;
    let m_active_path_layer = null;
    let m_selected_points = [];
    let m_waypoints = {};
    let m_cur = -1;
    let m_socket = null;

    function _convert_DMS_to_deg(input_str) {
        const dotIndex = input_str.indexOf('.');
        if (dotIndex !== -1) {
            const degrees = parseFloat(input_str.slice(0, dotIndex - 2));
            const minutes = parseFloat(input_str.slice(dotIndex - 2));
            const deg = degrees + minutes / 60;
            return deg;
        } else {
            return -1;
        }
    }

    function getBoundingBox(points) {
        if (points.length === 0) {
            throw new Error("Points array is empty.");
        }

        // x, y の最小値と最大値を計算
        const xValues = points.map(([x, y]) => x);
        const yValues = points.map(([x, y]) => y);

        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);

        // 四角形の頂点を返す
        return {
            minX,
            maxX,
            minY,
            maxY,
        };
    }

    class GGAParser {
        constructor(dataString, options = {}) {
            this.DataString = dataString;
            if (options.latitude && options.longitude) {
                this.latitude = options.latitude;
                this.longitude = options.longitude;
                return;
            }
            const fields = dataString.split(',');
            this.messageType = fields[0];
            this.utcTime = this._convertToDateTime(fields[1]);
            this.latitude = this._convert_DMS_to_deg(fields[2]);
            let latitudeDirection = fields[3];
            this.longitude = this._convert_DMS_to_deg(fields[4]);
            let longitudeDirection = fields[5];

            if (latitudeDirection === 'S') this.latitude *= -1;
            if (longitudeDirection === 'W') this.longitude *= -1;

            this.fixQuality = parseInt(fields[6]);
            this.numOfSatellites = parseInt(fields[7]);
            this.horizontalDilution = parseFloat(fields[8]);
            this.altitude = parseFloat(fields[9]);
            this.altitudeUnits = fields[10];
            this.geoidHeight = parseFloat(fields[11]);
            this.geoidHeightUnits = fields[12];
            this.ageOfData = parseFloat(fields[13]);
            this.diffRefStationID = fields[14].split('*')[0];
        }
        _convert_DMS_to_deg(input_str) {
            const dotIndex = input_str.indexOf('.');
            if (dotIndex !== -1) {
                const degrees = parseFloat(input_str.slice(0, dotIndex - 2));
                const minutes = parseFloat(input_str.slice(dotIndex - 2));
                const deg = degrees + minutes / 60;
                return deg;
            } else {
                return -1;
            }
        }
        _convertToDateTime(timeString) {
            // 時間、分、秒の各部分を抽出
            let hours = parseInt(timeString.substring(0, 2), 10);
            let minutes = parseInt(timeString.substring(2, 4), 10);
            let seconds = parseInt(timeString.substring(4, 6), 10);
            let ms = parseInt(timeString.substring(7, 9), 10) * 10;

            // 今日の日付を取得
            let currentDate = new Date();

            // 時間、分、秒をセット
            currentDate.setUTCHours(hours, minutes, seconds, ms);

            return currentDate;
        }
    }


    class WaypointsLayer {
        constructor(map, z_idx) {
            this.m_map = map;
            this.m_vector_src = null;
            this.m_tri_style = null;
            this.m_clicked_tri_style = null;
            this.m_layer = null;
            this.m_click_callback = [];
            this.m_z_idx = z_idx;
            this.m_waypoints = null;
            this.m_cur = 0;
            this._init();
        }
        _init() {
            this.m_vector_src = new ol.source.Vector();

            this.m_tri_style = new ol.style.Style({
                image: new ol.style.RegularShape({
                    fill: new ol.style.Fill({
                        color: 'green'
                    }),
                    points: 6,
                    radius: 1,
                    angle: Math.PI / 180
                })
            });

            this.m_clicked_tri_style = new ol.style.Style({
                image: new ol.style.RegularShape({
                    fill: new ol.style.Fill({
                        color: 'orange'
                    }),
                    points: 6,
                    radius: 3,
                    angle: Math.PI / 180
                })
            });

            this.m_layer = new ol.layer.Vector({
                source: this.m_vector_src,
                zIndex: this.m_z_idx,
                style: this.m_tri_style
            });

            this.m_map.on('click', (evt) => {
                //this._on_click(evt);
            });
            this.m_map.on('pointermove', (evt) => {

                // const pixel = this.m_map.getEventPixel(evt.originalEvent);
                // const hit = this.m_map.hasFeatureAtPixel(pixel);
                // this.m_map.getTargetElement().style.cursor = hit ? 'pointer' : '';
            });

            this.m_map.addLayer(this.m_layer);
        }

        add_line(waypoints, color, width, dash) {
            const points = [];

            const keys = Object.keys(waypoints);
            keys.sort((a, b) => a - b);
            const gps_first_node = this.m_waypoints.GPS[Object.keys(this.m_waypoints.GPS)[0]];
            for (const key of keys) {
                const point = [
                    waypoints[key].x + gps_first_node.x,
                    waypoints[key].y + gps_first_node.y,
                ];
                points.push(point);
            }

            const lineString = new ol.geom.LineString(points);
            const lineFeature = new ol.Feature({
                geometry: lineString
            });
            const lineStyle = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: color,
                    width: width,
                    lineDash: dash,
                })
            });
            lineFeature.setStyle(lineStyle);
            this.m_vector_src.addFeature(lineFeature);
        }
        set_waypoints(waypoints) {
            waypoints = waypoints || {};

            this.m_waypoints = waypoints;

            this.m_vector_src.clear();

            if (this.m_waypoints.src) {
                const points = [];

                const keys = [];
                const obj = {};
                for (let key in this.m_waypoints.src) {
                    const value = parseFloat(key);
                    if (!isNaN(value)) {
                        keys.push(value);
                        obj[value] = this.m_waypoints.src[key];
                    }
                }
                keys.sort((a, b) => a - b);
                for (let i in keys) {
                    const key = keys[i];
                    const p = obj[key];
                    if (!p || !p.nmea) {
                        continue;
                    }
                    const ary = p.nmea.split(',');
                    if (!ary[4] || !ary[2]) {
                        continue;
                    }
                    p.lon = _convert_DMS_to_deg(ary[4]);
                    p.lat = _convert_DMS_to_deg(ary[2]);
                    const point = ol.proj.fromLonLat([p.lon, p.lat]);
                    points.push(point);
                    // const feature = new ol.Feature({
                    //     geometry: new ol.geom.Point(point)
                    // });
                    // feature.pgis_point = p;
                    // this.m_vector_src.addFeature(feature);
                }

                if (points.length != 0) {
                    const box = getBoundingBox(points);
                    const view_center = pgis.get_map_handler().get_center();
                    const [x, y] = view_center.center;
                    if (x < box.minX || box.maxX < x || y < box.minY || box.maxY < y) {
                        pgis.get_map_handler().set_rectangle([box.minX, box.minY, box.maxX, box.maxY], 50);
                    }
                }

                const lineString = new ol.geom.LineString(points);
                const lineFeature = new ol.Feature({
                    geometry: lineString
                });
                const lineStyle = new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: 'green',
                        width: (this.m_waypoints.ENCODER ? 3 : 5),
                        lineDash: (this.m_waypoints.ENCODER ? [20, 20] : undefined),
                    })
                });
                lineFeature.setStyle(lineStyle);
                this.m_vector_src.addFeature(lineFeature);
            }

            if (this.m_waypoints.GPS && this.m_waypoints.ENCODER) {
                this.add_line(this.m_waypoints.ENCODER, 'red', 5);
            }

            if (this.m_waypoints.GPS && this.m_waypoints.VSLAM) {
                this.add_line(this.m_waypoints.VSLAM, 'blue', 3, [20, 20]);
            }

            if (this.m_waypoints.GPS && this.m_waypoints.VSLAM_ACTIVE) {
                this.add_line(this.m_waypoints.VSLAM_ACTIVE, '#FF00FF', 3, [10, 10]);
            }

            this.set_cur(this.m_cur);
        }
        set_cur(cur) {
            this.m_cur = cur;

            if (!this.m_waypoints) {
                return;
            }

            if (this.m_waypoints.src) {
                if (this.m_cur_feature) {
                    this.m_vector_src.removeFeature(this.m_cur_feature);
                    this.m_cur_feature = null;
                }

                let point;
                if (this.m_waypoints.GPS && this.m_waypoints.ENCODER) {
                    const gps_first_node = this.m_waypoints.GPS[Object.keys(this.m_waypoints.GPS)[0]];
                    const p = this.m_waypoints.ENCODER[cur];
                    if (!p) {
                        return;
                    }
                    point = [
                        p.x + gps_first_node.x,
                        p.y + gps_first_node.y,
                    ];
                } else {
                    const keys = [];
                    const obj = {};
                    for (let key in this.m_waypoints.src) {
                        const value = parseFloat(key);
                        if (!isNaN(value)) {
                            keys.push(value);
                            obj[value] = this.m_waypoints.src[key];
                        }
                    }
                    keys.sort((a, b) => a - b);
                    const key = keys[cur];
                    const p = obj[key];
                    if (!p || !p.nmea) {
                        return;
                    }
                    const ary = p.nmea.split(',');
                    if (!ary[4] || !ary[2]) {
                        return;
                    }
                    p.lon = _convert_DMS_to_deg(ary[4]);
                    p.lat = _convert_DMS_to_deg(ary[2]);

                    point = ol.proj.fromLonLat([p.lon, p.lat]);
                }
                const feature = new ol.Feature({
                    geometry: new ol.geom.Point(point)
                });
                // feature.pgis_point = p;

                const style = new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 9, // 半径を適切なサイズに設定します
                        fill: new ol.style.Fill({
                            color: 'red', // 中の色を白に設定
                        }),
                        stroke: new ol.style.Stroke({
                            color: 'white', // 縁取りの色を赤に設定
                            width: 6, // 縁取りの幅を設定
                        }),
                    }),
                    zIndex: this.m_z_idx,
                });
                feature.setStyle(style);
                this.m_cur_feature = feature;
                this.m_vector_src.addFeature(this.m_cur_feature);
            }
        }

        _on_click(event_data) {
            let self = this;
            this.reset_clicked_style();
            const feature = this.m_map.forEachFeatureAtPixel(event_data.pixel, function (feature) {
                return feature;
            }, {
                layerFilter: function (layer) {
                    return layer === self.m_layer;
                }
            });
            if (feature) {
                this.set_clicked_style(feature);
            }
            for (let cb of this.m_click_callback) {
                cb(event_data, feature);
            }
        }
        set_clicked_style(feature) {
            if (feature) {
                feature.setStyle(this.m_clicked_tri_style)
                this.m_last_clicked_feature = feature;
            }
        }
        reset_clicked_style() {
            if (this.m_last_clicked_feature) {
                this.m_last_clicked_feature.setStyle(null);
            }
        }
        add_click_callback(callback) {
            this.m_click_callback.push(callback);
        }
    }
    class ActivePathLayer {
        constructor(map, z_idx) {
            this.m_map = map;
            this.m_vector_src = null;
            this.m_lineString = null;
            this.m_lineString_gps = null;
            this.m_lineString_encoder = null;
            this.m_lineString_vslam = null;
            this.m_lineFeature = null;
            this.m_lineFeature_gps = null;
            this.m_lineFeature_encoder = null;
            this.m_lineFeature_vslam = null;
            this.m_act_feature = null;
            this.m_act_arrow_feature = null;
            this.m_tri_style = null;
            this.m_clicked_tri_style = null;
            this.m_layer = null;
            this.m_click_callback = [];
            this.m_z_idx = z_idx;
            this.m_waypoints = null;
            this.m_base_x = 0;
            this.m_base_y = 0;
            this.m_act = 0;
            this._init();
        }
        _init() {
            this.m_vector_src = new ol.source.Vector();

            this.m_tri_style = new ol.style.Style({
                image: new ol.style.RegularShape({
                    fill: new ol.style.Fill({
                        color: 'green'
                    }),
                    points: 6,
                    radius: 1,
                    angle: Math.PI / 180
                })
            });

            this.m_layer = new ol.layer.Vector({
                source: this.m_vector_src,
                zIndex: this.m_z_idx,
                style: this.m_tri_style
            });

            this.m_map.addLayer(this.m_layer);

            this.m_lineString = new ol.geom.LineString([]);
            this.m_lineFeature = new ol.Feature({
                geometry: this.m_lineString
            });
            this.m_lineFeature.setStyle(new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: 'green',
                    width: 2
                })
            }));
            this.m_vector_src.addFeature(this.m_lineFeature);

            this.m_lineString_gps = new ol.geom.LineString([]);
            this.m_lineFeature_gps = new ol.Feature({
                geometry: this.m_lineString_gps
            });
            this.m_lineFeature_gps.setStyle(new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#80FF00',
                    width: 2
                })
            }));
            this.m_vector_src.addFeature(this.m_lineFeature_gps);

            this.m_lineString_encoder = new ol.geom.LineString([]);
            this.m_lineFeature_encoder = new ol.Feature({
                geometry: this.m_lineString_encoder
            });
            this.m_lineFeature_encoder.setStyle(new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#FF0080',
                    width: 2
                })
            }));
            this.m_vector_src.addFeature(this.m_lineFeature_encoder);

            this.m_lineString_vslam = new ol.geom.LineString([]);
            this.m_lineFeature_vslam = new ol.Feature({
                geometry: this.m_lineString_vslam
            });
            this.m_lineFeature_vslam.setStyle(new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#8000FF',
                    width: 2
                })
            }));
            this.m_vector_src.addFeature(this.m_lineFeature_vslam);
        }
        set_base_point(pos) {
            this.m_base_point = [
                pos.x,
                pos.y,
            ];
        }
        set_act(pos) {//active pos
            if (!this.m_base_point || !pos || pos.x === undefined || pos.y === undefined) {
                return;
            }
            const point = [
                pos.x + this.m_base_point[0],
                pos.y + this.m_base_point[1],
            ];

            this.m_act = pos;

            if (this.m_act_feature) {
                this.m_vector_src.removeFeature(this.m_act_feature);
                this.m_act_feature = null;
            }

            const feature = new ol.Feature({
                geometry: new ol.geom.Point(point)
            });
            const style = new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 9, // 半径を適切なサイズに設定します
                    fill: new ol.style.Fill({
                        color: 'blue', // 中の色を白に設定
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'white', // 縁取りの色を赤に設定
                        width: 6, // 縁取りの幅を設定
                    }),
                }),
                zIndex: this.m_z_idx,
            });
            feature.setStyle(style);
            this.m_act_feature = feature;
            this.m_vector_src.addFeature(this.m_act_feature);

            if (this.m_act_arrow_feature) {
                this.m_vector_src.removeFeature(this.m_act_arrow_feature);
                this.m_act_arrow_feature = null;
            }

            const arrow_len = 1;
            const arrowFeature = new ol.Feature({
                geometry: new ol.geom.LineString([
                    point, [
                        point[0] + arrow_len * Math.sin(pos.heading * Math.PI / 180),
                        point[1] + arrow_len * Math.cos(pos.heading * Math.PI / 180),
                    ],    // 方角を示す線の終点
                ]),
            });
            const arrowStyle = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: 'red',
                    width: 3,
                }),
            });
            arrowFeature.setStyle(arrowStyle);
            this.m_act_arrow_feature = arrowFeature;
            this.m_vector_src.addFeature(this.m_act_arrow_feature);
        }
        push_gps_position(pos) {
            if (!this.m_base_point || !pos || pos.x === undefined || pos.y === undefined) {
                return;
            }
            const point = [
                pos.x + this.m_base_point[0],
                pos.y + this.m_base_point[1],
            ];

            this.m_vector_src.removeFeature(this.m_lineFeature_gps);

            const currentCoordinates = this.m_lineString_gps.getCoordinates();
            currentCoordinates.push(point);
            this.m_lineString_gps.setCoordinates(currentCoordinates);

            this.m_vector_src.addFeature(this.m_lineFeature_gps);
        }
        push_encoder_position(pos) {
            if (!this.m_base_point || !pos || pos.x === undefined || pos.y === undefined) {
                return;
            }
            const point = [
                pos.x + this.m_base_point[0],
                pos.y + this.m_base_point[1],
            ];

            this.m_vector_src.removeFeature(this.m_lineFeature_encoder);

            const currentCoordinates = this.m_lineString_encoder.getCoordinates();
            currentCoordinates.push(point);
            this.m_lineString_encoder.setCoordinates(currentCoordinates);

            this.m_vector_src.addFeature(this.m_lineFeature_encoder);
        }
        push_vslam_position(pos) {
            if (!this.m_base_point || !pos || pos.x === undefined || pos.y === undefined) {
                return;
            }
            const point = [
                pos.x + this.m_base_point[0],
                pos.y + this.m_base_point[1],
            ];

            this.m_vector_src.removeFeature(this.m_lineFeature_vslam);

            const currentCoordinates = this.m_lineString_vslam.getCoordinates();
            currentCoordinates.push(point);
            this.m_lineString_vslam.setCoordinates(currentCoordinates);

            this.m_vector_src.addFeature(this.m_lineFeature_vslam);
        }
        push_nmea(nmea) {
            if (!this.m_lineString) {
                return;
            }
            const ary = nmea.split(',');
            if (!ary[4] || !ary[2]) {
                return;
            }
            const lon = _convert_DMS_to_deg(ary[4]);
            const lat = _convert_DMS_to_deg(ary[2]);
            const point = ol.proj.fromLonLat([lon, lat]);

            this.m_vector_src.removeFeature(this.m_lineFeature);

            const currentCoordinates = this.m_lineString.getCoordinates();
            currentCoordinates.push(point);
            this.m_lineString.setCoordinates(currentCoordinates);

            this.m_vector_src.addFeature(this.m_lineFeature);
        }
        clear() {

            this.m_vector_src.removeFeature(this.m_lineFeature);
            this.m_vector_src.removeFeature(this.m_lineFeature_gps);
            this.m_vector_src.removeFeature(this.m_lineFeature_encoder);
            this.m_vector_src.removeFeature(this.m_lineFeature_vslam);

            this.m_lineString.setCoordinates([]);
            this.m_lineString_gps.setCoordinates([]);
            this.m_lineString_encoder.setCoordinates([]);
            this.m_lineString_vslam.setCoordinates([]);

            this.m_vector_src.addFeature(this.m_lineFeature);
            this.m_vector_src.removeFeature(this.m_lineFeature_gps);
            this.m_vector_src.removeFeature(this.m_lineFeature_encoder);
            this.m_vector_src.removeFeature(this.m_lineFeature_vslam);

            this.m_vector_src.removeFeature(this.m_act_feature);
            this.m_vector_src.removeFeature(this.m_act_arrow_feature);

            this.m_base_point = null;
        }
    }

    return function (plugin_host) {
        //debugger;
        let m_is_auto_drive = false;
        let m_is_record_path = false;
        let m_shiftkey_down = false;
        let m_waypoint_updated = true;
        let m_last_encoder = null;
        m_plugin_host = plugin_host;

        const plugin = {
            name: "auto_drive",
            init_options: function (options) {
                m_options = options || {};
                m_options = JSON.parse(JSON.stringify(m_options).replace("${window.location.hostname}", window.location.hostname));
                if (m_options && m_options.load_html) {
                    m_plugin_host.getFile("plugins/auto_drive/auto_drive.html", function (
                        chunk_array) {
                        const txt = (new TextDecoder).decode(chunk_array[0]);
                        const node = $.parseHTML(txt);
                        $('body').append(node);
                        fn.load('auto_drive.html', () => {
                            console.log('auto_drive.html loaded');

                            document.getElementById('app-header').innerHTML = pgis.get_app_title();

                            document.getElementById('play-btn').addEventListener('click', function () {
                                if (m_is_auto_drive) {
                                    plugin.stop_auto_drive();
                                } else {
                                    plugin.start_auto_drive();
                                }
                            });
                            document.getElementById('record-btn').addEventListener('click', function () {
                                if (m_is_record_path) {
                                    plugin.stop_record_path();
                                } else {
                                    plugin.start_record_path();
                                }
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

                            plugin.init_border_layout();
                            plugin.init_info_box();
                        });
                    });
                    m_plugin_host.getFile("plugins/auto_drive/auto_drive.css", function (
                        chunk_array) {
                        const txt = (new TextDecoder).decode(chunk_array[0]);
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

                document.addEventListener('keydown', (event) => {
                    if (event.shiftKey) {
                        m_shiftkey_down = true;
                    }
                });

                document.addEventListener('keyup', (event) => {
                    if (!event.shiftKey) {
                        m_shiftkey_down = false;
                    }
                });
            },
            event_handler: function (sender, event) {
                if (pgis === sender) {
                    if (event === "loaded") {
                        setTimeout(() => {
                            if (m_options.webdis_url && m_options.pst_channel) {//webdis for publish
                                const socket = new WebSocket(m_options.webdis_url);

                                let tmp_img = [];
                                socket.onmessage = function (event) {
                                    console.log(event);
                                };

                                socket.onopen = function () {
                                    console.log("webdis connection established");
                                    m_socket = socket;
                                };

                                socket.onclose = function () {
                                    console.log("webdis connection closed");
                                    m_socket = null;
                                };

                                socket.onerror = function (error) {
                                    console.log(`Error: ${error.message}`);
                                    socket.close();
                                };
                            }
                            plugin.init_map_layer();
                            if (m_options.webdis_url && m_options.pst_channel) {//webdis
                                plugin.subscribe_pst();
                            }
                            if (m_options.webdis_url && m_options.info_channel) {//webdis
                                plugin.subscribe_info();
                            }
                            if (m_options.webdis_url && m_options.vord_channel) {//webdis
                                plugin.subscribe_vord();
                            }
                        }, 1000)
                    }
                }
            },
            init_info_box: () => {

                const template = document.createElement('template');
                const txt = `
                    <div class="info-item" id="status-box">
                        <span>GPS: </span><span id="status">起動しています...</span>
                    </div>`;
                template.innerHTML = txt.trim()
                const info_box = document.getElementById('status-info-box');
                info_box.appendChild(template.content.firstChild);

            },
            update_info_box: (gga) => {

                // GAA: GPS Quality indicator:
                const GQ_INVALID = 0; // 測位不能
                const GQ_GPS = 1; // 単独測位
                const GQ_DGPS = 2; // Differential GPS fix
                const GQ_PPS = 3; // PPS 該当することはない
                const GQ_RTK = 4; // RTK Fixed
                const GQ_RTK_FLOAT = 5; // RTK Float
                function get_gq_text(gq_val) {
                    switch (gq_val) {
                        case GQ_INVALID: return '測位不能'; break;
                        case GQ_GPS: return 'SGPS'; break;
                        case GQ_DGPS: return 'DGPS'; break;
                        case GQ_PPS: return 'PPS'; break;
                        case GQ_RTK: return 'RTK'; break;
                        case GQ_RTK_FLOAT: return 'FLOAT'; break;
                        default: return '-'; break;
                    }
                }

                // status code
                const STATUS_CODE_INIT = "initializing";
                const STATUS_CODE_OK = "ok";
                const STATUS_CODE_WARN = "warn";
                const STATUS_CODE_ERROR = "error";

                let status = "";
                let status_msg = "";
                if (gga.fixQuality == GQ_RTK) {
                    status = STATUS_CODE_OK;
                    status_msg = "高精度";
                } else if (gga.fixQuality == GQ_RTK_FLOAT) {
                    status = STATUS_CODE_OK;
                    status_msg = "中精度";
                } else if (gga.fixQuality == GQ_INVALID) {
                    status = STATUS_CODE_ERROR;
                    status_msg = "通信エラー ";
                    //status_msg += problematic_machine_text();
                } else {
                    status = STATUS_CODE_WARN;
                    status_msg = "精度低 ";
                    //status_msg += `(${get_gq_text(_gnss_quality)})`;
                    //status_msg += problematic_machine_text();
                }

                document.getElementById("status-box").setAttribute("data-status", status);
                document.getElementById('status').textContent = status_msg;

            },
            init_border_layout: () => {
                // 左右のドラッグ処理 (vertical-divider)
                const verticalDivider = document.getElementById('vertical-divider');
                const leftSide = document.getElementById('left-side');
                const mapid = document.getElementById('mapid');
                let isDraggingEW = false;

                verticalDivider.addEventListener('mousedown', function (e) {
                    isDraggingEW = true;
                    document.body.classList.add('dragging-ew');
                });

                document.addEventListener('mousemove', function (e) {
                    if (!isDraggingEW) return;

                    const offset = e.clientX;
                    const totalWidth = window.innerWidth;

                    const minLeftWidth = 100; // 左側の最小幅
                    const minRightWidth = 100; // 右側の最小幅

                    if (offset > minLeftWidth && offset < totalWidth - minRightWidth) {
                        leftSide.style.width = offset + 'px';
                        mapid.style.flex = '1';
                    }
                });

                document.addEventListener('mouseup', function () {
                    isDraggingEW = false;
                    document.body.classList.remove('dragging-ew');
                });

                // 上下のドラッグ処理 (horizon-divider)
                const horizonDivider = document.getElementById('horizon-divider');
                const leftTop = document.querySelector('.left-top');
                const leftBottom = document.querySelector('.left-bottom');
                let isDraggingNS = false;

                horizonDivider.addEventListener('mousedown', function (e) {
                    isDraggingNS = true;
                    document.body.classList.add('dragging-ns');
                });

                document.addEventListener('mousemove', function (e) {
                    if (!isDraggingNS) return;

                    // Adjust for the offset of the left-side container from the top of the page
                    const offset = e.clientY - leftSide.getBoundingClientRect().top;
                    const totalHeight = leftSide.clientHeight;

                    const minTopHeight = 50; // Minimum height for the top section
                    const minBottomHeight = 50; // Minimum height for the bottom section

                    if (offset > minTopHeight && offset < totalHeight - minBottomHeight) {
                        // Set the top section height
                        leftTop.style.height = offset + 'px';

                        // Set the bottom section to take the remaining space
                        leftBottom.style.height = (totalHeight - offset) + 'px';
                    }
                });

                document.addEventListener('mouseup', function () {
                    isDraggingNS = false;
                    document.body.classList.remove('dragging-ns');
                });

            },

            update_value: (id, newValue) => {
                const cell = document.getElementById(id);
                if (cell) {
                    cell.textContent = newValue;
                }
            },
            subscribe_pst: () => {

                const socket = new WebSocket(m_options.webdis_url);

                let tmp_img = [];
                socket.onmessage = function (event) {
                    const msg = JSON.parse(event.data);
                    if (!msg["SUBSCRIBE"] || msg["SUBSCRIBE"][0] != "message" || msg["SUBSCRIBE"][1] != m_options.pst_channel) {
                        return;
                    }

                    const data = msg["SUBSCRIBE"][2];
                    if (data.length == 0 && tmp_img.length != 0) {
                        if (tmp_img.length == 3) {
                            const header_data = atob(tmp_img[0]);
                            const header_head = header_data.slice(0, 2).toString('utf-8');
                            if (header_head !== 'PI') {
                                throw new Error('Invalid file format');
                            }

                            const header_size = (header_data.charCodeAt(2) << 8) | header_data.charCodeAt(3);
                            const header = header_data.slice(4, 4 + header_size).toString('utf-8');
                            const meta = atob(tmp_img[1]);

                            const parser = new fxp.XMLParser({
                                ignoreAttributes: false,
                                attributeNamePrefix: "",
                            });
                            const frame = parser.parse(meta);
                            if (frame && frame["picam360:frame"]) {
                                function num_format(num, padding, fixed) {
                                    let [integerPart, decimalPart] = num.toFixed(fixed).split('.');
                                    integerPart = integerPart.padStart(padding, '0');
                                    return `${integerPart}.${decimalPart}`;
                                }
                                if (frame["picam360:frame"]["passthrough:nmea"]) {
                                    const nmea = frame["picam360:frame"]["passthrough:nmea"];
                                    const gga = new GGAParser(nmea);
                                    pgis.get_gps_handler().set_current_position(gga.latitude, gga.longitude);
                                    plugin.update_info_box(gga);
                                    plugin.update_value('gps-latlon', `${num_format(gga.latitude, 3, 7)}, ${num_format(gga.longitude, 3, 7)}`);//7:cm order

                                    m_active_path_layer.push_nmea(nmea);
                                }

                                const img = document.getElementById('img-left-top');
                                img.src = 'data:image/jpeg;base64,' + tmp_img[2];

                                if (frame["picam360:frame"]["passthrough:encoder"]) {
                                    const encoder = JSON.parse(frame["picam360:frame"]["passthrough:encoder"]);
                                    if (m_last_encoder) {
                                        plugin.update_value('encoder-value', `${-encoder.left}, ${encoder.right} (${-(encoder.left - m_last_encoder.left)}, ${encoder.right - m_last_encoder.right})`);
                                    } else {
                                        plugin.update_value('encoder-value', `${-encoder.left}, ${encoder.right}`);
                                    }
                                    m_last_encoder = encoder;
                                }

                                if (frame["picam360:frame"]["passthrough:imu"]) {
                                    const imu = JSON.parse(frame["picam360:frame"]["passthrough:imu"]);
                                    plugin.update_value('imu-heading', num_format(imu.heading, 3, 7));
                                }

                                //console.log(frame);
                            }
                        }
                        tmp_img = [];
                    } else {
                        tmp_img.push(data);
                    }
                };

                socket.onopen = function () {
                    console.log("webdis connection established");
                    if (m_options.pst_channel) {
                        socket.send(JSON.stringify(["SUBSCRIBE", m_options.pst_channel]));
                    }
                };

                socket.onclose = function () {
                    console.log("webdis connection closed");
                };

                socket.onerror = function (error) {
                    console.log(`Error: ${error.message}`);
                };
            },
            subscribe_info: () => {

                const socket = new WebSocket(m_options.webdis_url);
                let last_ts = Date.now();
                document.getElementById('record-btn').style.opacity = "0.1";
                document.getElementById('play-btn').style.opacity = "0.1";
                setInterval(() => {
                    const elapsed = Date.now() - last_ts;
                    if (elapsed > 3000) {
                        document.getElementById('record-btn').style.opacity = "0.1";
                    }
                    if (elapsed > 3000) {
                        document.getElementById('play-btn').style.opacity = "0.1";
                    }
                }, 1000);

                socket.onmessage = function (event) {
                    const msg = JSON.parse(event.data);
                    if (!msg["SUBSCRIBE"] || msg["SUBSCRIBE"][0] != "message" || msg["SUBSCRIBE"][1] != m_options.info_channel) {
                        return;
                    }

                    last_ts = Date.now();

                    const _f = function (v) {
                        return v !== undefined ? v.toFixed(3) : "-";
                    }

                    const info = JSON.parse(msg["SUBSCRIBE"][2]);
                    switch (info.state) {
                        case "VSLAM_RECONSTRUCTION_PROGRESS":
                            plugin.update_value('vslam-xyh', `reconstructing... ${info.progress}%`);
                            break;
                        case "WAYPOINT_UPDATED":
                            m_waypoint_updated = true;

                            break;
                        case "STOP_RECORD":
                            m_is_record_path = false;
                            break;
                        case "START_RECORD":
                            m_is_record_path = true;
                            m_active_path_layer.clear();
                            break;
                        case "RECORDING":
                            {
                                m_is_record_path = true;

                                const btn = document.getElementById('record-btn');
                                if (btn.timer && btn.timer_owner != info.state) {
                                    clearInterval(btn.timer);
                                    btn.timer = 0;
                                }
                                if (!btn.timer) {
                                    btn.isFading = true;
                                    btn.opacity_tmp = 1;
                                    btn.timer_owner = info.state;
                                    btn.timer = setInterval(() => {
                                        if (btn.isFading) {
                                            btn.opacity_tmp -= 0.05; // 徐々に透明に
                                            if (btn.opacity_tmp <= 0.3) btn.isFading = false; // 透明になったら反転
                                        } else {
                                            btn.opacity_tmp += 0.05; // 徐々に不透明に
                                            if (btn.opacity_tmp >= 1) btn.isFading = true; // 不透明になったら反転
                                        }
                                        btn.style.opacity = btn.opacity_tmp.toString();
                                    }, 100);
                                }
                                if (btn.clear_timer) {
                                    clearTimeout(btn.clear_timer);
                                }
                                btn.clear_timer = setTimeout(() => {
                                    btn.isFading = true;
                                    btn.style.opacity = "1";
                                    clearInterval(btn.timer);
                                    btn.timer = 0;
                                    btn.clear_timer = 0;

                                    m_is_record_path = false;
                                }, 1000);
                            }
                            break;
                        case "WAITING_PST":
                            switch (info.mode) {
                                case "RECORD":
                                    {
                                        m_is_record_path = true;

                                        const btn = document.getElementById('record-btn');
                                        if (btn.timer && btn.timer_owner != info.state) {
                                            clearInterval(btn.timer);
                                            btn.timer = 0;
                                        }
                                        if (!btn.timer) {
                                            btn.isFading = true;
                                            btn.opacity_tmp = 1;
                                            btn.timer_owner = info.state;
                                            btn.timer = setInterval(() => {
                                                if (btn.isFading) {
                                                    btn.opacity_tmp -= 0.05; // 徐々に透明に
                                                    if (btn.opacity_tmp <= 0.0) btn.isFading = false; // 透明になったら反転
                                                } else {
                                                    btn.opacity_tmp += 0.05; // 徐々に不透明に
                                                    if (btn.opacity_tmp >= 0.7) btn.isFading = true; // 不透明になったら反転
                                                }
                                                btn.style.opacity = btn.opacity_tmp.toString();
                                            }, 100);
                                        }
                                        if (btn.clear_timer) {
                                            clearTimeout(btn.clear_timer);
                                        }
                                        btn.clear_timer = setTimeout(() => {
                                            btn.isFading = true;
                                            btn.style.opacity = "1";
                                            clearInterval(btn.timer);
                                            btn.timer = 0;
                                            btn.clear_timer = 0;

                                            m_is_record_path = false;
                                        }, 2000);
                                    }
                                    break;
                                case "AUTO":
                                    {
                                        m_is_auto_drive = true;

                                        const btn = document.getElementById('play-btn');
                                        if (btn.timer && btn.timer_owner != info.state) {
                                            clearInterval(btn.timer);
                                            btn.timer = 0;
                                        }
                                        if (!btn.timer) {
                                            btn.isFading = true;
                                            btn.opacity_tmp = 1;
                                            btn.timer_owner = info.state;
                                            btn.timer = setInterval(() => {
                                                if (btn.isFading) {
                                                    btn.opacity_tmp -= 0.05; // 徐々に透明に
                                                    if (btn.opacity_tmp <= 0.0) btn.isFading = false; // 透明になったら反転
                                                } else {
                                                    btn.opacity_tmp += 0.05; // 徐々に不透明に
                                                    if (btn.opacity_tmp >= 0.7) btn.isFading = true; // 不透明になったら反転
                                                }
                                                btn.style.opacity = btn.opacity_tmp.toString();
                                            }, 100);
                                        }
                                        if (btn.clear_timer) {
                                            clearTimeout(btn.clear_timer);
                                        }
                                        btn.clear_timer = setTimeout(() => {
                                            btn.isFading = true;
                                            btn.style.opacity = "1";
                                            clearInterval(btn.timer);
                                            btn.timer = 0;
                                            btn.clear_timer = 0;

                                            m_is_auto_drive = false;
                                        }, 2000);
                                    }
                                    break;
                                case "STANBY":
                                    {
                                        m_is_record_path = false;
                                        const btn = document.getElementById('record-btn');
                                        if (btn.timer) {
                                            clearInterval(btn.timer);
                                            btn.timer = 0;
                                        }
                                        btn.style.opacity = "0.5";
                                    }
                                    {
                                        m_is_auto_drive = false;
                                        const btn = document.getElementById('play-btn');
                                        if (btn.timer) {
                                            clearInterval(btn.timer);
                                            btn.timer = 0;
                                        }
                                        btn.style.opacity = "0.5";
                                    }
                                    break;
                            }
                            break;
                        case "RECEIVING_PST":
                            switch (info.mode) {
                                case "STANBY":
                                    {
                                        m_is_record_path = false;
                                        const btn = document.getElementById('record-btn');
                                        if (btn.timer) {
                                            clearInterval(btn.timer);
                                            btn.timer = 0;
                                        }
                                        btn.style.opacity = "1.0";
                                    }
                                    {
                                        m_is_auto_drive = false;
                                        const btn = document.getElementById('play-btn');
                                        if (btn.timer) {
                                            clearInterval(btn.timer);
                                            btn.timer = 0;
                                        }
                                        btn.style.opacity = "1.0";
                                    }
                                    break;
                            }
                            break;
                        case "STOP_AUTO":
                            {
                                m_is_auto_drive = false;
                                const btn = document.getElementById('play-btn');
                                if (!btn.timer) {
                                    clearInterval(btn.timer);
                                    btn.timer = 0;
                                }
                            }
                            break;
                        case "START_AUTO":
                            {
                                m_is_auto_drive = true;
                                m_active_path_layer.clear();

                                const btn = document.getElementById('play-btn');
                                if (btn.timer && btn.timer_owner != info.state) {
                                    clearInterval(btn.timer);
                                    btn.timer = 0;
                                }
                                if (!btn.timer) {
                                    btn.isFading = true;
                                    btn.opacity_tmp = 1;
                                    btn.timer_owner = info.state;
                                    btn.timer = setInterval(() => {
                                        if (btn.isFading) {
                                            btn.opacity_tmp -= 0.05; // 徐々に透明に
                                            if (btn.opacity_tmp <= 0.0) btn.isFading = false; // 透明になったら反転
                                        } else {
                                            btn.opacity_tmp += 0.05; // 徐々に不透明に
                                            if (btn.opacity_tmp >= 0.7) btn.isFading = true; // 不透明になったら反転
                                        }
                                        btn.style.opacity = btn.opacity_tmp.toString();
                                    }, 100);
                                }
                            }
                            break;
                        case "READY_AUTO":
                            {
                                console.log(info.state);
                            }
                            break;
                        case "DRIVING":
                            {
                                m_is_auto_drive = true;

                                const btn = document.getElementById('play-btn');
                                if (btn.timer && btn.timer_owner != info.state) {
                                    clearInterval(btn.timer);
                                    btn.timer = 0;
                                }
                                if (!btn.timer) {
                                    btn.isFading = true;
                                    btn.opacity_tmp = 1;
                                    btn.timer_owner = info.state;
                                    btn.timer = setInterval(() => {
                                        if (btn.isFading) {
                                            btn.opacity_tmp -= 0.05; // 徐々に透明に
                                            if (btn.opacity_tmp <= 0.3) btn.isFading = false; // 透明になったら反転
                                        } else {
                                            btn.opacity_tmp += 0.05; // 徐々に不透明に
                                            if (btn.opacity_tmp >= 1) btn.isFading = true; // 不透明になったら反転
                                        }
                                        btn.style.opacity = btn.opacity_tmp.toString();
                                    }, 100);
                                }
                                if (btn.clear_timer) {
                                    clearTimeout(btn.clear_timer);
                                }
                                btn.clear_timer = setTimeout(() => {
                                    btn.isFading = true;
                                    btn.style.opacity = "1";
                                    clearInterval(btn.timer);
                                    btn.timer = 0;
                                    btn.clear_timer = 0;

                                    m_is_auto_drive = false;
                                }, 1000);

                                const { GPS, ENCODER, VSLAM } = info.handlers;
                                const dist_key = "waypoint_distance";
                                const shift_key = "waypoint_shift";
                                const head_key = "heading_error";
                                plugin.update_value('auto-drive-waypoint-distance', `${_f(GPS[dist_key])}, ${_f(ENCODER[dist_key])}, ${_f(VSLAM[dist_key])}`);
                                plugin.update_value('auto-drive-waypoint-shift', `${_f(GPS[shift_key])}, ${_f(ENCODER[shift_key])}, ${_f(VSLAM[shift_key])}`);
                                plugin.update_value('auto-drive-heading-error', `${_f(GPS[head_key])}, ${_f(ENCODER[head_key])}, ${_f(VSLAM[head_key])}`);
                                plugin.update_value('gps-xyh', `${_f(GPS.x)}, ${_f(GPS.y)}, ${_f(GPS.heading)}`);
                                plugin.update_value('encoder-xyh', `${_f(ENCODER.x)}, ${_f(ENCODER.y)}, ${_f(ENCODER.heading)}`);
                                plugin.update_value('vslam-xyh', `${_f(VSLAM.x)}, ${_f(VSLAM.y)}, ${_f(VSLAM.heading)}`);

                                m_active_path_layer.push_gps_position(GPS);
                                m_active_path_layer.push_encoder_position(ENCODER);
                                m_active_path_layer.push_vslam_position(VSLAM);

                                if (VSLAM && VSLAM.x != undefined && VSLAM.y != undefined) {
                                    m_active_path_layer.set_act(VSLAM);
                                } else if (ENCODER && ENCODER.x != undefined && ENCODER.y != undefined) {
                                    m_active_path_layer.set_act(ENCODER);
                                } else if (GPS && GPS.x != undefined && GPS.y != undefined) {
                                    m_active_path_layer.set_act(GPS);
                                }
                            }
                            break;
                        case "DONE":
                            plugin.update_value('auto-drive-waypoint-distance', '-');
                            plugin.update_value('auto-drive-waypoint-shift', '-');
                            plugin.update_value('auto-drive-heading-error', '-');
                            plugin.update_value('gps-xyh', '-');
                            plugin.update_value('encoder-xyh', '-');
                            plugin.update_value('vslam-xyh', '-');
                            plugin.stop_auto_drive();
                            break;
                    }

                    if (info.sysinfo) {
                        const si = info.sysinfo;
                        plugin.update_value('system-info', `${_f(si.temp)}°,${_f(si.latest_confidence)}`);
                    }
                };

                socket.onopen = function () {
                    console.log("webdis connection established");
                    if (m_options.info_channel) {
                        socket.send(JSON.stringify(["SUBSCRIBE", m_options.info_channel]));
                    }
                };

                socket.onclose = function () {
                    console.log("webdis connection closed");
                };

                socket.onerror = function (error) {
                    console.log(`Error: ${error.message}`);
                };
            },
            subscribe_vord: () => {

                const socket = new WebSocket(m_options.webdis_url);

                let m_detected_objects = [];
                let rects = [];
                // [{ "id": "A", "x": 20, "y": 20, "w": 120, "h": 60, "label": "Area A", "href": "" }];

                const img = document.getElementById('img-left-top');
                const canvas = document.getElementById('img-left-top-overlay');
                const ctx = canvas.getContext('2d');

                function detectionsToAreas(detections) {

                    return detections.map((d, idx) => {
                        const b = Array.isArray(d.bbox) ? d.bbox : [0, 0, 0, 0];

                        // 初期値
                        let x = b[0] ?? 0;
                        let y = b[1] ?? 0;
                        let w = 0;
                        let h = 0;

                        if (b.length >= 4) {
                            // もし b[2], b[3] が x,y より大きければ [xmin,ymin,xmax,ymax] とみなす
                            const looksLikeXYXY = b[2] > x && b[3] > y;
                            if (looksLikeXYXY) {
                                w = b[2] - x;
                                h = b[3] - y;
                            } else {
                                // それ以外は [x,y,w,h] とみなす
                                w = b[2];
                                h = b[3];
                            }
                        }

                        // id を A, B, C... に（27個目以降は A1, B1...）
                        const base = String.fromCharCode(65 + (idx % 26));
                        const suffix = idx >= 26 ? String(Math.floor(idx / 26)) : "";
                        const id = base + suffix;

                        // 整数化（必要なら 0 未満を 0 にクランプ）
                        const toInt = v => Math.max(0, Math.round(v));

                        return {
                            id,
                            x: toInt(x),
                            y: toInt(y),
                            w: toInt(w),
                            h: toInt(h),
                            label: d.label ?? String(d.class_id ?? ""),
                            href: ""
                        };
                    });
                }

                // Align canvas to the image's on-screen box
                function alignOverlayToImage() {
                    const parent = canvas.offsetParent || document.documentElement; // fallback

                    // Viewport rectangles
                    const imgRect = img.getBoundingClientRect();
                    const parentRect = parent.getBoundingClientRect();

                    // Convert to parent's coordinate space
                    const left = (imgRect.left - parentRect.left) + parent.scrollLeft;
                    const top = (imgRect.top - parentRect.top) + parent.scrollTop;

                    // Apply
                    canvas.style.position = 'absolute';
                    canvas.style.left = left + 'px';
                    canvas.style.top = top + 'px';
                    canvas.style.width = imgRect.width + 'px';
                    canvas.style.height = imgRect.height + 'px';

                    // Set rendering resolution (DPR aware)
                    const dpr = window.devicePixelRatio || 1;
                    canvas.width = Math.max(1, Math.round(imgRect.width * dpr));
                    canvas.height = Math.max(1, Math.round(imgRect.height * dpr));
                    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
                }

                // Image→display scale (natural pixels -> CSS pixels)
                function getScale() {
                    const displayW = canvas.clientWidth;   // CSS px
                    const displayH = canvas.clientHeight;
                    const natW = img.naturalWidth || displayW;
                    const natH = img.naturalHeight || displayH;
                    return { scaleX: displayW / natW, scaleY: displayH / natH };
                }

                function draw(hoverId = null) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    const { scaleX, scaleY } = getScale();
                    for (const r of rects) {
                        const x = Math.round(r.x * scaleX);
                        const y = Math.round(r.y * scaleY);
                        const w = Math.round(r.w * scaleX);
                        const h = Math.round(r.h * scaleY);
                        const hover = r.id === hoverId;

                        ctx.fillStyle = hover ? 'rgba(255,255,255,0.25)' : 'rgba(0,153,255,0.18)';
                        ctx.fillRect(x, y, w, h);

                        ctx.lineWidth = 2;
                        ctx.strokeStyle = 'rgba(0,153,255,0.95)';
                        ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);

                        const label = r.label ?? r.id;
                        ctx.font = '600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial';
                        const m = ctx.measureText(label);
                        const bgW = m.width + 12, bgH = 20;
                        const tx = x + 6, ty = (y - 8 < 0) ? (y + 18) : (y - 8);
                        ctx.fillStyle = 'rgba(0,0,0,0.45)';
                        ctx.fillRect(tx - 6, ty - 14, bgW, bgH);
                        ctx.fillStyle = 'white';
                        ctx.fillText(label, tx, ty);
                    }
                }

                function hit(r, ix, iy) {
                    return ix >= r.x && ix <= r.x + r.w && iy >= r.y && iy <= r.y + r.h;
                }
                function clientToImageXY(clientX, clientY) {
                    const rect = canvas.getBoundingClientRect();
                    const x = clientX - rect.left;
                    const y = clientY - rect.top;
                    const { scaleX, scaleY } = getScale();
                    return { ix: x / scaleX, iy: y / scaleY };
                }
                function onPick(clientX, clientY) {
                    const { ix, iy } = clientToImageXY(clientX, clientY);
                    for (let i = rects.length - 1; i >= 0; i--) {
                        if (hit(rects[i], ix, iy)) {
                            alert(`${rects[i].label ?? rects[i].id} clicked`);
                            return true;
                        }
                    }
                    return false;
                }
                function updateHover(clientX, clientY) {
                    const { ix, iy } = clientToImageXY(clientX, clientY);
                    let hoverId = null;
                    for (let i = rects.length - 1; i >= 0; i--) {
                        if (hit(rects[i], ix, iy)) { hoverId = rects[i].id; break; }
                    }
                    canvas.style.cursor = hoverId ? 'pointer' : 'default';
                    draw(rects, hoverId);
                }

                // Keep overlay aligned when layout changes
                function refresh() {
                    alignOverlayToImage();
                    draw();
                }

                // Events: resize/scroll (page layout moves), image load (size known), element resize (CSS changes)
                window.addEventListener('resize', refresh);
                window.addEventListener('scroll', refresh, { passive: true });

                if (img.complete && img.naturalWidth) refresh();
                else img.addEventListener('load', refresh);

                // Watch for size changes of the IMG via ResizeObserver (e.g., responsive layout)
                if ('ResizeObserver' in window) {
                    const ro = new ResizeObserver(refresh);
                    ro.observe(img);
                }

                // Pointer events (optional)
                canvas.addEventListener('click', (e) => onPick(e.clientX, e.clientY));
                canvas.addEventListener('pointermove', (e) => updateHover(e.clientX, e.clientY));
                canvas.addEventListener('pointerdown', (e) => {
                    if (e.pointerType === 'touch') { onPick(e.clientX, e.clientY); e.preventDefault(); }
                }, { passive: false });

                socket.onmessage = function (event) {
                    const msg = JSON.parse(event.data);
                    if (!msg["SUBSCRIBE"] || msg["SUBSCRIBE"][0] != "message" || msg["SUBSCRIBE"][1] != m_options.vord_channel) {
                        return;
                    }

                    const info = JSON.parse(msg["SUBSCRIBE"][2]);
                    switch (info.type) {
                        case "detect":
                            console.log(info.objects);
                            m_detected_objects = info.objects;
                            rects = detectionsToAreas(m_detected_objects);
                            refresh();
                            break;
                    }
                };

                socket.onopen = function () {
                    console.log("webdis connection established");
                    if (m_options.vord_channel) {
                        socket.send(JSON.stringify(["SUBSCRIBE", m_options.vord_channel]));
                    }
                };

                socket.onclose = function () {
                    console.log("webdis connection closed");
                };

                socket.onerror = function (error) {
                    console.log(`Error: ${error.message}`);
                };
            },
            start_record_path: () => {
                console.log("path-record start");
                //document.getElementById('record-btn').style.backgroundImage = 'var(--icon-stop-64)';
                if (m_socket) {
                    m_socket.send(JSON.stringify(["PUBLISH", "pserver-auto-drive", `CMD START_RECORD ${m_shiftkey_down ? "EXTEND" : ""}`]));
                }
            },
            stop_record_path: () => {
                console.log("path-record stop");
                //document.getElementById('record-btn').style.backgroundImage = 'var(--icon-record-64)';
                if (m_socket) {
                    m_socket.send(JSON.stringify(["PUBLISH", "pserver-auto-drive", "CMD STOP_RECORD"]));
                }
            },
            start_auto_drive: () => {
                console.log("auto-drive start");
                //document.getElementById('play-btn').style.backgroundImage = 'var(--icon-stop-64)';
                if (m_socket) {
                    m_socket.send(JSON.stringify(["PUBLISH", "pserver-auto-drive", `CMD START_AUTO ${m_shiftkey_down ? "REVERSE" : ""}`]));
                }
            },
            stop_auto_drive: () => {
                console.log("auto-drive stop");
                //document.getElementById('play-btn').style.backgroundImage = 'var(--icon-play-64)';
                if (m_socket) {
                    m_socket.send(JSON.stringify(["PUBLISH", "pserver-auto-drive", "CMD STOP_AUTO"]));
                }
            },
            init_map_layer: () => {
                const map_handler = pgis.get_map_handler();
                const map = map_handler.get_map();
                m_waypoints_layer = new WaypointsLayer(map, 500);
                m_waypoints_layer.add_click_callback((event_data, feature) => {
                    m_selected_points = [];
                    if (feature) {
                        m_selected_points.push(feature);
                    }
                });
                m_active_path_layer = new ActivePathLayer(map, 501);

                if (m_options.webdis_url) {//webdis
                    {
                        const socket = new WebSocket(m_options.webdis_url);

                        socket.onmessage = function (event) {
                            const data = JSON.parse(event.data);
                            if (data["GET"]) {
                                m_waypoints = JSON.parse(data["GET"]);
                                m_waypoints_layer.set_waypoints(m_waypoints);
                                if (m_waypoints.GPS) {
                                    const gps_first_node = m_waypoints.GPS[Object.keys(m_waypoints.GPS)[0]];
                                    m_active_path_layer.set_base_point(gps_first_node);
                                }
                            }
                        };

                        socket.onopen = function () {
                            console.log("webdis connection established");
                            if (m_options.auto_drive_key) {
                                setInterval(() => {
                                    if (m_waypoint_updated) {
                                        m_waypoint_updated = false;

                                        socket.send(JSON.stringify(["GET", m_options.auto_drive_key + "-waypoints"]));
                                    }
                                }, 1000);
                            }
                        };

                        socket.onclose = function () {
                            console.log("webdis connection closed");
                        };

                        socket.onerror = function (error) {
                            console.log(`Error: ${error.message}`);
                        };
                    }
                    {
                        const socket = new WebSocket(m_options.webdis_url);

                        socket.onmessage = function (event) {
                            const data = JSON.parse(event.data);
                            if (data["GET"] !== undefined) {
                                const cur = parseInt(data["GET"]);
                                m_cur = cur;
                                m_waypoints_layer.set_cur(m_cur);
                            }
                        };

                        socket.onopen = function () {
                            console.log("webdis connection established");
                            if (m_options.auto_drive_key) {
                                setInterval(() => {
                                    socket.send(JSON.stringify(["GET", m_options.auto_drive_key + "-cur"]));
                                }, 1000);
                            }
                        };

                        socket.onclose = function () {
                            console.log("webdis connection closed");
                        };

                        socket.onerror = function (error) {
                            console.log(`Error: ${error.message}`);
                        };
                    }
                }
            },
        };
        return plugin;
    }
})();