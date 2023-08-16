var create_plugin = (function() {
	var m_plugin_host = null;
	
	return function(plugin_host) {
		//debugger;
		m_plugin_host = plugin_host;
		m_plugin_host.getFile("plugins/camera/camera.html", function(
			chunk_array) {
			var txt = (new TextDecoder).decode(chunk_array[0]);
			var node = $.parseHTML(txt);
			$('body').append(node);
			fn.load('camera.html', {
				callback : function() {		
					console.log('camera.html loaded');
				}});
		});
		
		var plugin = {
			init_options : function(options) {
			},
			event_handler : function(sender, event) {
			},
		};
		return plugin;
	}
})();