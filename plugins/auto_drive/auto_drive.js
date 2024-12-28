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
        set_waypoints(waypoints) {
            this.m_waypoints = waypoints;

            this.m_vector_src.clear();

            const points = [];

            const keys = [];
            const obj = {};
            for (let key in this.m_waypoints) {
                const value = parseFloat(key);
                if(!isNaN(value)){
                    keys.push(value);
                    obj[value] = this.m_waypoints[key];
                }
            }
            keys.sort((a, b) => a - b);
            for (let i in keys) {
                const key = keys[i];
                const p = obj[key];
                if(!p || !p.nmea){
                    continue;
                }
                const ary = p.nmea.split(',');
                if(!ary[4] || !ary[2]){
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

            const lineString = new ol.geom.LineString(points);
            const lineFeature = new ol.Feature({
                geometry: lineString
            });
            const lineStyle = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#FF0000',
                    width: 5
                })
            });
            lineFeature.setStyle(lineStyle);
            this.m_vector_src.addFeature(lineFeature);
        }
        set_cur(cur) {
            this.m_cur = cur;
            if(this.m_cur_feature){
                this.m_vector_src.removeFeature(this.m_cur_feature);
                this.m_cur_feature = null;
            }

            const keys = [];
            const obj = {};
            for (let key in this.m_waypoints) {
                const value = parseFloat(key);
                if(!isNaN(value)){
                    keys.push(value);
                    obj[value] = this.m_waypoints[key];
                }
            }
            keys.sort((a, b) => a - b);
            const key = keys[cur];
            const p = obj[key];
            if(!p || !p.nmea){
                return;
            }
            const ary = p.nmea.split(',');
            if(!ary[4] || !ary[2]){
                return;
            }
            p.lon = _convert_DMS_to_deg(ary[4]);
            p.lat = _convert_DMS_to_deg(ary[2]);
            const point = ol.proj.fromLonLat([p.lon, p.lat]);
            const feature = new ol.Feature({
                geometry: new ol.geom.Point(point)
            });
            // feature.pgis_point = p;
            
            const style = new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 9, // 半径を適切なサイズに設定します
                    fill: new ol.style.Fill({
                        color: 'white', // 中の色を白に設定
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'blue', // 縁取りの色を赤に設定
                        width: 6, // 縁取りの幅を設定
                    }),
                }),
                zIndex: this.m_z_idx,
            });
            feature.setStyle(style);
            this.m_cur_feature = feature;
            this.m_vector_src.addFeature(this.m_cur_feature);
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
            this.m_tri_style = null;
            this.m_clicked_tri_style = null;
            this.m_layer = null;
            this.m_click_callback = [];
            this.m_z_idx = z_idx;
            this.m_waypoints = null;
            this.m_base_x = 0;
            this.m_base_y = 0;
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
                    color: '#00FF00',
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
                    color: '#FFFF00',
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
                    color: '#00FFFF',
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
                    color: '#FFFFFF',
                    width: 2
                })
            }));
            this.m_vector_src.addFeature(this.m_lineFeature_vslam);
        }
        push_gps_position(pos) {
            if(!this.m_base_point || !pos || pos.x === undefined || pos.y === undefined){
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
            if(!this.m_base_point || !pos || pos.x === undefined || pos.y === undefined){
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
            if(!this.m_base_point || !pos || pos.x === undefined || pos.y === undefined){
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
            if(!this.m_lineString){
                return;
            }
            const ary = nmea.split(',');
            if(!ary[4] || !ary[2]){
                return;
            }
            const lon = _convert_DMS_to_deg(ary[4]);
            const lat = _convert_DMS_to_deg(ary[2]);
            const point = ol.proj.fromLonLat([lon, lat]);

            if(!this.m_base_point){
                this.m_base_point = point;
            }

            this.m_vector_src.removeFeature(this.m_lineFeature);

            const currentCoordinates = this.m_lineString.getCoordinates();
            currentCoordinates.push(point);
            this.m_lineString.setCoordinates(currentCoordinates);

            this.m_vector_src.addFeature(this.m_lineFeature);
        }
        clear(){

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
                if(m_options && m_options.load_html){
                    m_plugin_host.getFile("plugins/auto_drive/auto_drive.html", function(
                        chunk_array) {
                        const txt = (new TextDecoder).decode(chunk_array[0]);
                        const node = $.parseHTML(txt);
                        $('body').append(node);
                        fn.load('auto_drive.html', () => {		
                            console.log('auto_drive.html loaded');

                            document.getElementById('play-btn').addEventListener('click', function () {
                                if(m_is_auto_drive){
                                    plugin.stop_auto_drive();
                                }else{
                                    plugin.start_auto_drive();
                                }
                            });
                            document.getElementById('record-btn').addEventListener('click', function () {
                                if(m_is_record_path){
                                    plugin.stop_record_path();
                                }else{
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
                            if(m_options.webdis_url && m_options.pst_channel){//webdis
                                const socket = new WebSocket(m_options.webdis_url);

                                let tmp_img = [];
                                socket.onmessage = function(event) {
                                    console.log(event);
                                };
                        
                                socket.onopen = function() {
                                    console.log("webdis connection established");
                                    m_socket = socket;
                                };
                        
                                socket.onclose = function() {
                                    console.log("webdis connection closed");
                                    m_socket = null;
                                };
                        
                                socket.onerror = function(error) {
                                    console.log(`Error: ${error.message}`);
                                    socket.close();
                                };
                            }
                            plugin.init_map_layer();
                            if(m_options.webdis_url && m_options.pst_channel){//webdis
                                plugin.subscribe_pst();
                            }
                            if(m_options.webdis_url && m_options.info_channel){//webdis
                                plugin.subscribe_info();
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

                verticalDivider.addEventListener('mousedown', function(e) {
                    isDraggingEW = true;
                    document.body.classList.add('dragging-ew');
                });

                document.addEventListener('mousemove', function(e) {
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

                document.addEventListener('mouseup', function() {
                    isDraggingEW = false;
                    document.body.classList.remove('dragging-ew');
                });

                // 上下のドラッグ処理 (horizon-divider)
                const horizonDivider = document.getElementById('horizon-divider');
                const leftTop = document.querySelector('.left-top');
                const leftBottom = document.querySelector('.left-bottom');
                let isDraggingNS = false;

                horizonDivider.addEventListener('mousedown', function(e) {
                    isDraggingNS = true;
                    document.body.classList.add('dragging-ns');
                });

                document.addEventListener('mousemove', function(e) {
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

                document.addEventListener('mouseup', function() {
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
                socket.onmessage = function(event) {
                    const msg = JSON.parse(event.data);
                    if(!msg["SUBSCRIBE"] || msg["SUBSCRIBE"][0] != "message" || msg["SUBSCRIBE"][1] != m_options.pst_channel){
                        return;
                    }

                    const data = msg["SUBSCRIBE"][2];
                    if(data.length == 0 && tmp_img.length != 0){
                        if(tmp_img.length == 3){
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
                            if(frame && frame["picam360:frame"]){
                                function num_format(num, padding, fixed){
                                    let [integerPart, decimalPart] = num.toFixed(fixed).split('.');
                                    integerPart = integerPart.padStart(padding, '0');
                                    return `${integerPart}.${decimalPart}`;
                                }
                                const nmea = frame["picam360:frame"]["passthrough:nmea"];
                                const gga = new GGAParser(nmea);
                                pgis.get_gps_handler().set_current_position(gga.latitude, gga.longitude);
                                plugin.update_info_box(gga);
                                plugin.update_value('gps-latlon', `${num_format(gga.latitude, 3, 7)}, ${num_format(gga.longitude, 3, 7)}`);//7:cm order

                                m_active_path_layer.push_nmea(nmea);

                                const img = document.getElementById('img-left-top');
                                img.src = 'data:image/jpeg;base64,' + tmp_img[2];

                                const encoder = JSON.parse(frame["picam360:frame"]["passthrough:encoder"]);
                                if(m_last_encoder){
                                    plugin.update_value('encoder-value', `${-encoder.left}, ${encoder.right} (${-(encoder.left - m_last_encoder.left)}, ${encoder.right - m_last_encoder.right})`);
                                }else{
                                    plugin.update_value('encoder-value', `${-encoder.left}, ${encoder.right}`);
                                }
                                m_last_encoder = encoder;

                                const imu = JSON.parse(frame["picam360:frame"]["passthrough:imu"]);
                                plugin.update_value('imu-heading', num_format(imu.heading, 3, 7));

                                //console.log(frame);
                            }
                        }
                        tmp_img = [];
                    }else{
                        tmp_img.push(data);
                    }
                };
        
                socket.onopen = function() {
                    console.log("webdis connection established");
                    if(m_options.pst_channel){
                        socket.send(JSON.stringify(["SUBSCRIBE", m_options.pst_channel]));
                    }
                };
        
                socket.onclose = function() {
                    console.log("webdis connection closed");
                };
        
                socket.onerror = function(error) {
                    console.log(`Error: ${error.message}`);
                };
            },
            subscribe_info: () => {

                const socket = new WebSocket(m_options.webdis_url);

                socket.onmessage = function(event) {
                    const msg = JSON.parse(event.data);
                    if(!msg["SUBSCRIBE"] || msg["SUBSCRIBE"][0] != "message" || msg["SUBSCRIBE"][1] != m_options.info_channel){
                        return;
                    }

                    const info = JSON.parse(msg["SUBSCRIBE"][2]);
                    switch(info.state){
                    case "WAYPOINT_UPDATED":{
                        m_waypoint_updated = true;

                        break;
                    }
                    case "DONE":
                        plugin.update_value('auto-drive-waypoint-distance', '-');
                        plugin.update_value('auto-drive-heading-error', '-');
                        plugin.update_value('gps-xyh', '-');
                        plugin.update_value('encoder-xyh', '-');
                        plugin.update_value('vslam-xyh', '-');
                        plugin.stop_auto_drive();
                        break;
                    case "RECORDING":
                        {
                            m_is_record_path = true;

                            const btn = document.getElementById('record-btn');
                            if(!btn.timer){
                                btn.isFading = true;
                                btn.opacity_tmp = 1;
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
                            if(btn.clear_timer){
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
                        switch(info.mode){
                        case "RECORD":
                            {
                                m_is_record_path = true;
    
                                const btn = document.getElementById('record-btn');
                                if(!btn.timer){
                                    btn.isFading = true;
                                    btn.opacity_tmp = 1;
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
                                if(btn.clear_timer){
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
                                if(!btn.timer){
                                    btn.isFading = true;
                                    btn.opacity_tmp = 1;
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
                                if(btn.clear_timer){
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
                        }
                        break;
                    case "DRIVING":
                        {
                            m_is_auto_drive = true;

                            const btn = document.getElementById('play-btn');
                            if(!btn.timer){
                                btn.isFading = true;
                                btn.opacity_tmp = 1;
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
                            if(btn.clear_timer){
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
                            const head_key = "heading_error";
                            plugin.update_value('auto-drive-waypoint-distance', `${GPS[dist_key].toFixed(3)}, ${ENCODER[dist_key].toFixed(3)}, ${VSLAM[dist_key] !== undefined ? VSLAM[dist_key].toFixed(3) : "-"}`);
                            plugin.update_value('auto-drive-heading-error', `${GPS[head_key].toFixed(3)}, ${ENCODER[head_key].toFixed(3)}, ${VSLAM[head_key] !== undefined ? VSLAM[head_key].toFixed(3) : "-"}`);
                            plugin.update_value('gps-xyh', `${GPS.x.toFixed(3)}, ${GPS.y.toFixed(3)}, ${GPS.heading.toFixed(3)}`);
                            plugin.update_value('encoder-xyh', `${ENCODER.x.toFixed(3)}, ${ENCODER.y.toFixed(3)}, ${ENCODER.heading.toFixed(3)}`);
                            plugin.update_value('vslam-xyh', `${VSLAM.x !== undefined ? VSLAM.x.toFixed(3) : "-"}, ${VSLAM.y !== undefined ? VSLAM.y.toFixed(3) : "-"}, ${VSLAM.heading !== undefined ? VSLAM.heading.toFixed(3) : "-"}`);
                            
                            m_active_path_layer.push_gps_position(GPS);
                            m_active_path_layer.push_encoder_position(ENCODER);
                            m_active_path_layer.push_vslam_position(VSLAM);
                        }
                        break;
                    }
                };
        
                socket.onopen = function() {
                    console.log("webdis connection established");
                    if(m_options.info_channel){
                        socket.send(JSON.stringify(["SUBSCRIBE", m_options.info_channel]));
                    }
                };
        
                socket.onclose = function() {
                    console.log("webdis connection closed");
                };
        
                socket.onerror = function(error) {
                    console.log(`Error: ${error.message}`);
                };
            },
            start_record_path: () => {
                console.log("path-record start");
                //document.getElementById('record-btn').style.backgroundImage = 'var(--icon-stop-64)';
                if(m_socket){
                    m_socket.send(JSON.stringify(["PUBLISH", "pserver-auto-drive", "CMD START_RECORD"]));
                }
                m_active_path_layer.clear();
            },
            stop_record_path: () => {
                console.log("path-record stop");
                //document.getElementById('record-btn').style.backgroundImage = 'var(--icon-record-64)';
                if(m_socket){
                    m_socket.send(JSON.stringify(["PUBLISH", "pserver-auto-drive", "CMD STOP_RECORD"]));
                }
            },
            start_auto_drive: () => {
                console.log("auto-drive start");
                //document.getElementById('play-btn').style.backgroundImage = 'var(--icon-stop-64)';
                if(m_socket){
                    m_socket.send(JSON.stringify(["PUBLISH", "pserver-auto-drive", `CMD START_AUTO ${m_shiftkey_down ? "REVERSE" : ""}`]));
                }
                m_active_path_layer.clear();
            },
            stop_auto_drive: () => {
                console.log("auto-drive stop");
                //document.getElementById('play-btn').style.backgroundImage = 'var(--icon-play-64)';
                if(m_socket){
                    m_socket.send(JSON.stringify(["PUBLISH", "pserver-auto-drive", "CMD STOP_AUTO"]));
                }
            },
            init_map_layer: () => {
                const map_handler = pgis.get_map_handler();
                const map = map_handler.get_map();
                m_waypoints_layer = new WaypointsLayer(map, 500);
                m_waypoints_layer.add_click_callback((event_data, feature) => {
                    m_selected_points = [];
                    if(feature){
                        m_selected_points.push(feature);
                    }
                });
                m_active_path_layer = new ActivePathLayer(map, 501);

				if(m_options.webdis_url){//webdis
                    {
                        const socket = new WebSocket(m_options.webdis_url);

                        socket.onmessage = function(event) {
                            const data = JSON.parse(event.data);
                            if(data["GET"] !== undefined){
                                m_waypoints = JSON.parse(data["GET"]);
                                m_waypoints_layer.set_waypoints(m_waypoints);
                            }
                        };
                
                        socket.onopen = function() {
                            console.log("webdis connection established");
                            if(m_options.auto_drive_key){
                                setInterval(() => {
                                    if(m_waypoint_updated){
                                        m_waypoint_updated = false;

                                        socket.send(JSON.stringify(["GET", m_options.auto_drive_key + "-waypoints"]));
                                    }
                                }, 1000);
                            }
                        };
                
                        socket.onclose = function() {
                            console.log("webdis connection closed");
                        };
                
                        socket.onerror = function(error) {
                            console.log(`Error: ${error.message}`);
                        };
                    }
                    {
                        const socket = new WebSocket(m_options.webdis_url);

                        socket.onmessage = function(event) {
                            const data = JSON.parse(event.data);
                            if(data["GET"] !== undefined){
                                const cur = parseInt(data["GET"]);
                                m_cur = cur;
                                m_waypoints_layer.set_cur(m_cur);
                            }
                        };
                
                        socket.onopen = function() {
                            console.log("webdis connection established");
                            if(m_options.auto_drive_key){
                                setInterval(() => {
                                    socket.send(JSON.stringify(["GET", m_options.auto_drive_key + "-cur"]));
                                }, 1000);
                            }
                        };
                
                        socket.onclose = function() {
                            console.log("webdis connection closed");
                        };
                
                        socket.onerror = function(error) {
                            console.log(`Error: ${error.message}`);
                        };
                    }
				}
            },
        };
        return plugin;
    }
})();