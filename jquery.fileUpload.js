// the semi-colon before function invocation is a safety net against concatenated
// scripts and/or other plugins which may not be closed properly.

(function ($, window, document, undefined) {
    'use strict';
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
	        beforeSend: false,
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
        this.$element = $(element);
        // jQuery has an extend method which merges the contents of two or
        // more objects, storing the result in the first object. The first object
        // is generally empty as we don't want to alter the default options for
        // future instances of the plugin
        this.settings = $.extend({}, defaults, options);
        this._defaults = defaults;
        this._name = pluginName;
        this._inputFile = null;
        this._files = null;

        this.init();

        $this = this;
    }

    FileUpload.prototype = {
        init: function () {
            var $element = $(this.element);

            if (this.settings.inputFile !== null) {
                switch (typeof this.settings.inputFile) {
                    case 'string':
                    case 'object':
                        this._inputFile = $(this.settings.inputFile);
                        break;
                }

                this._inputFile.hide().change(function (e) {
                    $this.drop(e);
                });
            }

            $element
	            .on('drop.fileUpload.element', this.drop)
	            .on('dragstart.fileUpload.element', this.dragStart)
	            .on('dragenter.fileUpload.element', this.dragEnter)
	            .on('dragover.fileUpload.element', this.dragOver)
	            .on('dragleave.fileUpload.element', this.dragLeave);

            $(document)
	            .on('drop.fileUpload.document', this.docDrop)
	            .on('dragstart.fileUpload.document', this.docStart)
	            .on('dragenter.fileUpload.document', this.docEnter)
	            .on('dragover.fileUpload.document', this.docOver)
	            .on('dragleave.fileUpload.document', this.docLeave);

            this._inputFile !== null && $element.on('click', function (e) {
                $this._inputFile.trigger(e);
            });
        },

		getFilesFromEvent: function(e) {
			var files = e.dataTransfer.files;

			if (files === null || files === undefined || files.length === 0) {
				$this.error(errors[0]);
				return false;
			}

			if (files.length > $this.settings.maxFiles) {
				$this.error(errors[1]);
				return false;
			}

			$this._files = [];
			for (var i = 0; i < files.length; i++) {
				$this._files.push(files.item(i));
			}

			return true;
		},

	    /**
	     * Return form data with the files
	     * @param {int} startImage
	     * @returns {FormData}
	     */
        getFormData: function (startImage) {
            var formData = new FormData(),
	            settings = this.settings,
	            files = this._files,
	            file = null,
	            i = startImage;

            startImage === undefined && (startImage = 0);

            $.each(settings.data, function (name, value) {
                formData.append(name, value);
            });

	        $.each(files.slice(startImage, startImage + settings.maxFilesPerRequest), function(index, file) {
		        formData.append(settings.paramName + '[]', file, file.name);
	        });

            return formData;
        },

	    /**
	     * Validate the files
	     * @returns {boolean}
	     */
	    validateFiles: function() {
		    var files = this._files,
			    settings = this.settings,
			    filtered = null;

		    if (!files) {
			    this.error(errors[0]);
			    return false;
		    }

		    if (files.length > settings.maxFiles) {
			    this.error(errors[1]);
			    return false;
		    }

		    if (typeof settings.allowedFileTypes === 'object' && settings.allowedFileTypes.length > 0) {
			    filtered = $.grep(files, function(file) {
				    if (file.type) {
					    for (var i in settings.allowedFileTypes) {
						    if ((new RegExp(settings.allowedFileTypes[i])).test(file.type)) {
							    return true;
						    }
					    }
				    }

				    $this.error(errors[3], file);
				    return false;
			    }, true);

			    if (filtered.length === 0) {
				    return false;
			    }
		    }

		    if (typeof settings.allowedFileExtensions === 'object' && settings.allowedFileExtensions.length > 0) {
			    filtered = $.grep(files, function(file) {
				    if (file.name) {
					    for (var i in settings.allowedFileExtensions) {
						    if (file.name.substr(file.name.length - settings.allowedFileExtensions[i].length).toLowerCase() === settings.allowedFileExtensions[i].toLowerCase()) {
							    return true;
						    }
					    }
				    }

				    $this.error(errors[8], file);
				    return false;
			    }, true);

			    if (filtered.length === 0) {
				    return false;
			    }
		    }

		    return true;
	    },

        upload: function() {
            var files = this._files,
                settings = this.settings,
                startImage = 0,
                filesDone = 0,
		        filesRejected = 0,
		        workQueue = [],
		        processingQueue = [],
		        doneQueue = [],
	            stopLoop = false;

	        if (!this.validateFiles()) {
		        return false;
	        }

	        for (; startImage < files.length; startImage += settings.maxFilesPerRequest) {
		        workQueue.push(this.getFormData(startImage));
	        }

	        var process = function() {
		        try {
			        send(workQueue);
		        } catch (exc) {

		        }
	        };

            // Process an upload, recursive
            var oldprocess = function () {
                var fileIndex;

                if (stopLoop) {
                    return false;
                }

                // Check to see if are in queue mode
                if (settings.queuefiles > 0 && processingQueue.length >= settings.queuefiles) {
                    return pause(settings.queuewait);
                } else {
                    // Take first thing off work queue
                    fileIndex = workQueue[0];
                    workQueue.splice(0, 1);

                    // Add to processing queue
                    processingQueue.push(fileIndex);
                }

                try {
                    if (beforeEach(files[fileIndex]) !== false) {
                        if (fileIndex === files_count) {
                            return;
                        }
                        var reader = new FileReader(),
                            max_file_size = 1048576 * settings.maxFileSize;

                        reader.index = fileIndex;
                        if (files[fileIndex].size > max_file_size) {
                            settings.error(errors[2], files[fileIndex], fileIndex);
                            // Remove from queue
                            processingQueue.forEach(function (value, key) {
                                if (value === fileIndex) {
                                    processingQueue.splice(key, 1);
                                }
                            });
                            filesRejected++;
                            return true;
                        }

                        reader.onerror = function (e) {
                            switch (e.target.error.code) {
                                case e.target.error.NOT_FOUND_ERR:
                                    settings.error(errors[4]);
                                    return false;
                                case e.target.error.NOT_READABLE_ERR:
                                    settings.error(errors[5]);
                                    return false;
                                case e.target.error.ABORT_ERR:
                                    settings.error(errors[6]);
                                    return false;
                                default:
                                    settings.error(errors[7]);
                                    return false;
                            }
                        };

                        reader.onloadend = !settings.beforeSend ? send : function (e) {
                            settings.beforeSend(files[fileIndex], fileIndex, function () {
                                send(e);
                            });
                        };

                        reader.readAsDataURL(files[fileIndex]);

                    } else {
                        filesRejected++;
                    }
                } catch (err) {
                    // Remove from queue
                    processingQueue.forEach(function (value, key) {
                        if (value === fileIndex) {
                            processingQueue.splice(key, 1);
                        }
                    });
                    settings.error(errors[0]);
                    return false;
                }

                // If we still have work to do,
                if (workQueue.length > 0) {
                    process();
                }
            };

            var send = function (workQueue) {
	            var formData = workQueue.shift(),
		            xhr = new XMLHttpRequest(),
		            upload = xhr.upload;

                if (settings.withCredentials) {
                    xhr.withCredentials = settings.withCredentials;
                }

                upload.index = index;
                upload.file = file;
                upload.downloadStartTime = start_time;
                upload.currentStart = start_time;
                upload.currentProgress = 0;
                upload.global_progress_index = global_progress_index;
                upload.startData = 0;
                upload.addEventListener("progress", $this.progress, false);

                // Allow url to be a method
                if ($.isFunction(settings.url)) {
                    xhr.open(settings.requestType, settings.url(), true);
                } else {
                    xhr.open(settings.requestType, settings.url, true);
                }

                xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

                // Add headers
                $.each(settings.headers, function (k, v) {
                    xhr.setRequestHeader(k, v);
                });

                settings.uploadStarted(index, file, files_count);

                xhr.onload = function () {
                    var serverResponse = null;

                    if (xhr.responseText) {
                        try {
                            serverResponse = $.parseJSON(xhr.responseText);
                        }
                        catch (e) {
                            serverResponse = xhr.responseText;
                        }
                    }

                    var now = new Date().getTime(),
                        timeDiff = now - start_time,
                        result = settings.uploadFinished(index, file, serverResponse, timeDiff, xhr);
                    filesDone++;

                    // Remove from processing queue
                    processingQueue.forEach(function (value, key) {
                        if (value === fileIndex) {
                            processingQueue.splice(key, 1);
                        }
                    });

                    // Add to donequeue
                    doneQueue.push(fileIndex);

                    // Make sure the global progress is updated
                    global_progress[global_progress_index] = 100;
                    globalProgress();

                    if (filesDone === (files_count - filesRejected)) {
                        afterAll();
                    }

                    if (result === false) {
                        stopLoop = true;
                    }


                    // Pass any errors to the error option
                    if (xhr.status < 200 || xhr.status > 299) {
                        settings.error(xhr.statusText, file, fileIndex, xhr.status);
                    }
                };
            };

            // Initiate the processing loop
            return process();
        },

	    /**
	     *
	     * @param e
	     * @returns {boolean}
	     */
        drop: function(e) {
	        e.originalEvent.stopPropagation();
	        e.originalEvent.preventDefault();
            $this.settings.drop && $this.settings.drop(e);

            if (!e.dataTransfer) {
                return false;
            }

		    if (!$this.getFilesFromEvent(e)) {
			    return false;
		    }

            $this.settings.lazyLoad || $this.upload();
            e.preventDefault();
            return false;
        },

        dragStart: function(e) {
	        e.originalEvent.stopPropagation();
	        e.originalEvent.preventDefault();
            $this.settings.dragStart && $this.settings.dragStart(e);
        },

        dragEnter: function(e) {
	        e.originalEvent.stopPropagation();
	        e.originalEvent.preventDefault();
            $this.settings.dragEnter && $this.settings.dragEnter(e);
        },

        dragOver: function(e) {
	        e.originalEvent.stopPropagation();
	        e.originalEvent.preventDefault();
            $this.settings.dragOver && $this.settings.dragOver(e);
        },

        dragLeave: function(e) {
	        e.originalEvent.stopPropagation();
	        e.originalEvent.preventDefault();
            $this.settings.dragLeave && $this.settings.dragLeave(e);
        },

        docDrop: function(e) {
	        e.originalEvent.stopPropagation();
	        e.originalEvent.preventDefault();
            $this.settings.docDrop && $this.settings.docDrop(e);
        },

	    docStart: function(e) {
		    e.originalEvent.stopPropagation();
		    e.originalEvent.preventDefault();
		    $this.settings.docStart && $this.settings.docStart(e);
	    },

        docEnter: function(e) {
	        e.originalEvent.stopPropagation();
	        e.originalEvent.preventDefault();
            $this.settings.docEnter && $this.settings.docEnter(e);
        },

        docOver: function(e) {
	        e.originalEvent.stopPropagation();
	        e.originalEvent.preventDefault();
            $this.settings.docOver && $this.settings.docOver(e);
        },

        docLeave: function(e) {
	        e.originalEvent.stopPropagation();
	        e.originalEvent.preventDefault();
            $this.settings.docLeave && $this.settings.docLeave(e);
        },

        beforeEach: function() {
            $this.settings.docLeave && $this.settings.docLeave(e);
        },

	    beforeSend: function(file, index, callback) {
		    $this.settings.beforeSend && $this.settings.beforeSend(file, index, callback);
	    },

        afterAll: function() {
            $this.settings.beforeEach && $this.settings.beforeEach(e);
        },

        rename: function() {
            $this.settings.rename && $this.settings.rename(e);
        },

        error: function(err, file, i, status) {
            $this.settings.error && $this.settings.error(err, file, i, status);
        },

        uploadStarted: function() {
            $this.settings.uploadStarted && $this.settings.uploadStarted(e);
        },

        uploadFinished: function() {
            $this.settings.uploadFinished && $this.settings.uploadFinished(e);
        },

        progressUpdated: function(index, file, currentProgress) {
            $this.settings.progressUpdated && $this.settings.progressUpdated(index, file, currentProgress);
        },

        speedUpdated: function(index, file, speed) {
            $this.settings.speedUpdated && $this.settings.speedUpdated(index, file, speed);
        },

        progress: function(e) {
            // this = XMLHttpRequestUpload
            // $this = FileUpload
            if (e.lengthComputable) {
                var percentage = Math.round((e.loaded * 100) / e.total),
                    elapsed = null,
                    diffTime = null,
                    diffData = null,
                    speed = null;

                if (this.currentProgress !== percentage) {
                    this.currentProgress = percentage;
                    $this.progressUpdated(this.index, this.file, this.currentProgress);

                    elapsed = (new Date()).getTime();
                    diffTime = elapsed - this.currentStart;
                    if (diffTime >= $this.settings.refresh) {
                        diffData = e.loaded - this.startData;
                        speed = diffData / diffTime; // KB per second
                        $this.speedUpdated(this.index, this.file, speed);
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
