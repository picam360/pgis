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
            },
            event_handler: function (sender, event) {
                if (pgis === sender) {
                    if (event === "loaded") {
                        setTimeout(() => {
                            plugin.init_map_layer();
                        }, 1000)
                    }
                }
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