// the semi-colon before function invocation is a safety net against concatenated
// scripts and/or other plugins which may not be closed properly.
;
(function ($, window, document, undefined) {

	jQuery.event.props.push("dataTransfer");

	// undefined is used here as the undefined global variable in ECMAScript 3 is
	// mutable (ie. it can be changed by someone else). undefined isn't really being
	// passed in so we can ensure the value of it is truly undefined. In ES5, undefined
	// can no longer be modified.

	// window and document are passed through as local variable rather than global
	// as this (slightly) quickens the resolution process and can be more efficiently
	// minified (especially when both are regularly referenced in your plugin).

	// Create the defaults once
	var pluginName = "fileUpload",
		defaults = {
			url: '',
			data: {},
			paramName: 'files',
			lazyLoad: false
		};

	// The actual plugin constructor
	function FileUpload(element, options) {
		this.element = element;
		// jQuery has an extend method which merges the contents of two or
		// more objects, storing the result in the first object. The first object
		// is generally empty as we don't want to alter the default options for
		// future instances of the plugin
		this.settings = $.extend({}, defaults, options);
		this._defaults = defaults;
		this._name = pluginName;
		this._dashdash = '--';
		this._crlf = '\r\n';

		this.init();
	}

	FileUpload.prototype = {
		init: function () {
			// Place initialization logic here
			// You already have access to the DOM element and
			// the options via the instance, e.g. this.element
			// and this.settings
			// you can add more functions like the one below and
			// call them like so: this.yourOtherFunction(this.element, this.settings).
			console.log("xD");
		},
		
		getBuilder: function (filename, filedata) {
			var builder = '',
				$this = this,
				boundary = '------multipartformboundary' + (new Date).getTime();

			$.each(this.settings.data, function (name, value) {
				builder += $this.buildRequestParam(name, value, boundary);
			});

			builder += this._dashdash;
			builder += boundary;
			builder += this._crlf;
			builder += 'Content-Disposition: form-data; name="' + this.settings.paramName + '"';
			builder += '; filename="' + filename + '"';
			builder += this._crlf;

			builder += 'Content-Type: application/octet-stream';
			builder += this._crlf;
			builder += this._crlf;

			builder += filedata;
			builder += this._crlf;

			builder += this._dashdash;
			builder += boundary;
			builder += this._dashdash;
			builder += this._crlf;
			return builder;
		},
		buildRequestParam: function(name, value, boundary) {
			var param = '';
			switch (typeof value) {
				case 'object':
					for (var i in value) {
						param += this.buildRequestParam(name + '[' + String(i) + ']', value[i], boundary);
					}
					break;
				case 'function':
					param += this._dashdash;
					param += boundary;
					param += this._crlf;
					param += 'Content-Disposition: form-data; name="' + name + '"';
					param += this._crlf;
					param += this._crlf;
					param += value();
					param += this._crlf;
					break;
				default:
					param += this._dashdash;
					param += boundary;
					param += this._crlf;
					param += 'Content-Disposition: form-data; name="' + name + '"';
					param += this._crlf;
					param += this._crlf;
					param += value;
					param += this._crlf;
					break;
			}

			return param;
		}
	};

	// A really lightweight plugin wrapper around the constructor,
	// preventing against multiple instantiations
	$.fn[pluginName] = function (options) {
		this.each(function () {
			if (!$.data(this, "plugin_" + pluginName)) {
				$.data(this, "plugin_" + pluginName, new FileUpload(this, options));
			}
		});

		// chain jQuery functions
		return this;
	};

})(jQuery, window, document);
