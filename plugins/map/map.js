var create_plugin = (function () {
    var m_plugin_host = null;
    var m_options = null;
    var m_map_handler = null;
    var m_map = null;
    var m_position_layer = null;

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

    return function (plugin_host) {
        //debugger;
        m_plugin_host = plugin_host;
        let menu = document.getElementById("menu");
        if (menu) {
            menu.remove();
        }
        m_plugin_host.getFile("plugins/map/map.html", function (
            chunk_array) {
            var txt = (new TextDecoder).decode(chunk_array[0]);
            var node = $.parseHTML(txt);
            $('body').append(node);
        });
        m_plugin_host.getFile("plugins/map/map.css", function (
            chunk_array) {
            var txt = (new TextDecoder).decode(chunk_array[0]);
            const el = document.createElement('style');
            el.innerHTML = txt;
            document.head.appendChild(el);
        });

        var m_map_handler = {
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
        };
        pgis.set_map_handler(m_map_handler);

        var plugin = {
            init_options: function (options) {
                m_options = options;

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
            },
            event_handler: function (sender, event) {
                if (pgis === sender) {
                    if (event === "loaded") {
                        plugin.start_map();
                    }
                }
            },
            start_map: () => {
                m_position_layer = new PositionLayer(m_map, 400);

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