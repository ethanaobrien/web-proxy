
const https = require('https');
const http = require('http');
const {ungzip} = require('node-gzip');
const torrentStream = require('torrent-stream');
const JSZip = require("jszip");
const {MIMETYPES} = require("./mime.js");

let port = 3000;
const sites = [ //no '/' at end
    'http://mikudb.moe',
    'https://nyaa.si',
    'https://downloads.khinsider.com',
    'https://www.google.com',
    'https://love-live.fandom.com',
    'https://www.youtube.com', //broken, to fix
    'https://schoolido.lu',
    'https://github.com',
    'https://emulatorjs.ga',
    'https://myemulator.online',
    'https://hack64.net',
    'https://www.roblox.com',
    'https://www.instagram.com' //broken, to fix
]

if (! String.prototype.replaceAll) {
    String.prototype.replaceAll = function(a, b) {
        return this.split(a).join(b);
    }
}

function fetch(method, url, headers, body, site2Proxy) {
    return new Promise(function(resolve, reject) {
        var newHeaders = {};
        var {hostname} = new URL(url);
        if (headers) {
            for (var k in headers) {
                if (k.startsWith('x-replit') || k === 'accept-encoding') {
                    continue;
                }
                if (k === 'cookie') {
                    var cookies = [];
                    var ck = headers[k].split(';');
                    for (var i=0; i<ck.length; i++) {
                        if (ck[i].trim().split('_')[0].trim() === hostname || (site2Proxy === 'https://www.instagram.com' && url.includes('instagram.com') && ck[i].trim().split('_')[0].trim().includes('www.instagram.com')) && !ck[i].includes('proxySite')) {
                            cookies.push(ck[i].trim().split(ck[i].trim().split('_')[0].trim()+'_').pop());
                        }
                    }
                    var cookie = '';
                    for (var i=0; i<cookies.length; i++) {
                        cookie += (cookies[i] + '; ');
                    }
                    cookie.substring(0, cookie.length-2);
                    newHeaders[k] = cookie;
                    continue
                }
                if (headers[k].includes('repl.co')) {
                    headers[k] = headers[k].replaceAll(headers[k].split('https://').pop().split('/')[0], site2Proxy.split('://').pop())
                }
                newHeaders[k] = headers[k];
            }
        }
        newHeaders['host'] = hostname;
        var protReq = url.startsWith('https:') ? https : http;
        var req = protReq.request(url, {method: method});
        for (var k in newHeaders) {
            req.setHeader(k, newHeaders[k]);
        }
        if (body && body.byteLength !== 0) {
            req.setHeader('content-length', body.byteLength);
        }
        req.on('response', function(res) {
            if (!res.headers['content-type'] ||
                !(res.headers['content-type'] &&
                 (res.headers['content-type'].includes('javascript') ||
                  res.headers['content-type'].includes('html') ||
                  res.headers['content-type'].includes('json') ||
                  res.headers['content-type'].includes('x-www-form-urlencoded')))) {
                resolve([false, res, res.headers['content-type'], res.headers, res.statusCode])
                return;
            }
            var body = Buffer.from('')
            res.on('data', (chunk) => {
                if (chunk) {
                    body = Buffer.concat([body, chunk])
                }
            })
            res.on('end', async function() {
                if (res.headers['content-encoding'] && res.headers['content-encoding'] === 'gzip') {
                    body = await ungzip(body);
                }
                body = body.toString();
                resolve([true, body, res.headers['content-type'], res.headers, res.statusCode])
            })
        })
        req.on('error', function(e) {
            reject(e);
        })
        req.write(body)
        req.end()
    })
}

function parseTextFile(body, isHtml, isUrlEncoded, site2Proxy, url, reqHost) {
    var {hostname} = new URL(site2Proxy);
    body = body.replaceAll(site2Proxy+'/', '/').replaceAll(site2Proxy, '').replaceAll(site2Proxy.replaceAll('\\/', '/')+'/', '/').replaceAll(site2Proxy.replaceAll('\\/', '/'), '').replaceAll(hostname, reqHost).replaceAll('discord', 'discordddd');
    if (isHtml) {
        body = body.replaceAll('integrity=', 'sadfghj=').replaceAll('magnet:?', '/torrentStream?stage=step1&magnet=');
        var a = body.split('src');
        for (var i=1; i<a.length; i++) {
            if (a[i].replaceAll(' ', '').replaceAll('"', '').replaceAll("'", '').startsWith('=//')) {
                a[i] = a[i].replace('//', 'https://');
            }
        }
        body = a.join('src');
        var a = body.split('http');
        for (var i=1; i<a.length; i++) {
            if ((a[i].startsWith('://') || a[i].startsWith('s://')) &&
                !(a[i-1].endsWith('>')) &&
                !(a[i-1].replaceAll('"', '').replaceAll("'", '').replaceAll(' ', '').endsWith('href='))) {
                a[i-1] += '/';
            }
        }
        return a.join('http');
    } else if (isUrlEncoded) {
        var {hostname} = new URL(url);
        var h = hostname;
        var {hostname} = new URL(site2Proxy);
        var a = body.split('&')
        for (var i=0; i<a.length; i++) {
            var b = a[i].split('=');
            for (var j=0; j<b.length; j++) {
                b[j] = encodeURIComponent(decodeURIComponent(b[j]).replaceAll(hostname, h));
            }
            a[i] = b.join('=');
        }
        body = a.join('&');
        return body;
    } else {
        return body.replaceAll('http://', '/http://').replaceAll('https://', '/https://'); //.replaceAll('http:\\/\\/', '/http:\\/\\/').replaceAll('https:\\/\\/', '/https:\\/\\/');
    }
}

function transformArgs(url) {
    var args = {}
    var idx = url.indexOf('?')
    if (idx != -1) {
        var s = url.slice(idx+1)
        var parts = s.split('&')
        for (var i=0; i<parts.length; i++) {
            var p = parts[i]
            var idx2 = p.indexOf('=')
            args[decodeURIComponent(p.slice(0,idx2))] = decodeURIComponent(p.slice(idx2+1,s.length))
        }
    }
    return args
}

function torrent(req, res) {
    res.writeContinue();
    var stage = req.url.split('stage=').pop().split('&')[0];
    var magnet = req.url.split('magnet=').pop();
    var engine = torrentStream('magnet:?'+magnet);
    var ready = setTimeout(function() {
        engine.destroy();
        res.end('timeout getting torrent metedata');
    }, 25000);
    engine.on('ready', function() {
        clearTimeout(ready);
        var files = engine.files;
        var torrentName = engine.torrent.name;
        if (stage === 'step1') {
            var html = '<html><head></head><body><br><ul><h1>Download</h1><br><ul>';
            for (var i=0; i<files.length; i++) {
                var downloadUrl = '/torrentStream?fileName='+encodeURIComponent(files[i].path)+'&stage=step2&magnet='+magnet;
                var downloadUrl3 = '/torrentStream?fileName='+encodeURIComponent(files[i].path)+'&stage=step2&stream=on&magnet='+magnet;
                html += '<li><a style="text-decoration:none" href="'+downloadUrl+'">'+files[i].path+'</a> - <a style="text-decoration:none" href="'+downloadUrl3+'">stream</a></li>';
            }
            var downloadUrl2 = '/torrentStream?stage=dlAsZip&magnet='+magnet;
            html += '</ul><br><a style="text-decoration:none" href="'+downloadUrl2+'">Download All As Zip</a></ul><br></body></html>';
            engine.destroy();
            res.setHeader('content-type', 'text/html; chartset=utf-8')
            res.writeHead(200);
            res.end(Buffer.concat([Buffer.from(new Uint8Array([0xEF,0xBB,0xBF])), Buffer.from(html)]));
        } else if (stage === 'step2') {
            var fileName = decodeURIComponent(req.url.split('fileName=').pop().split('&')[0]);
            var file;
            for (var i=0; i<files.length; i++) {
                if (files[i].path === fileName) {
                    file = files[i];
                    break;
                }
            }
            if (! file) {
                res.writeHead(500);
                res.end('error finding file');
                engine.destroy();
                return;
            }
            res.setHeader('content-length', file.length);
            if (req.url.includes('stream=') && req.url.split('stream=').pop().split('&')[0] === 'on' && MIMETYPES[file.name.split('.').pop()]) {
                var fileOffset, fileEndOffset;
                res.setHeader('accept-ranges','bytes');
                res.setHeader('content-type', MIMETYPES[file.name.split('.').pop()]);
                if (req.headers['range']) {
                    if (! rparts[1]) {
                        fileOffset = parseInt(rparts[0]);
                        var fileEndOffset = file.length - 1;
                        res.setHeader('content-length', file.length-fileOffset);
                        res.setHeader('content-range','bytes '+fileOffset+'-'+(file.length-1)+'/'+file.length);
                        if (fileOffset == 0) {
                            res.writeHead(200);
                        } else {
                            res.writeHead(206);
                        }
                        var stream = file.createReadStream({start: fileOffset,end: file.length-1});
                        stream.pipe(res);
                        stream.on('finish', function() {
                            engine.destroy();
                        })
                    } else {
                        fileOffset = parseInt(rparts[0]);
                        fileEndOffset = parseInt(rparts[1])
                        res.setHeader('content-length', fileEndOffset - fileOffset + 1);
                        res.setHeader('content-range','bytes '+fileOffset+'-'+(fileEndOffset)+'/'+file.length)
                        res.writeHead(206);
                        var stream = file.createReadStream({start: fileOffset,end: fileEndOffset});
                        stream.pipe(res);
                        stream.on('finish', function() {
                            engine.destroy();
                        })
                    }
                } else {
                    fileOffset = 0;
                    fileEndOffset = file.length - 1;
                    res.writeHead(200);
                    var stream = file.createReadStream({start: fileOffset,end: fileEndOffset});
                    stream.pipe(res);
                    stream.on('finish', function() {
                        engine.destroy();
                    })
                }
            } else {
                res.setHeader('Content-Disposition', 'attachment; filename="'+encodeURIComponent(fileName)+'"');
                res.writeHead(200);
                var stream = file.createReadStream();
                stream.pipe(res);
                stream.on('finish', function() {
                    engine.destroy();
                })
            }
        } else if (stage === 'dlAsZip') {
            var zip = new JSZip();
            for (var i=0; i<files.length; i++) {
                zip.file(files[i].path, files[i].createReadStream())
            }
            res.setHeader('Content-Disposition', 'attachment; filename="'+encodeURIComponent(torrentName+'.zip')+'"');
            res.writeHead(200);
            var stream = zip.generateNodeStream({streamFiles:true});
            stream.pipe(res);
            stream.on('finish', function() {
                engine.destroy();
            })
        } else {
            res.end('invalid request');
            engine.destroy();
        }
    })
}

function removeArg(url, argName) {
    if (! url.split('?').pop().includes(argName)) {
        return url;
    }
    var a = url.split(argName).pop().split('&')[0];
    return url.replace(argName+a, '')
}

function changeHtml(req, res) {
    if (req.url.includes('?')) {
        var args = transformArgs(req.url);
        if (args.site || args.custom) {
            var error = false;
            var path2Redir2 = '/';
            if (args.custom) {
                try {
                    var a = new URL(args.custom);
                    path2Redir2 = a.pathname+a.search;
                    var newURL = new URL('/', args.custom);
                    newURL = newURL.toString();
                    if (newURL.endsWith('/')) {
                        newURL = newURL.substring(0, newURL.length-1);
                    }
                    args.custom = newURL;
                } catch(e) {
                    error = true;
                }
            }
            if (!error) {
                res.setHeader('set-cookie', 'proxySite='+(args.site ? args.site : encodeURIComponent(args.custom)));
                res.setHeader('location', path2Redir2 || '/');
                res.writeHead(307);
                res.end();
                return;
            }
        }
    }
    res.setHeader('content-type', 'text/html; chartset=utf-8')
    var html = '';
    html += '<ul><br><h1>Change Site to Serve</h1><br><br><ul><form action="" method="GET">';
    for (var i=0; i<sites.length; i++) {
        html += '<input type="radio" id="'+encodeURIComponent(sites[i])+'" name="site" value="'+encodeURIComponent(sites[i])+'"><label for="'+encodeURIComponent(sites[i])+'">'+sites[i]+'</label><br>';
    }
    html += '<br><label for="custom">Custom URL</label><input type="text" id="custom" name="custom"><br><br><input type="submit" value="Submit"><ul></ul>'
    res.end(html)
}

var server = http.createServer(async function(req, res) {
    var host = req.headers.host;
    if (req.url.split('?')[0] === '/torrentStream') {
        torrent(req, res);
        return
    }
    if (req.url.split('?')[0] === '/changeSiteToServe') {
        changeHtml(req, res);
        return;
    }
    var site2Proxy;
    if (req.headers.cookie && req.headers.cookie.includes('proxySite=')) {
        site2Proxy = decodeURIComponent(req.headers.cookie.split('proxySite=').pop().split(';')[0]);
    }
    //console.log(site2Proxy);
    if (! site2Proxy) {
        res.setHeader('location', '/changeSiteToServe');
        res.writeHead(307);
        res.end();
        return;
    }
    var url = req.url.startsWith('/http') ? req.url.substring(1) : site2Proxy+req.url;
    if (req.url.startsWith('/https') && req.url.startsWith('/https:/') && !req.url.startsWith('/https://')) {
        url = req.url.substring(1).replace('https:/', 'https://')
    }
    if (req.url.startsWith('/http') && req.url.startsWith('/http:/') && !req.url.startsWith('/http://')) {
        url = req.url.substring(1).replace('http:/', 'http://')
    }
    var args = transformArgs(req.url);
    if (args.vc) {
        url = removeArg(url, 'vc');
    }
    if (args.video) {
        url = removeArg(url, 'video');
    }
    var vc = args.vc;
    var reqBody = await new Promise(function(resolve, reject) {
        var body = Buffer.from('')
        req.on('data', (chunk) => {
            if (chunk) {
                body = Buffer.concat([body, chunk])
            }
        })
        req.on('end', function() {
            resolve(body);
        })
    })
    if (req.headers['content-type'] && req.headers['content-type'].includes('x-www-form-urlencoded')) {
        reqBody = Buffer.from(parseTextFile(reqBody.toString(), false, true, site2Proxy, url, host));
    }
    try {
        var body = await fetch(req.method, url, req.headers, reqBody, site2Proxy);
    } catch(e) {
        res.writeHead(404);
        res.end('error');
        return;
    }
    if (!body[4].toString().startsWith('2') && ! body[4].toString().startsWith('3') && false) {
        console.log('\n')
        console.log(url)
        console.log(body[4], body[2], req.method, req.headers['content-type'])
    }
    for (var k in body[3]) {
        if (['content-security-policy'].includes(k) || (k === 'content-length' && body[0] === true)) {
            continue
        }
        if (k === 'content-encoding') {
            continue
        }
        if (k === 'set-cookie') {
            var {hostname} = new URL(url);
            if (Array.isArray(body[3][k])) {
                var cookies = []; //httpOnly cookies seem to break
                for (var i=0; i<body[3][k].length; i++) {
                    if (body[3][k][i].includes('Domain=')) {
                        body[3][k][i] = body[3][k][i].replaceAll('Domain='+body[3][k][i].split('Domain=').pop().split(';')[0]+';', '').replaceAll('  ', ' ');
                    }
                    if (body[3][k][i].includes('domain=')) {
                        body[3][k][i] = body[3][k][i].replaceAll('domain='+body[3][k][i].split('domain=').pop().split(';')[0]+';', '').replaceAll('  ', ' ');
                    }
                    cookies.push(hostname+'_'+body[3][k][i])
                }
                res.setHeader(k, cookies);
            } else {
                if (body[3][k].includes('Domain=')) {
                    body[3][k] = body[3][k].replaceAll('Domain='+body[3][k].split('Domain=').pop().split(';')[0]+';', '').replaceAll('  ', ' ');
                }
                if (body[3][k].includes('domain=')) {
                    body[3][k] = body[3][k].replaceAll('domain='+body[3][k].split('domain=').pop().split(';')[0]+';', '').replaceAll('  ', ' ');
                }
                res.setHeader(k, hostname+'_'+body[3][k]);
            }
            continue;
        }
        if (typeof body[3][k] == 'string') {
            res.setHeader(k, body[3][k].replaceAll(site2Proxy+'/', '/').replaceAll(site2Proxy, '').replaceAll('http', '/http'));
        } else {
            res.setHeader(k, body[3][k]);
        }
    }
    if (vc == 'true' || vc == '1') {
        res.setHeader('content-type', 'text/plain')
    }
    if (body[0] === true) {
        var code = body[4];
        //javascript/html parsing
        body = parseTextFile(body[1], body[2].includes('html'), body[2].includes('x-www-form-urlencoded'), site2Proxy, url, host);
        if (args.video && ['1', 'true'].includes(args.video) && body.includes('View High Qual')) {
            var videoUrl = ('/'+body.split('">View High Qual')[0].split('href="').pop());
            res.setHeader('location', videoUrl);
            res.writeHead(307);
            res.end();
            return;
        }
        res.writeHead(code || 200);
        res.end(body);
    } else {
        res.writeHead(body[4] || 200);
        body[1].pipe(res);
    }
})
server.on('clientError', function (err, socket) {
    if (err.code === 'ECONNRESET' || !socket.writable) {
        return;
    }
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
server.on('listening', function() {
    console.log('listening on port '+(process.env.PORT || port || 3000));
})
function tryListen() {
    console.log('trying to listen on port '+(process.env.PORT || port || 3000));
    server.listen(process.env.PORT || port || 3000);
}
server.on('error', function(e) {
    if (e.code === 'EADDRINUSE') {
        console.log('failed to listen on port '+(process.env.PORT || port || 3000));
        port++;
        tryListen();
    }
})
tryListen(port);
