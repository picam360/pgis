var pgis = (() => {
    var m_options = {};
    var m_is_DOMContentLoaded = false;
    var m_is_deviceready = false;
    var m_point_handler = {
        get_point_id_list() { throw new Error('not implemented'); },
        get_point(gp_id){ throw new Error('not implemented'); },
        set_point(gp) { throw new Error('not implemented'); },
        delete_point(gp_id) { throw new Error('not implemented'); },
    };
    var m_map_handler = {
        set_tile_layer(layer) { throw new Error('not implemented'); },
        get_tile_layer(layer) { throw new Error('not implemented'); },
        get_map() { throw new Error('not implemented'); },
        set_map(map) { throw new Error('not implemented'); },
        refresh() { throw new Error('not implemented'); },
        get_selected_points() { throw new Error('not implemented'); },
    };
    var m_gps_handler = {
        add_set_current_position_callback(callback) { throw new Error('not implemented'); },
        set_current_position(lat, lng) { throw new Error('not implemented'); },
        get_current_position() { throw new Error('not implemented'); },
    };

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
        var content = document.getElementById('main-content');
        var menu = document.getElementById('main-menu');
        content.load(page, { callback })
            .then(menu.close.bind(menu));
    };

    function closeMenu() {
        var menu = document.getElementById('main-menu');
        menu.close();
    }
    function openMenu() {
        var menu = document.getElementById('main-menu');
        menu.open();
    }

    document.addEventListener('deviceready', () => {
        m_is_deviceready = true;
    });

    document.addEventListener("DOMContentLoaded", () => {
        m_is_DOMContentLoaded = true;
    });

    var self = {
        debug: 0,
        plugin_host: null,
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
                        m_point_handler.init();
                        pgis.plugin_host.send_event(self, "loaded");
                    }, 1000);
                });
            }, 100);
        },
        get_point_handler: () => { return m_point_handler; },
        set_point_handler: (handler) => { m_point_handler = handler; },
        get_map_handler: () => { return m_map_handler; },
        set_map_handler: (handler) => { m_map_handler = handler; },
        get_gps_handler: () => { return m_gps_handler; },
        set_gps_handler: (handler) => { m_gps_handler = handler; },
    }
    return self;
})();
pgis.init(pgis_conf);