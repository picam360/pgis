var create_plugin = (function () {
    var m_plugin_host = null;
    var m_options = null;
    var m_map_handler = null;
    var m_map = null;
    var m_position_layer = null;
    var m_point_layer = null;
    var m_selected_points = [];

    class PositionLayer {
        constructor(map, z_idx) {
            this.m_map = map;
            this.m_layer = null;
            this.m_style_std = null;
            this.m_style_arm_side = null;
            this.m_style_attch = null;
            this.m_z_idx = z_idx;
            this._init();
        }
        _init() {
            this.m_style_std = new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 4,
                    fill: new ol.style.Fill({
                        color: 'red'
                    })
                })
            });
            this.m_style_arm_side = new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 4,
                    stroke: new ol.style.Stroke({
                        color: 'red',
                        width: 3,
                    }),
                })
            });
            this.m_style_attch = new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 9, // 半径を適切なサイズに設定します
                    fill: new ol.style.Fill({
                        color: 'white', // 中の色を白に設定
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'red', // 縁取りの色を赤に設定
                        width: 6, // 縁取りの幅を設定
                    }),
                }),
                zIndex: 1
            });
            this.m_layer = new ol.layer.Vector({
                source: new ol.source.Vector(),
                zIndex: this.m_z_idx,
                style: this.m_style_std
            });
            this.m_map.addLayer(this.m_layer);
        }
        refresh(lat, lng) {
            var vec_src = this.m_layer.getSource();
            vec_src.clear();

            let f = new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.fromLonLat([lng, lat]))
            });
            f.setStyle(this.m_style_attch);
            vec_src.addFeature(f);
        }
    }

    class PointLayer {
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
                    points: 3,
                    radius: 15,
                    angle: Math.PI / 180
                })
            });

            this.m_clicked_tri_style = new ol.style.Style({
                image: new ol.style.RegularShape({
                    fill: new ol.style.Fill({
                        color: 'orange'
                    }),
                    points: 3,
                    radius: 20,
                    angle: Math.PI / 180
                })
            });

            this.m_layer = new ol.layer.Vector({
                source: this.m_vector_src,
                zIndex: this.m_z_idx,
                style: this.m_tri_style
            });

            this.m_map.on('click', (evt) => {
                this._on_click(evt);
            });
            this.m_map.on('pointermove', (evt) => {

                var pixel = this.m_map.getEventPixel(evt.originalEvent);
                var hit = this.m_map.hasFeatureAtPixel(pixel);
                this.m_map.getTargetElement().style.cursor = hit ? 'pointer' : '';
            });

            this.refresh();

            this.m_map.addLayer(this.m_layer);
        }
        refresh() {
            this.m_vector_src.clear();

            let points = pgis.get_point_handler().get_points();
            let coordinates = new Map();
            for (let p of points) {
                const key = `${p.x.toFixed(8)},${p.y.toFixed(8)}`;
                coordinates.set(key, p);
            }
            for (let [key, p] of coordinates) {
                var feature = new ol.Feature({
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([p.x, p.y]))
                });
                feature.pgis_point = p;
                this.m_vector_src.addFeature(feature);
            }
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
                ; feature.setStyle(this.m_clicked_tri_style)
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
        let menu = document.getElementById("menu");
        if (menu) {
            menu.remove();
        }

        m_map_handler = {
            _tile_layer: new ol.layer.Tile({
                source: new ol.source.OSM()
            }),
            set_tile_layer: (layer) => {
                m_map_handler._tile_layer = layer;
            },
            get_tile_layer: (layer) => {
                return m_map_handler._tile_layer;
            },
            get_map: () => {
                return m_map;
            },
            set_map: (map) => {
                m_map = map;
            },
            refresh: () => {
                m_point_layer.refresh();
            },
            get_selected_points:() => {
                return m_selected_points;
            },
        };
        pgis.set_map_handler(m_map_handler);

        {
            var m_gps_handler = {
                _lat : 0,
                _lng : 0,
                _set_current_position_callbacks : [],
                add_set_current_position_callback(callback){
                    m_gps_handler._set_current_position_callbacks.push(callback);
                },
                set_current_position: (lat, lng) => {
                    m_gps_handler._lat = lat;
                    m_gps_handler._lng = lng;
                    for(var callback of m_gps_handler._set_current_position_callbacks){
                        callback(lat, lng);
                    }
                },
                get_current_position: () => {
                    return {
                        x : m_gps_handler._lng,
                        y : m_gps_handler._lat,
                        latitude : m_gps_handler._lat,
                        longitude : m_gps_handler._lng,
                        timestamp : Date.now(),
                    };
                },
            };
            pgis.set_gps_handler(m_gps_handler);

            setInterval(() => {
                if(m_map && pgis.get_gps_handler() == m_gps_handler){
                    const view = m_map.getView();
                    const center = view.getCenter();
                    const centerLonLat = ol.proj.transform(center, 'EPSG:3857', 'EPSG:4326');
                    if(centerLonLat[0] < 0){
                        centerLonLat[0] += 360;
                    }
                    if(centerLonLat[1] < 0){
                        centerLonLat[1] += 360;
                    }
                    m_gps_handler.set_current_position(centerLonLat[1], centerLonLat[0]);
                }
            }, 1000);
        }

        var plugin = {
            init_options: function (options) {
                m_options = options;
                if(m_options.map && m_options.map.load_html){
                    m_plugin_host.getFile("plugins/map/map.html", function (
                        chunk_array) {
                        var txt = (new TextDecoder).decode(chunk_array[0]);
                        var node = $.parseHTML(txt);
                        $('body').append(node);
                        fn.load('home.html', () => {		
                            console.log('home.html loaded');
                        });
                    });
                    m_plugin_host.getFile("plugins/map/map.css", function (
                        chunk_array) {
                        var txt = (new TextDecoder).decode(chunk_array[0]);
                        const el = document.createElement('style');
                        el.innerHTML = txt;
                        document.head.appendChild(el);
                    });
                }
            },
            event_handler: function (sender, event) {
                if (pgis === sender) {
                    if (event === "loaded") {
                        setTimeout(() => {
                            plugin.start_map();
                        }, 1000)
                    }
                }
            },
            start_map: () => {

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
        
                map.addControl(new ol.control.ScaleLine());
                let elements = document.getElementsByClassName('ol-scale-line');
                for (let i = 0; i < elements.length; i++) {
                    elements[i].classList.add('scale-pos');
                }
        
                m_map = map;

                m_position_layer = new PositionLayer(m_map, 400);
                m_point_layer = new PointLayer(m_map, 200);
                m_point_layer.add_click_callback((event_data, feature) => {
                    m_selected_points = [];
                    if(feature){
                        m_selected_points.push(feature);
                    }
                });


                var first_call = true;
                pgis.get_gps_handler().add_set_current_position_callback((lat, lng) => {
    
                    if(first_call){
                        var userLocation = ol.proj.fromLonLat([lng, lat]);
                        m_map.getView().animate({
                            center: userLocation,
                            zoom: 20
                        });
                        first_call = false;
                    }

                    m_position_layer.refresh(lat, lng);
                });
            }
        };
        return plugin;
    }
})();