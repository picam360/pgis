var create_plugin = (function () {
    var m_plugin_host = null;
    var m_options = null;
    var m_drive_path_layer = null;
    var m_selected_points = [];
    var m_drive_path = {};

    function _convert_DMS_to_deg(input_str) {
        var dotIndex = input_str.indexOf('.');
        if (dotIndex !== -1) {
            var degrees = parseFloat(input_str.slice(0, dotIndex - 2));
            var minutes = parseFloat(input_str.slice(dotIndex - 2));
            var deg = degrees + minutes / 60;
            return deg;
        } else {
            return -1;
        }
    }


    class DrivePathLayer {
        constructor(map, z_idx) {
            this.m_map = map;
            this.m_vector_src = null;
            this.m_tri_style = null;
            this.m_clicked_tri_style = null;
            this.m_layer = null;
            this.m_click_callback = [];
            this.m_z_idx = z_idx;
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

                // var pixel = this.m_map.getEventPixel(evt.originalEvent);
                // var hit = this.m_map.hasFeatureAtPixel(pixel);
                // this.m_map.getTargetElement().style.cursor = hit ? 'pointer' : '';
            });

            this.refresh();

            this.m_map.addLayer(this.m_layer);
        }
        refresh() {
            this.m_vector_src.clear();

            const points = [];

            const keys = [];
            const obj = {};
            for (let key in m_drive_path) {
                const value = parseFloat(key);
                if(!isNaN(value)){
                    keys.push(value);
                    obj[value] = m_drive_path[key];
                }
            }
            keys.sort();
            for (let key of keys) {
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
                // var feature = new ol.Feature({
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
                    width: 1
                })
            });
            lineFeature.setStyle(lineStyle);
            this.m_vector_src.addFeature(lineFeature);
        }

        _on_click(event_data) {
            let self = this;
            this.reset_clicked_style();
            var feature = this.m_map.forEachFeatureAtPixel(event_data.pixel, function (feature) {
                return feature;
            }, {
                layerFilter: function (layer) {
                    return layer === self.m_layer;
                }
            });
            if (feature) {
                this.set_clicked_style(feature);
            }
            for (var cb of this.m_click_callback) {
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

    return function (plugin_host) {
        //debugger;
        m_plugin_host = plugin_host;

        var plugin = {
            name: "auto_drive",
            init_options: function (options) {
                m_options = options || {};
                if(m_options && m_options.load_html){
                    m_plugin_host.getFile("plugins/auto_drive/auto_drive.html", function(
                        chunk_array) {
                        var txt = (new TextDecoder).decode(chunk_array[0]);
                        var node = $.parseHTML(txt);
                        $('body').append(node);
                        fn.load('auto_drive.html', () => {		
                            console.log('auto_drive.html loaded');

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

                        });
                    });
                    m_plugin_host.getFile("plugins/auto_drive/auto_drive.css", function (
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
            event_handler: function (sender, event) {
                if (pgis === sender) {
                    if (event === "loaded") {
                        setTimeout(() => {
                            plugin.init_map_layer();
                            if(m_options.webdis_url && m_options.pst_channel){//webdis
                                plugin.subscribe_pst();
                            }
                        }, 1000)
                    }
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
                            const header_head = tmp_img[0].slice(0, 2).toString('utf-8');
                            if (header_head !== 'PI') {
                                throw new Error('Invalid file format');
                            }
                            
                            const header_size = (tmp_img[0].charCodeAt(2) << 8) | tmp_img[0].charCodeAt(3);
                            const header = tmp_img[0].slice(4, 4 + header_size).toString('utf-8');
                            const meta = tmp_img[1];

                            const parser = new fxp.XMLParser({
                                ignoreAttributes: false,
                                attributeNamePrefix: "",
                            });
                            const frame = parser.parse(meta);
                            if(frame && frame["picam360:frame"]){
                                const nmea = frame["picam360:frame"]["passthrough:nmea"];
                                const nmea_split = nmea.split(',');
                                pgis.get_gps_handler().set_current_position(
                                    _convert_DMS_to_deg(nmea_split[2]), 
                                    _convert_DMS_to_deg(nmea_split[4]));
                                console.log(nmea);
                            }
                        }
                        tmp_img = [];
                    }else{
                        tmp_img.push(atob(data));
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
            init_map_layer: () => {
                const map_handler = pgis.get_map_handler();
                const map = map_handler.get_map();
                m_drive_path_layer = new DrivePathLayer(map, 500);
                m_drive_path_layer.add_click_callback((event_data, feature) => {
                    m_selected_points = [];
                    if(feature){
                        m_selected_points.push(feature);
                    }
                });

				if(m_options.webdis_url){//webdis

					const socket = new WebSocket(m_options.webdis_url);

					socket.onmessage = function(event) {
						const data = JSON.parse(event.data);
						if(data["GET"]){
                            m_drive_path = JSON.parse(data["GET"]);
                            m_drive_path_layer.refresh();
						}
					};
			
					socket.onopen = function() {
						console.log("webdis connection established");
						if(m_options.drive_path_key){
							socket.send(JSON.stringify(["GET", m_options.drive_path_key]));
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
        };
        return plugin;
    }
})();