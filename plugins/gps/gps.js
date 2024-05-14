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
        };
        pgis.set_gps_handler(m_gps_handler);

        var plugin = {
            init_options: function (options) {
                m_options = options;

                function update_pos_data(position) {
                    console.log("current location", position.coords.latitude, position.coords.longitude);
                    pgis.get_gps_handler().set_current_position(position.coords.latitude, position.coords.longitude);
                }

                navigator.geolocation.watchPosition(update_pos_data);
        
                navigator.geolocation.getCurrentPosition((position) => {
                    update_pos_data(position);
                });
            }
        };
        return plugin;
    }
})();