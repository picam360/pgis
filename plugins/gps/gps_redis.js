//Web Geolocation API
var create_plugin = (function () {
    var m_plugin_host = null;
    var m_options = null;
    var m_gps_handler = null;

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
            name : "gps_redis",
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
				if(m_options.webdis_url && m_options.nmea_channel){//webdis

					const socket = new WebSocket(m_options.webdis_url);

					socket.onmessage = function(event) {
						const data = JSON.parse(event.data);
						if(data["SUBSCRIBE"]){
							if(data["SUBSCRIBE"][1] == m_options.nmea_channel){
								const nmea_header = "$GNGGA";
								if(data["SUBSCRIBE"][0] != "message" || !data["SUBSCRIBE"][2].startsWith(nmea_header)){
									return;
								}
                                const nmea_split = data["SUBSCRIBE"][2].split(',');
                                pgis.get_gps_handler().set_current_position(
                                    _convert_DMS_to_deg(nmea_split[2]), 
                                    _convert_DMS_to_deg(nmea_split[4]));
								//console.log(json_str);
							}
						}
					};
			
					socket.onopen = function() {
						console.log("webdis connection established");
						if(m_options.nmea_channel){
							socket.send(JSON.stringify(["SUBSCRIBE", m_options.nmea_channel]));
						}
					};
			
					socket.onclose = function() {
						console.log("webdis connection closed");
					};
			
					socket.onerror = function(error) {
						console.log(`Error: ${error.message}`);
					};
				}
            },
        };
        return plugin;
    }
})();