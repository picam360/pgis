
// interface for plugin
function PluginHost(core, options) {
	//private members
	var m_options = options || {};
	var m_debug = core.debug;
	var m_plugins = [];
	var m_loaded_scripts = {};

	var query = {};//GetQueryString();
	
	//private functions
	function handle_command(cmd, callback, ext) {
	}

	//public members / functions
	var self = {
		get_plugin: function(name) {
			for (var i = 0; i < m_plugins.length; i++) {
				if (name == m_plugins[i].name) {
					return m_plugins[i];
				}
			}
			return null;
		},
		send_command: function(cmd, callback, ext) {
			for (var i = 0; i < m_plugins.length; i++) {
				if (m_plugins[i].command_handler) {
					m_plugins[i].command_handler(cmd, callback, ext);
				}
			}
			handle_command(cmd, callback, ext);
		},
		send_event: function(sender, event) {
			for (var i = 0; i < m_plugins.length; i++) {
				if (m_plugins[i].event_handler) {
					m_plugins[i].event_handler(sender, event);
				}
			}
		},
		add_plugin_from_script: function(name, options, chunk_array, callback) {
			var script = document
				.createElement('script');
			script.onload = function() {
				console.log("loaded : " + name);
				if (create_plugin) {
					var plugin = create_plugin(self);
					m_plugins.push(plugin);
					create_plugin = null;
				}
				if (callback) {
					callback();
				}
			};
			console.log("loding : " + name);
			
			var blob = new Blob(chunk_array, {
				type: "text/javascript"
			});

			if(1){
				//for debug ability
				const reader = new FileReader();
	
				reader.readAsDataURL(blob);
				reader.onloadend = () => {
					script.src = reader.result;
		
					document.head.appendChild(script);
				};
			}else{
				script.src = url.createObjectURL(blob);
			}
		},
		init_plugins: function() {
			return new Promise((fullfill,reject) => {
				if (!m_options.plugin_paths || m_options.plugin_paths.length == 0) {
					fullfill();
					return;
				}
				function load_plugin(idx) {
					self.getFileUrl(m_options.plugin_paths[idx], function(
							url) {
							var script = document
								.createElement('script');
							script.onload = function() {
								console.log("loaded : " +
									m_options.plugin_paths[idx]);
								if (create_plugin) {
									var plugin = create_plugin(self);
									m_plugins.push(plugin);
									create_plugin = null;
								}
								if (idx + 1 < m_options.plugin_paths.length) {
									load_plugin(idx + 1);
								} else {
									for (var i = 0; i < m_plugins.length; i++) {
										if (m_plugins[i].init_options) {
											m_plugins[i].init_options(m_options[m_plugins[i].name] || {});
										}
									}
									fullfill();
								}
							};
							console.log("loding : " +
								m_options.plugin_paths[idx]);
							script.src = url;
	
							document.head.appendChild(script);
						});
				}
				load_plugin(0);
			});
		},
		log: function(str, level) {
			if (level && level <= m_debug) {
				console.log(str);
			}
		},
		getFile: function(path, callback) {
			var req = new XMLHttpRequest();
			req.responseType = "arraybuffer";
			req.open("get", path, true);
			req.send(null);
		
			req.onload = function() {
				callback([new Uint8Array(req.response)]);
			}
		},
		getFileUrl: function(path, callback) {
			callback(path);
		},
		loadScript: (path) => {
			return new Promise((resolve, reject) => {
				if(m_loaded_scripts[path]){
					console.log("already loaded : ", path);
					resolve();
				}else{
					self.getFileUrl(path, function(url) {
						var script = document
							.createElement('script');
						script.onload = resolve;
						script.src = url;

						m_loaded_scripts[path] = script;
			
						document.head.appendChild(script);
					});
				}
			});
		},
		refresh_app_menu: function() {
			for (var i = 0; i < m_plugins.length; i++) {
				if (m_plugins[i].on_refresh_app_menu) {
					m_plugins[i].on_refresh_app_menu(app.menu);
				}
			}
		},
		restore_app_menu: function() {
			app.menu.setMenuPage("menu.html", {
				callback: function() {
					for (var i = 0; i < m_plugins.length; i++) {
						if (m_plugins[i].on_restore_app_menu) {
							m_plugins[i].on_restore_app_menu(app.menu);
						}
					}
					self.refresh_app_menu();
				}
			});
		},
	};
	return self;
};