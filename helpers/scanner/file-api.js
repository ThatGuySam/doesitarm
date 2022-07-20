import { EventEmitter } from 'events'

export function File (input) {
    var self = this;

    function updateStat(stat) {
        self.stat = stat;
        self.lastModifiedDate = self.stat.mtime;
        self.size = self.stat.size;
    }

    if ('string' === typeof input) {
        self.path = input;
    } else {
        Object.keys(input).forEach(function (k) {
            self[k] = input[k];
        });
    }

    self.name = self.name// || path.basename(self.path||'');
    if (!self.name) {
        throw new Error("No name");
    }
    self.type = self.type// || mime.lookup(self.name);

    if (!self.path) {
        if (self.buffer) {
            self.size = self.buffer.length;
        } else if (!self.stream) {
            throw new Error('No input, nor stream, nor buffer.');
        }
        return;
    }

    if (!self.jsdom) {
        return;
    }

    // if (!self.async) {
    //     updateStat(fs.statSync(self.path));
    // } else {
    //     fs.stat(self.path, function (err, stat) {
    //         updateStat(stat);
    //     });
    // }
}


function doop(fn, args, context) {
    if ('function' === typeof fn) {
        fn.apply(context, args);
    }
}

function toDataUrl(data, type) {
    // var data = self.result;
    var dataUrl = 'data:';

    if (type) {
        dataUrl += type + ';';
    }

    if (/text/i.test(type)) {
        dataUrl += 'charset=utf-8,';
        dataUrl += data.toString('utf8');
    } else {
        dataUrl += 'base64,';
        dataUrl += data.toString('base64');
    }

    return dataUrl;
}

function mapDataToFormat(file, data, format, encoding) {
    // var data = self.result;

    switch (format) {
    case 'buffer':
        return data;
        break;
    case 'binary':
        return data.toString('binary');
        break;
    case 'dataUrl':
        return toDataUrl(data, file.type);
        break;
    case 'text':
        return data.toString(encoding || 'utf8');
        break;
    }
}

export function FileReader () {
    var self = this,
        emitter = new EventEmitter,
        file;

    self.addEventListener = function(on, callback) {
        emitter.on(on, callback);
    };
    self.removeEventListener = function(callback) {
        emitter.removeListener(callback);
    }
    self.dispatchEvent = function(on) {
        emitter.emit(on);
    }

    self.EMPTY = 0;
    self.LOADING = 1;
    self.DONE = 2;

    self.error = undefined; // Read only
    self.readyState = self.EMPTY; // Read only
    self.result = undefined; // Road only

    // non-standard
    self.on = function() {
        emitter.on.apply(emitter, arguments);
    }
    self.nodeChunkedEncoding = false;
    self.setNodeChunkedEncoding = function(val) {
        self.nodeChunkedEncoding = val;
    };
    // end non-standard



    // Whatever the file object is, turn it into a Node.JS File.Stream
    function createFileStream() {
        var stream = new EventEmitter(),
            chunked = self.nodeChunkedEncoding;

        // attempt to make the length computable
        // if (!file.size && chunked && file.path) {
        //     fs.stat(file.path, function(err, stat) {
        //         file.size = stat.size;
        //         file.lastModifiedDate = stat.mtime;
        //     });
        // }


        // The stream exists, do nothing more
        if (file.stream) {
            return;
        }


        // Create a read stream from a buffer
        if (file.buffer) {
            process.nextTick(function() {
                stream.emit('data', file.buffer);
                stream.emit('end');
            });
            file.stream = stream;
            return;
        }


        // Create a read stream from a file
        // if (file.path) {
        //     // TODO url
        //     if (!chunked) {
        //         fs.readFile(file.path, function(err, data) {
        //             if (err) {
        //                 stream.emit('error', err);
        //             }
        //             if (data) {
        //                 stream.emit('data', data);
        //                 stream.emit('end');
        //             }
        //         });

        //         file.stream = stream;
        //         return;
        //     }

        //     // TODO don't duplicate this code here,
        //     // expose a method in File instead
        //     file.stream = fs.createReadStream(file.path);
        // }
    }



    // before any other listeners are added
    emitter.on('abort', function() {
        self.readyState = self.DONE;
    });



    // Map `error`, `progress`, `load`, and `loadend`
    function mapStreamToEmitter(format, encoding) {
        var stream = file.stream,
            buffers = [],
            chunked = self.nodeChunkedEncoding;

        buffers.dataLength = 0;

        stream.on('error', function(err) {
            if (self.DONE === self.readyState) {
                return;
            }

            self.readyState = self.DONE;
            self.error = err;
            emitter.emit('error', err);
        });

        stream.on('data', function(data) {
            if (self.DONE === self.readyState) {
                return;
            }

            buffers.dataLength += data.length;
            buffers.push(data);

            emitter.emit('progress', {
                // fs.stat will probably complete before this
                // but possibly it will not, hence the check
                lengthComputable: (!isNaN(file.size)) ? true : false,
                loaded: buffers.dataLength,
                total: file.size
            });

            emitter.emit('data', data);
        });

        stream.on('end', function() {
            if (self.DONE === self.readyState) {
                return;
            }

            var data;

            if (buffers.length > 1) {
                data = Buffer.concat(buffers);
            } else {
                data = buffers[0];
            }

            self.readyState = self.DONE;
            self.result = mapDataToFormat(file, data, format, encoding);
            emitter.emit('load', {
                target: {
                    // non-standard
                    nodeBufferResult: data,
                    result: self.result
                }
            });

            emitter.emit('loadend');
        });
    }


    // Abort is overwritten by readAsXyz
    self.abort = function() {
        if (self.readState == self.DONE) {
            return;
        }
        self.readyState = self.DONE;
        emitter.emit('abort');
    };



    //
    function mapUserEvents() {
        emitter.on('start', function() {
            doop(self.onloadstart, arguments);
        });
        emitter.on('progress', function() {
            doop(self.onprogress, arguments);
        });
        emitter.on('error', function(err) {
            // TODO translate to FileError
            if (self.onerror) {
                self.onerror(err);
            } else {
                if (!emitter.listeners.error || !emitter.listeners.error.length) {
                    throw err;
                }
            }
        });
        emitter.on('load', function() {
            doop(self.onload, arguments);
        });
        emitter.on('end', function() {
            doop(self.onloadend, arguments);
        });
        emitter.on('abort', function() {
            doop(self.onabort, arguments);
        });
    }



    function readFile(_file, format, encoding) {
        file = _file;
        if (!file || !file.name || !(file.path || file.stream || file.buffer)) {
            throw new Error("cannot read as File: " + JSON.stringify(file));
        }
        if (0 !== self.readyState) {
            console.log("already loading, request to change format ignored");
            return;
        }

        // 'process.nextTick' does not ensure order, (i.e. an fs.stat queued later may return faster)
        // but `onloadstart` must come before the first `data` event and must be asynchronous.
        // Hence we waste a single tick waiting
        process.nextTick(function() {
            self.readyState = self.LOADING;
            emitter.emit('loadstart');
            createFileStream();
            mapStreamToEmitter(format, encoding);
            mapUserEvents();
        });
    }

    self.readAsArrayBuffer = function(file) {
        readFile(file, 'buffer');
    };
    self.readAsBinaryString = function(file) {
        readFile(file, 'binary');
    };
    self.readAsDataURL = function(file) {
        readFile(file, 'dataUrl');
    };
    self.readAsText = function(file, encoding) {
        readFile(file, 'text', encoding);
    };
}
