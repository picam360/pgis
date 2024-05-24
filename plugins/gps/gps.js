var create_plugin = (function () {
    var m_plugin_host = null;
    var m_options = null;
    var m_gps_handler = null;

    return function (plugin_host) {
        //debugger;
        m_plugin_host = plugin_host;

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

        var plugin = {
            init_options: function (options) {
                m_options = options;
            },
            event_handler: function (sender, event) {
                if (pgis === sender) {
                    if (event === "loaded") {
                        const info_box = document.getElementById('status-info-box');
                        if(info_box){
                            info_box.style.display = "none";
                        }
                        plugin.start_watching();
                    }
                }
            },
            start_watching: () => {
                function update_pos_data(position) {
                    console.log("current location", position.coords.latitude, position.coords.longitude);
                    pgis.get_gps_handler().set_current_position(position.coords.latitude, position.coords.longitude);
                }

                navigator.geolocation.watchPosition(update_pos_data);
        
                navigator.geolocation.getCurrentPosition((position) => {
                    update_pos_data(position);
                });
            },
        };
        return plugin;
    }
})();