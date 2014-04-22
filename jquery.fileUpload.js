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
		$this = null,
		global_progress = [],
		defaults = {
			url: '',
			data: {},
			paramName: 'files',
			lazyLoad: false,
			inputFile: null,
			maxFiles: 25,           // Ignored if queueFiles is set > 0
			maxFileSize: 1,         // MB file size limit
			maxFilesPerRequest: 1,  // 0 = All files in one request
			refresh: 1000,
			drop: false,
			dragStart: false,
			dragEnter: false,
			dragOver: false,
			dragLeave: false,
			docEnter: false,
			docOver: false,
			docLeave: false,
			beforeEach: false,
			afterAll: false,
			rename: false,
			error: false,
			uploadStarted: false,
			uploadFinished: false,
			progressUpdated: false,
			globalProgressUpdated: false,
			speedUpdated: false,
			allowedFileExtensions: [],
			allowedFileTypes: []
		},
		errors = [
			"BrowserNotSupported", "TooManyFiles", "FileTooLarge", "FileTypeNotAllowed",
			"NotFound", "NotReadable", "AbortError", "ReadError", "FileExtensionNotAllowed"
		];

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
		this._inputFile = null;
		this._files = null;

		this.init();

		$this = this;
	}

	FileUpload.prototype = {
		init: function () {
			if (this.settings.inputFile !== null) {
				switch (typeof this.settings.inputFile) {
					case 'string':
					case 'object':
						this._inputFile = $(this.settings.inputFile);
						break;
				}

				this._inputFile.hide().change(function (e) {
					$this.settings.drop(e);
					$this._files = e.target.files;
					$this.upload();
				});
			}

			this.on('drop', this.drop).on('dragstart', this.dragStart).on('dragenter', this.dragEnter).on('dragover', this.dragOver).on('dragleave', this.dragLeave);
			$(document).on('drop', this.docDrop).on('dragenter', this.docEnter).on('dragover', this.docOver).on('dragleave', this.docLeave);

			this._inputFile !== null && this.on('click', function (e) {
				$this._inputFile.trigger(e);
			});
		},
		
		getFormData: function (startImage) {
			var formData = new FormData();

			startImage === undefined && (startImage = 0);

			$.each(this.settings.data, function (name, value) {
				formData.append(name, value);
			});

			$.each(this._files.slice(startImage, startImage + this.settings.maxFilesPerRequest), function(index, file) {
				formData.append($this.settings.paramName + '[]', file, file.name);
			});

			return formData;
		},

		upload: function() {

		},

		drop: function(e) {
			this.settings.drop && this.settings.drop(e);

			if (!e.dataTransfer) {
				return;
			}
			this._files = e.dataTransfer.files;
			if (this._files === null || this._files === undefined || this._files.length === 0) {
				this.error(errors[0]);
				return false;
			}
			this.settings.lazyLoad || this.upload();
			e.preventDefault();
			return false;
		},

		dragStart: function(e) {
			this.settings.dragStart && this.settings.dragStart(e);
		},

		dragEnter: function(e) {
			this.settings.dragEnter && this.settings.dragEnter(e);
		},

		dragOver: function(e) {
			this.settings.dragOver && this.settings.dragOver(e);
		},

		dragLeave: function(e) {
			this.settings.dragLeave && this.settings.dragLeave(e);
		},

		docDrop: function(e) {
			this.settings.docDrop && this.settings.docDrop(e);
		},

		docEnter: function(e) {
			this.settings.docEnter && this.settings.docEnter(e);
		},

		docOver: function(e) {
			this.settings.docOver && this.settings.docOver(e);
		},

		docLeave: function(e) {
			this.settings.docLeave && this.settings.docLeave(e);
		},

		beforeEach: function() {
			this.settings.docLeave && this.settings.docLeave(e);
		},

		afterAll: function() {
			this.settings.beforeEach && this.settings.beforeEach(e);
		},

		rename: function() {
			this.settings.rename && this.settings.rename(e);
		},

		error: function(err, file, i, status) {
			this.settings.error && this.settings.error(err, file, i, status);
		},

		uploadStarted: function() {
			this.settings.uploadStarted && this.settings.uploadStarted(e);
		},

		uploadFinished: function() {
			this.settings.uploadFinished && this.settings.uploadFinished(e);
		},

		progressUpdated: function(index, file, currentProgress) {
			this.settings.progressUpdated && this.settings.progressUpdated(index, file, currentProgress);
		},

		speedUpdated: function(index, file, speed) {
			this.settings.speedUpdated && this.settings.speedUpdated(index, file, speed);
		},

		progress: function(e) {
			/**
			 * this =
			 */
			if (e.lengthComputable) {
				var percentage = Math.round((e.loaded * 100) / e.total),
					elapsed = null,
					diffTime = null,
					diffData = null,
					speed = null;

				if (this.currentProgress !== percentage) {
					this.currentProgress = percentage;
					this.progressUpdated(this.index, this.file, this.currentProgress);

					elapsed = new Date().getTime();
					diffTime = elapsed - this.currentStart;
					if (diffTime >= this.settings.refresh) {
						diffData = e.loaded - this.startData;
						speed = diffData / diffTime; // KB per second
						this.speedUpdated(this.index, this.file, speed);
						this.startData = e.loaded;
						this.currentStart = elapsed;
					}
				}
			}
		}
	};

	// A really lightweight plugin wrapper around the constructor,
	// preventing against multiple instantiations
	$.fn.fileUpload = function (options, params) {
		this.each(function () {
			if (!$.data(this, 'plugin_' + pluginName)) {
				if (typeof options !== 'object') {
					throw 'Invalid Parameter'
				}

				$.data(this, 'plugin_' + pluginName, new FileUpload(this, options));
			}

			if (typeof options === 'string') {
				typeof $.data(this, 'plugin_' + pluginName).options === 'function'
					&& $.data(this, 'plugin_' + pluginName).options(params);
			}
		});

		// chain jQuery functions
		return this;
	};

})(jQuery, window, document);
