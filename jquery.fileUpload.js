;
(function ($, window, document, undefined) {
    'use strict';
    jQuery.event.props.push("dataTransfer");

    var pluginName = "fileUpload",
        $this = null,
        global_progress = [],
        defaults = {
            url: '',
            data: {},
            paramName: 'files',
	        requestType: 'POST',
	        withCredentials: false,
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
            allowedFileTypes: [],
	        headers: []
        },
        errors = [
            "BrowserNotSupported",
	        "TooManyFiles",
	        "FileTooLarge",
	        "FileTypeNotAllowed",
            "NotFound",
	        "NotReadable",
	        "AbortError",
	        "ReadError",
	        "FileExtensionNotAllowed",
	        "XMLHttpRequestException"
        ];

	/**
	 *
	 * @param element
	 * @param options
	 * @constructor
	 */
    function FileUpload(element, options) {
        this.element = element;
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
            } else {
	            var file = document.createElement('input');
	            file.type = 'file';
	            file.id = this.element.id + '-file';
	            file.multiple = true;
	            document.getElementsByTagName('body')[0].appendChild(file);
	            this._inputFile = $(file);
            }

	        this._inputFile.hide().change(function (e) {
		        $this.drop(e);
	        });

            $element
	            .on('drop.fileUpload.element', this.drop)
	            .on('dragstart.fileUpload.element', this.dragStart)
	            .on('dragenter.fileUpload.element', this.dragEnter)
	            .on('dragover.fileUpload.element', this.dragOver)
	            .on('dragleave.fileUpload.element', this.dragLeave)
	            .on('click.fileUpload.element', function (e) {
		            $this._inputFile.trigger(e);
	            });

            $(document)
	            .on('drop.fileUpload.document', this.docDrop)
	            .on('dragstart.fileUpload.document', this.docStart)
	            .on('dragenter.fileUpload.document', this.docEnter)
	            .on('dragover.fileUpload.document', this.docOver)
	            .on('dragleave.fileUpload.document', this.docLeave);
        },

		getFilesFromEvent: function(e) {
			var files = e.dataTransfer.files;

			if (files === null || files === undefined || files.length === 0) {
				throw new BrowserNotSupportedException();
			}

			if (files.length > $this.settings.maxFiles) {
				throw new TooManyFilesException();
			}

			this._files = [];
			for (var i = 0; i < files.length; i++) {
				this._files.push(files.item(i));
			}

			return this.validateFiles();
		},

	    /**
	     * Return form data with the files
	     * @param {File} file
	     * @param {int} index
	     * @returns {FormData}
	     */
        getFormData: function (file, index) {
		    if (!file) {
			    throw new ReadErrorException('Arquivo necessário para o FormData');
		    }

            var formData = new FormData(),
	            settings = this.settings;

            $.each(settings.data, function (name, value) {
                formData.append(name, value);
            });

		    formData.append(settings.paramName, file, file.name);
		    formData.file = file;
		    formData.index = index;

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
			    this.error(new BrowserNotSupportedException());
			    this._files = [];
			    return false;
		    }

		    if (files.length > settings.maxFiles) {
			    this.error(new TooManyFilesException());
			    this._files = [];
			    return false;
		    }

		    if (typeof settings.allowedFileTypes === 'object' && settings.allowedFileTypes.length > 0) {
			    filtered = $.grep(files, function(file) {
				    if (file.type) {
					    for (var i in settings.allowedFileTypes) {
						    if ((new RegExp(settings.allowedFileTypes[i])).test(file.type)) {
							    return false;
						    }
					    }
				    }

				    $this.error(new FileTypeNotAllowedException(null, file));
				    return true;
			    }, true);

			    this._files = filtered;

			    if (filtered.length === 0) {
				    return false;
			    }
		    }

		    if (typeof settings.allowedFileExtensions === 'object' && settings.allowedFileExtensions.length > 0) {
			    filtered = $.grep(files, function(file) {
				    if (file.name) {
					    for (var i in settings.allowedFileExtensions) {
						    if (file.name.substr(file.name.length - settings.allowedFileExtensions[i].length).toLowerCase() === settings.allowedFileExtensions[i].toLowerCase()) {
							    return false;
						    }
					    }
				    }

				    $this.error(new FileExtensionNotAllowedException(null, file));
				    return true;
			    }, true);

			    this._files = filtered;

			    if (filtered.length === 0) {
				    return false;
			    }
		    }

		    return true;
	    },

        upload: function() {
            var files = this._files,
                settings = this.settings,
                filesDone = 0,
		        filesRejected = 0,
		        workQueue = [],
		        processingQueue = [],
		        doneQueue = [],
	            stopLoop = false;

	        if (!this.validateFiles()) {
		        return false;
	        }

	        $.each(files, function(index, file) {
		        workQueue.push($this.getFormData(file, index));
	        });

	        var process = function(thisObj) {
		        try {
			        send(workQueue);
		        } catch (exc) {
			        thisObj.error(exc);
		        }
	        };

            var send = function () {
	            var formData = workQueue.shift(),
		            xhr = new XMLHttpRequest(),
		            upload = xhr.upload,
		            startTime = new Date().getTime(),
		            index = null,
		            file = null;

	            if (!formData) {
		            return false;
	            }

	            index = formData.index;
	            file = formData.file;

                if (settings.withCredentials) {
                    xhr.withCredentials = settings.withCredentials;
                }

	            upload.file = file;
	            upload.index = index;
                upload.downloadStartTime = startTime;
                upload.currentStart = startTime;
                upload.currentProgress = 0;
                upload.startData = 0;
                upload.addEventListener('progress', $this.progress, false);

                // Allow url to be a method
                if ($.isFunction(settings.url)) {
                    xhr.open(settings.requestType, settings.url(), true);
                } else {
                    xhr.open(settings.requestType, settings.url, true);
                }

                xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

                // Add headers
                $.each(settings.headers, function (key, value) {
                    xhr.setRequestHeader(key, value);
                });

                $this.uploadStarted(index, file);

                xhr.onload = function () {
                    var serverResponse = null;

                    if (xhr.responseText) {
                        try {
	                        serverResponse = JSON.parse(xhr.responseText);
                        } catch (e) {
                            serverResponse = xhr.responseText;
                        }
                    }

                    var now = new Date().getTime(),
                        timeDiff = now - startTime,
                        result = $this.uploadFinished(index, file, serverResponse, timeDiff, xhr);
                    filesDone++;

                    // Remove from processing queue
                    processingQueue.forEach(function (value, key) {
                        if (value === index) {
                            processingQueue.splice(key, 1);
                        }
                    });

                    // Add to donequeue
                    doneQueue.push(file);

                    if (filesDone === (files.length - filesRejected)) {
                        $this.afterAll();
                    }

                    if (result === false) {
                        stopLoop = true;
                    }

                    // Pass any errors to the error option
                    if (xhr.status < 200 || xhr.status > 299) {
	                    $this.error(new XMLHttpRequestException(xhr.statusText, xhr, file));
                    }
                };

	            xhr.send(formData);

	            return send(workQueue);
            };

            // Initiate the processing loop
            return process(this);
        },

        drop: function(e) {
	        e.originalEvent.stopPropagation();
	        e.originalEvent.preventDefault();

	        try {
		        $this.settings.drop && $this.settings.drop(e);

		        if (!e.dataTransfer) {
			        throw new BrowserNotSupportedException();
		        }

		        if (!$this.getFilesFromEvent(e)) {
			        throw new NotFoundException();
		        }

		        $.each($this._files, function(index, file) {
			        $this.beforeEach(index, file);
		        });

		        $this.settings.lazyLoad || $this.upload();
		        return true;
	        } catch (err) {
		        $this.error(err);
		        return false;
	        }
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

        beforeEach: function(index, file) {
            $this.settings.beforeEach && $this.settings.beforeEach(index, file);
        },

	    /**
	     *
	     * @param {int} index
	     * @param {File} file
	     * @param {function} [callback]
	     */
	    beforeSend: function(index, file, callback) {
		    $this.settings.beforeSend && $this.settings.beforeSend(index, file, callback);
	    },

        afterAll: function() {
            $this.settings.afterAll && $this.settings.afterAll();
        },

	    /**
	     *
	     * @param {String} name
	     * @returns {String|null}
	     */
        rename: function(name) {
	        if ($.isFunction($this.settings.rename)) {
		        return $this.settings.rename(name);
	        }

	        return null;
        },

	    /**
	     *
	     * @param {Error} err
	     */
        error: function(err) {
            $this.settings.error && $this.settings.error(err);
        },

	    /**
	     *
	     * @param {int} index
	     * @param {File} file
	     */
        uploadStarted: function(index, file) {
            $this.settings.uploadStarted && $this.settings.uploadStarted(index, file);
        },

        uploadFinished: function(index, file, serverResponse, timeDiff, xhr) {
	        if ($.isFunction($this.settings.uploadFinished)) {
		        return $this.settings.uploadFinished(index, file, serverResponse, timeDiff, xhr);
	        }

	        return true;
        },

        progressUpdated: function(index, file, currentProgress) {
            $this.settings.progressUpdated && $this.settings.progressUpdated(index, file, currentProgress);
        },

	    /**
	     *
	     * @param {int} index
	     * @param {File} file
	     * @param {float} speed
	     */
        speedUpdated: function(index, file, speed) {
            $this.settings.speedUpdated && $this.settings.speedUpdated(index, file, speed);
        },

	    /**
	     *
	     * @this XMLHttpRequestUpload
	     * @param {event} e
	     */
        progress: function(e) {
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

	/**
	 *
	 * @param {Object|String} options - Objeto com os parâmetros do plugin, ou string com nome da função a ser executada
	 * @param [...]
	 * @returns {jQuery}
	 */
    $.fn.fileUpload = function (options) {
	    var args = Array.prototype.slice.call(arguments, 1);
        this.each(function () {
            if (!$.data(this, 'plugin_' + pluginName)) {
                if (typeof options !== 'object') {
                    throw 'Invalid Parameter'
                }

                $.data(this, 'plugin_' + pluginName, new FileUpload(this, options));
            }

            if (typeof options === 'string') {
	            var fileUpload = $.data(this, 'plugin_' + pluginName);

                $.isFunction(fileUpload[options])
                    && fileUpload[options].apply(fileUpload, args);
            }
        });

        // chain jQuery functions
        return this;
    };

	// region Exceptions
	/**
	 * XMLHttpRequest Exception
	 * @augments Error
	 * @param {String} message
	 * @param {XMLHttpRequest} xhr
	 * @param {File} file
	 * @constructor
	 */
	function XMLHttpRequestException(message, xhr, file) {
		this.message = message || 'XMLHttpRequestException';
		this.name = 'XMLHttpRequestException';
		this.xhr = xhr;
		this.file = file;
	}
	XMLHttpRequestException.prototype = new Error();
	XMLHttpRequestException.prototype.constructor = XMLHttpRequestException;

	/**
	 * Browser Not Supported Exception
	 * @augments Error
	 * @param {String} message
	 * @constructor
	 */
	function BrowserNotSupportedException(message) {
		this.message = message || 'Browser Not Supported';
		this.name = 'BrowserNotSupportedException';
	}
	BrowserNotSupportedException.prototype = new Error();
	BrowserNotSupportedException.prototype.constructor = BrowserNotSupportedException;

	/**
	 * Too Many Files Exception
	 * @augments Error
	 * @param {String} message
	 * @constructor
	 */
	function TooManyFilesException(message) {
		this.message = message || 'Too Many Files';
		this.name = 'TooManyFilesException';
	}
	TooManyFilesException.prototype = new Error();
	TooManyFilesException.prototype.constructor = TooManyFilesException;

	/**
	 * File Too Large Exception
	 * @augments Error
	 * @param {String} message
	 * @constructor
	 */
	function FileTooLargeException(message) {
		this.message = message || 'File Too Large';
		this.name = 'FileTooLargeException';
	}
	FileTooLargeException.prototype = new Error();
	FileTooLargeException.prototype.constructor = FileTooLargeException;

	/**
	 * File Type Not Allowed Exception
	 * @augments Error
	 * @param {String} message
	 * @param {File} file
	 * @constructor
	 */
	function FileTypeNotAllowedException(message, file) {
		this.message = message || 'File Type Not Allowed';
		this.name = 'FileTypeNotAllowedException';
		this.file = file;
	}
	FileTypeNotAllowedException.prototype = new Error();
	FileTypeNotAllowedException.prototype.constructor = FileTypeNotAllowedException;

	/**
	 * Not Found Exception
	 * @augments Error
	 * @param {String} message
	 * @constructor
	 */
	function NotFoundException(message) {
		this.message = message || 'Not Found';
		this.name = 'NotFoundException';
	}
	NotFoundException.prototype = new Error();
	NotFoundException.prototype.constructor = NotFoundException;

	/**
	 * Not Readable Exception
	 * @augments Error
	 * @param {String} message
	 * @constructor
	 */
	function NotReadableException(message) {
		this.message = message || 'Not Readable';
		this.name = 'NotReadableException';
	}
	NotReadableException.prototype = new Error();
	NotReadableException.prototype.constructor = NotReadableException;

	/**
	 * Abort Error Exception
	 * @augments Error
	 * @param {String} message
	 * @constructor
	 */
	function AbortErrorException(message) {
		this.message = message || 'Abort Error';
		this.name = 'AbortErrorException';
	}
	AbortErrorException.prototype = new Error();
	AbortErrorException.prototype.constructor = AbortErrorException;

	/**
	 * Read Error Exception
	 * @augments Error
	 * @param {String} message
	 * @constructor
	 */
	function ReadErrorException(message) {
		this.message = message || 'Read Error';
		this.name = 'ReadErrorException';
	}
	ReadErrorException.prototype = new Error();
	ReadErrorException.prototype.constructor = ReadErrorException;

	/**
	 * File Extension Not Allowed Exception
	 * @augments Error
	 * @param {String} message
	 * @param {File} file
	 * @constructor
	 */
	function FileExtensionNotAllowedException(message, file) {
		this.message = message || 'File Extension Not Allowed';
		this.name = 'FileExtensionNotAllowedException';
		this.file = file;
	}
	FileExtensionNotAllowedException.prototype = new Error();
	FileExtensionNotAllowedException.prototype.constructor = FileExtensionNotAllowedException;
	// endregion
})(jQuery, window, document);