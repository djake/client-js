(function() {
    var smart  = require("../client/entry");
    var jquery = require("jquery");

    // Patch jQuery AJAX mechanism to receive blob objects via XMLHttpRequest 2. Based on:
    //    https://gist.github.com/aaronk6/bff7cc600d863d31a7bf
    //    http://www.artandlogic.com/blog/2013/11/jquery-ajax-blobs-and-array-buffers/

    /**
     * Register ajax transports for blob send/receive and array buffer send/receive via XMLHttpRequest Level 2
     * within the comfortable framework of the jquery ajax request, with full support for promises.
     *
     * Notice the +* in the dataType string? The + indicates we want this transport to be prepended to the list
     * of potential transports (so it gets first dibs if the request passes the conditions within to provide the
     * ajax transport, preventing the standard transport from hogging the request), and the * indicates that
     * potentially any request with any dataType might want to use the transports provided herein.
     *
     * Remember to specify 'processData:false' in the ajax options when attempting to send a blob or arraybuffer -
     * otherwise jquery will try (and fail) to convert the blob or buffer into a query string.
     */
    jquery.ajaxTransport("+*", function(options, originalOptions, jqXHR){
        // Test for the conditions that mean we can/want to send/receive blobs or arraybuffers - we need XMLHttpRequest
        // level 2 (so feature-detect against window.FormData), feature detect against window.Blob or window.ArrayBuffer,
        // and then check to see if the dataType is blob/arraybuffer or the data itself is a Blob/ArrayBuffer
        if (window.FormData && ((options.dataType && (options.dataType === "blob" || options.dataType === "arraybuffer")) ||
            (options.data && ((window.Blob && options.data instanceof window.Blob) ||
                (window.ArrayBuffer && options.data instanceof window.ArrayBuffer)))
        ))
        {
            return {
                /**
                 * Return a transport capable of sending and/or receiving blobs - in this case, we instantiate
                 * a new XMLHttpRequest and use it to actually perform the request, and funnel the result back
                 * into the jquery complete callback (such as the success function, done blocks, etc.)
                 *
                 * @param headers
                 * @param completeCallback
                 */
                send: function(headers, completeCallback){
                    var xhr = new window.XMLHttpRequest(),
                        url = options.url || window.location.href,
                        type = options.type || "GET",
                        dataType = options.dataType || "text",
                        data = options.data || null,
                        async = options.async || true,
                        key;

                    xhr.addEventListener("load", function(){
                        var response = {}, isSuccess;

                        isSuccess = xhr.status >= 200 && xhr.status < 300 || xhr.status === 304;

                        if (isSuccess) {
                            response[dataType] = xhr.response;
                        } else {
                            // In case an error occurred we assume that the response body contains
                            // text data - so let's convert the binary data to a string which we can
                            // pass to the complete callback.
                            response.text = String.fromCharCode.apply(null, new Uint8Array(xhr.response));
                        }

                        completeCallback(xhr.status, xhr.statusText, response, xhr.getAllResponseHeaders());
                    });

                    xhr.open(type, url, async);
                    xhr.responseType = dataType;

                    for (key in headers) {
                        if (headers.hasOwnProperty(key)) xhr.setRequestHeader(key, headers[key]);
                    }
                    xhr.send(data);
                },
                abort: function(){
                    jqXHR.abort();
                }
            };
        }
    });

    var defer = function(){
        var pr = jquery.Deferred();
        pr.promise = pr.promise();
        return pr;
    };
    var adapter = {
        defer: defer,
        http: function(args) {
            var ret = jquery.Deferred();
            var opts = {
                type: args.method,
                url: args.url,
                dataType: args.dataType || "json",
                headers: args.headers || {},
                data: args.data,

                // Filters weird cases where the servers replies with json
                // content-type header but has no response body (for example
                // "201 Created" after creating a resource).
                dataFilter: function(data, dataType) {
                    if (dataType == "json" && data === "") {
                        return "null";
                    }
                    return data;
                }
            };
            jquery.ajax(opts)
                // .done(ret.resolve)
                // .fail(ret.reject);
                .done(
                    function(data, status, xhr) {
                        ret.resolve({
                            data: data,
                            status: status,
                            headers: xhr.getResponseHeader,
                            config: args
                        });
                    }
                )
                .fail(function(err) {
                    ret.reject({
                        error: err,
                        data: err,
                        config: args
                    });
                });
            return ret.promise();
        },
        fhirjs: require("fhir.js/src/fhir.js")
    };

    smart(adapter);

}).call(this);
