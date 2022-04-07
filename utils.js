const {ungzip} = require('node-gzip');

if (! String.prototype.replaceAll) {
    String.prototype.replaceAll = function(a, b) {
        return this.split(a).join(b);
    }
}

module.exports = {
    consumeBody: function(res) {
        return new Promise(function(resolve, reject) {
            var body = Buffer.from('');
            res.on('data', (chunk) => {
                if (chunk) {
                    body = Buffer.concat([body, chunk])
                }
            })
            res.on('end', async function() {
                if (res.headers['content-encoding'] && res.headers['content-encoding'] === 'gzip') {
                    try {
                        body = await ungzip(body);
                    } catch(e){}
                }
                resolve(body)
            })
        })
    },
    transformArgs: function(url) {
        var args = {};
        var idx = url.indexOf('?');
        if (idx != -1) {
            var s = url.slice(idx+1);
            var parts = s.split('&');
            for (var i=0; i<parts.length; i++) {
                var p = parts[i];
                var idx2 = p.indexOf('=');
                try {
                    args[decodeURIComponent(p.slice(0,idx2))] = decodeURIComponent(p.slice(idx2+1,s.length));
                } catch(e) {}
            }
        }
        return args;
    },
    removeArg: function(url, argName) {
        if (! url.split('?').pop().includes(argName+'=')) {
            return url;
        }
        var a = url.split(argName).pop().split('&')[0];
        return url.replace(argName+a, '')
    },
    check4Redirects: function(url) {
        return new Promise(function(resolve, reject) {
            var protReq = url.startsWith('https:') ? https : http;
            protReq.get(url, function(res) {
                try {
                    var {statusCode} = res;
                    if ([301, 302, 307].includes(statusCode) &&
                        res.headers['location'] &&
                        (new URL(res.headers['location'])).pathname === '/') {
                        res.resume();
                        resolve(res.headers['location']);
                    } else {
                        res.resume();
                        resolve(false);
                    }
                } catch(e) {
                    res.resume();
                    resolve(false);
                }
            }).on('error', reject);
        })
    },
    getConcurentFiles: function(currentFile, files, magnet) {
        var paths = [];
        for (var i=0; i<files.length; i++) {
            paths.push(files[i].path);
        }
        var result = [];
        var level = {result};
        paths.forEach(path => {
            path.split('/').reduce((r, name, i, a) => {
                if(!r[name]) {
                    r[name] = {result: []};
                    r.result.push({name, children: r[name].result, fullPath:path})
                }
                return r[name];
            }, level)
        })
        function processFiles(a) {
            a = a.sort(function(a, b) {
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            });
            for (var i=0; i<a.length; i++) {
                if (a[i].children.length > 0) {
                    var b = processFiles(a[i].children);
                    if (b) {
                        return b;
                    }
                } else if (a[i].fullPath === currentFile) {
                    var out = [];
                    if (a[i+1]) {
                        out[1] = '/torrentStream?fileName='+encodeURIComponent(a[i+1].fullPath)+'&stage=step2&stream=on&fetchFile=no&magnet='+magnet;
                    } else {
                        out[1] = null;
                    }
                    if (a[i-1]) {
                        out[0] = '/torrentStream?fileName='+encodeURIComponent(a[i-1].fullPath)+'&stage=step2&stream=on&fetchFile=no&magnet='+magnet;
                    } else {
                        out[0] = null;
                    }
                    return out;
                }
            }
        }
        return processFiles(result)
    },
    generateTorrentTree: function(files, magnet) {
        var paths = [];
        for (var i=0; i<files.length; i++) {
            paths.push(files[i].path);
        }
        var result = [];
        var level = {result};
        paths.forEach(path => {
            path.split('/').reduce((r, name, i, a) => {
                if(!r[name]) {
                    r[name] = {result: []};
                    r.result.push({name, children: r[name].result, fullPath:path})
                }
                return r[name];
            }, level)
        })
        var out = '<style>ul,#myUL{list-style-type:none}#myUL{margin:0;padding:0}.caret{cursor:pointer;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}.caret::before{content:"\\25B6";color:#000;display:inline-block;margin-right:6px}.caret-down::before{-ms-transform:rotate(90deg);-webkit-transform:rotate(90deg);transform:rotate(90deg)}.nested{display:none}.active{display:block}</style><ul id="myUL">';
        function processFiles(a) {
            a = a.sort(function(a, b) {
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            });
            for (var i=0; i<a.length; i++) {
                if (a[i].children.length > 0) {
                    out += '<li><span class="caret">'+a[i].name+'</span><ul class="nested">';
                    processFiles(a[i].children);
                    out += '</ul></li>'
                } else {
                    var downloadUrl = '/torrentStream?fileName='+encodeURIComponent(a[i].fullPath)+'&stage=step2&stream=on&fetchFile=no&magnet='+magnet;
                    var downloadUrl2 = '/torrentStream?fileName='+encodeURIComponent(a[i].fullPath)+'&stage=step2&magnet='+magnet;
                    out += '<li><a style="text-decoration:none" href="'+downloadUrl+'">'+a[i].name+'</a> - <a style="text-decoration:none" href="'+downloadUrl2+'">download</a></li>';
                }
            }
        }
        processFiles(result);
        out += '</ul><script>for(var toggler=document.getElementsByClassName("caret"),i=0;i<toggler.length;i++)toggler[i].addEventListener("click",function(){this.parentElement.querySelector(".nested").classList.toggle("active"),this.classList.toggle("caret-down")});</script>';
        return out;
    },
    bodyBuffer: function(body) {
        return Buffer.concat([Buffer.from(new Uint8Array([0xEF,0xBB,0xBF])), Buffer.from(body)]);
    },
    isNotGoodSite: function(url) {
        if (url.includes('porn') || url.includes('xvideos') || url.includes('sex')) {
            return true;
        }
        return false;
    }
}
