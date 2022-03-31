
const https = require('https');
const http = require('http');
const {ungzip} = require('node-gzip');
const torrentStream = require('torrent-stream');
const JSZip = require("jszip");
const {MIMETYPES} = require("./mime.js");
const debug = false;
const isAbsoluteProxy = false;
const absoluteProxySite = 'https://www.instagram.com';

let port = 3000;
const sites = [ //no '/' at end
    //site, isBuggy, display_name
    ['http://mikudb.moe', false, 'mikudb'],
    ['https://nyaa.si', false, 'nyaa.si'],
    ['https://downloads.khinsider.com', false, 'khinsider'],
    ['https://www.google.com', true, 'google'],
    ['https://love-live.fandom.com', false, 'love live fandom'],
    ['https://www.youtube.com', true, 'youtube'],
    ['https://schoolido.lu', false, 'schoolido.lu'],
    ['https://github.com', false, 'github'],
    ['https://emulatorjs.ga', false, 'emulatorjs'],
    ['https://www.instagram.com', true, 'instagram'],
    ['https://www1.thepiratebay3.to', false, 'the pirate bay']
]

if (! String.prototype.replaceAll) {
    String.prototype.replaceAll = function(a, b) {
        return this.split(a).join(b);
    }
}

function fetch(method, url, headers, body, site2Proxy, reqHost) {
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
                        if (isAbsoluteProxy) {
                            if (!ck[i].includes('proxySite')) {
                                cookies.push(ck[i].trim());
                            }
                        } else if (ck[i].trim().split('_')[0].trim() === hostname && !ck[i].includes('proxySite')) {
                            cookies.push(ck[i].trim().split(ck[i].trim().split('_')[0].trim()+'_').pop());
                        }
                    }
                    var cookie = '';
                    cookie = cookies.join('; ');
                    newHeaders[k] = cookie;
                    continue
                }
                if (headers[k].includes(reqHost)) {
                    headers[k] = headers[k].replaceAll(headers[k].split('https://').pop().split('/')[0], site2Proxy.split('://').pop())
                }
                newHeaders[k] = headers[k];
            }
        }
        newHeaders['host'] = hostname;
        //console.log(url)
        //console.log(newHeaders)
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
                    try {
                        body = await ungzip(body);
                    } catch(e){}
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
    var date = new Date();
    var origBody = body;
    var {hostname} = new URL(site2Proxy);
    body = body
        .replaceAll('"'+site2Proxy+'/', '"/')
        .replaceAll("'"+site2Proxy+'/', '\'/')
        .replaceAll("'"+site2Proxy, '\'')
        .replaceAll('"'+site2Proxy, '"')
        .replaceAll("'"+site2Proxy.replaceAll('\\/', '/')+'/', '\'/')
        .replaceAll('"'+site2Proxy.replaceAll('\\/', '/')+'/', '"/')
        .replaceAll("'"+site2Proxy.replaceAll('\\/', '/'), '\'')
        .replaceAll('"'+site2Proxy.replaceAll('\\/', '/'), '"')
        .replaceAll("'"+hostname, "'"+reqHost)
        .replaceAll('"'+hostname, '"'+reqHost)
        .replaceAll('discord', 'discordddd')
        .replaceAll('wss://', 'wss://'+reqHost+'/')
    if (isHtml) {
        body = body.replaceAll('integrity=', 'sadfghj=').replaceAll('magnet:?', '/torrentStream?stage=step1&magnet=');
        var a = body.split('src');
        for (var i=1; i<a.length; i++) {
            if (a[i].replaceAll(' ', '').replaceAll('"', '').replaceAll("'", '').startsWith('=//')) {
                a[i] = a[i].replace('//', 'https://');
            }
        }
        body = a.join('src');
        var a = body.split('//');
        for (var i=1; i<a.length; i++) {
            if ((a[i-1].endsWith('"') || a[i-1].endsWith("'")) &&
                (a[i].split('\n')[0].includes('"') || a[i].split('\n')[0].includes("'"))) {
                a[i-1]+='https:';
            }
        }
        body = a.join('//');
        var a = body.split('http');
        for (var i=1; i<a.length; i++) {
            if ((a[i].startsWith('://') ||
                 a[i].startsWith('s://') ||
                 ((a[i].startsWith(':\\/\\/') ||
                   a[i].startsWith('s:\\/\\/')) &&
                  !a[i-1].endsWith('/'))) &&
                !(a[i-1].endsWith('>')) &&
                !(a[i-1].replaceAll('"', '').replaceAll("'", '').replaceAll(' ', '').endsWith('href='))) {
                a[i-1] += '/';
            }
        }
        body = a.join('http');
        var a = body.split('href');
        for (var i=1; i<a.length; i++) {
            if (a[i-1].split('<').pop().split(' ')[0] === 'a') {
                continue;
            }
            if (a[i].replaceAll('=', '').replaceAll('"', '').replaceAll("'", '').startsWith('//')) {
                a[i] = a[i].replace('//', 'https://');
            }
            if (a[i].replaceAll('=', '').replaceAll('"', '').replaceAll("'", '').startsWith('http')) {
                a[i] = a[i].replace('http', '/http');
            }
        }
        body = a.join('href');
        if (debug) {
            console.log('html parsing took '+(((new Date())-date)/1000)+' seconds');
        }
        return body.replaceAll('/https://', '/https:/').replaceAll('/http://', '/https:/');
    } else if (isUrlEncoded) {
        var {hostname} = new URL(url);
        var h = hostname;
        var {hostname} = new URL(site2Proxy);
        var a = body.split('&')
        var changed = false;
        for (var i=0; i<a.length; i++) {
            var b = a[i].split('=');
            for (var j=0; j<b.length; j++) {
                var c = b[j].split('+');
                for (var k=0; k<c.length; k++) {
                    c[k] = encodeURIComponent(decodeURIComponent(c[k]).replaceAll(hostname, h));
                    if (decodeURIComponent(c[k]).includes(h)) {
                        changed = true;
                    }
                }
                b[j] = c.join('+');
            }
            a[i] = b.join('=');
        }
        if (!changed) {
            return origBody;
        }
        body = a.join('&');
        if (debug) {
            console.log('url encoded parsing took '+(((new Date())-date)/1000)+' seconds');
        }
        return body;
    } else {
        var a = body.split('//');
        for (var i=1; i<a.length; i++) {
            if ((a[i-1].endsWith('"') || a[i-1].endsWith("'")) &&
                (a[i].split('\n')[0].includes('"') || a[i].split('\n')[0].includes("'"))) {
                a[i-1]+='https:';
            }
        }
        body = a.join('//');
        body = body.replaceAll('http://', '/http://').replaceAll('https://', '/https://'); //.replaceAll('http:\\/\\/', '/http:\\/\\/').replaceAll('https:\\/\\/', '/https:\\/\\/');
        if (debug) {
            console.log('javascript parsing took '+(((new Date())-date)/1000)+' seconds');
        }
        return body.replaceAll('/https://', '/https:/').replaceAll('/http://', '/https:/');
    }
}

function transformArgs(url) {
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
}

function torrent(req, res) {
    res.writeContinue();
    res.setHeader('Access-Control-Allow-Origin', '*');
    var args = transformArgs(req.url.split('magnet=')[0]);
    var stage = args.stage;
    var magnet = req.url.split('magnet=').pop();
    var engine = torrentStream('magnet:?'+magnet);
    var ready = setTimeout(function() {
        engine.destroy();
        res.end('timeout getting torrent metedata');
    }, 20000);
    engine.on('ready', function () {
        clearTimeout(ready);
        var files = engine.files;
        var torrentName = engine.torrent.name;
        if (stage === 'step1') {
            var html = '<html><head><title>Download</title></head><body><br><ul><h1>Download</h1><br><ul>';
            for (var i=0; i<files.length; i++) {
                var downloadUrl = '/torrentStream?fileName='+encodeURIComponent(files[i].path)+'&stage=step2&magnet='+magnet;
                var downloadUrl3 = '/torrentStream?fileName='+encodeURIComponent(files[i].path)+'&stage=step2&stream=on&fetchFile=no&magnet='+magnet;
                html += '<li><a style="text-decoration:none" href="'+downloadUrl+'">'+files[i].path+'</a> - <a style="text-decoration:none" href="'+downloadUrl3+'">stream</a></li>';
            }
            var downloadUrl2 = '/torrentStream?stage=dlAsZip&magnet='+magnet;
            html += '</ul><br><a style="text-decoration:none" href="'+downloadUrl2+'">Download All As Zip</a></ul><br></body></html>';
            engine.destroy();
            res.setHeader('content-type', 'text/html; chartset=utf-8')
            res.writeHead(200);
            res.end(Buffer.concat([Buffer.from(new Uint8Array([0xEF,0xBB,0xBF])), Buffer.from(html)]));
        } else if (stage === 'step2') {
            var fileName = args.fileName;
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
            var ct = MIMETYPES[file.name.split('.').pop()].split('/')[0];
            if (args.stream === 'on' && args.fetchFile === 'no' && ['audio', 'video', 'image'].includes(ct)) {
                var downloadUrl = '/torrentStream?fileName='+encodeURIComponent(file.path)+'&stage=step2&stream=on&magnet='+magnet;
                var tagName = ['video', 'audio'].includes(ct) ? ct : 'img';
                res.setHeader('content-type', MIMETYPES.html+' chartset=utf-8');
                var html = '<html><head></head><body>';
                html += ('<'+tagName)
                if (['video', 'image'].includes(ct)) {
                    html += ' height="75%"';
                }
                html += ' src="'+downloadUrl+'"></'+tagName+'>';
                html +='</body></html>';
                console.log(html)
                res.end(Buffer.concat([Buffer.from(new Uint8Array([0xEF,0xBB,0xBF])), Buffer.from(html)]));
                return;
            }
            res.setHeader('content-length', file.length);
            res.setHeader('accept-ranges','bytes');
            if (MIMETYPES[file.name.split('.').pop()]) {
                res.setHeader('content-type', MIMETYPES[file.name.split('.').pop().toLowerCase()]);
            }
            var fileOffset, fileEndOffset;
            if ((args.stream && args.stream === 'on') || req.headers['range']) {
                res.setHeader('Content-Disposition', 'inline; filename="'+encodeURIComponent(fileName)+'"');
            } else {
                res.setHeader('Content-Disposition', 'attachment; filename="'+encodeURIComponent(fileName)+'"');
            }
            if (req.headers['range']) {
                console.log('range request')
                var range = req.headers['range'].split('=')[1].trim();
                var rparts = range.split('-');
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
        } else if (stage === 'dlAsZip') {
            var zip = new JSZip();
            for (var i=0; i<files.length; i++) {
                zip.file(files[i].path, files[i].createReadStream())
            }
            res.setHeader('content-type', 'application/zip');
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

function check4Redirects(url) {
    return new Promise(function(resolve, reject) {
        var protReq = url.startsWith('https:') ? https : http;
        protReq.get(url, function(res) {
            var {statusCode} = res;
            if ([301, 302, 307].includes(statusCode) && res.headers['location']) {
                res.resume();
                resolve(res.headers['location']);
            } else {
                res.resume();
                resolve(false);
            }
        }).on('error', reject);
    })
}

async function changeHtml(req, res) {
    if (isAbsoluteProxy) {
        res.end('absolute proxy mode turned on. Turn off to change site to serve.');
        return;
    }
    var errMsg = '';
    if (req.url.includes('?')) {
        var args = transformArgs(req.url);
        if (args.site || args.custom) {
            var error = false;
            var path2Redir2 = '/';
            if (args.custom) {
                try {
                    try {
                        new URL(args.custom);
                    } catch(e) {
                        if (!args.custom.startsWith('http')) {
                            args.custom = 'http://'+args.custom;
                        }
                    }
                    var b;
                    while (b = await check4Redirects(args.custom)) {
                        args.custom = b;
                    }
                    var a = new URL(args.custom);
                    path2Redir2 = a.pathname+a.search;
                    var newURL = new URL('/', args.custom);
                    newURL = newURL.toString();
                    if (newURL.endsWith('/')) {
                        newURL = newURL.substring(0, newURL.length-1);
                    }
                    args.custom = newURL;
                } catch(e) {
                    console.log(e)
                    error = true;
                    errMsg = 'invalid URL';
                }
            }
            if (!error) {
                res.setHeader('set-cookie', 'proxySite='+(args.custom ? args.custom : args.site));
                res.setHeader('location', path2Redir2 || '/');
                res.writeHead(307);
                res.end();
                return;
            }
        }
    }
    res.setHeader('content-type', 'text/html; chartset=utf-8')
    var html = '';
    html += '<html><head><title>Change Site to Serve</title></head><body><ul><br><h1>Change Site to Serve</h1><br><br><ul><form action="" method="GET">';
    for (var i=0; i<sites.length; i++) {
        html += '<input type="radio" id="'+encodeURIComponent(sites[i][0])+'" name="site" value="'+encodeURIComponent(sites[i][0])+'"><label for="'+encodeURIComponent(sites[i][0])+'">'+sites[i][2]+(sites[i][1]?' (buggy)':'')+'</label><br>';
    }
    html += '<br><label for="custom">Custom URL</label><input type="text" id="custom" name="custom"><br><br><input type="submit" value="Submit"><ul></ul>'
    if (errMsg && errMsg.trim()) {
        html += '<br><br><p style="color:red;">Error: '+errMsg+'</p>'
    }
    html += '</body></html>';
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
    if (isAbsoluteProxy) {
        site2Proxy = absoluteProxySite;
    }
    //console.log(site2Proxy);
    if (! site2Proxy) {
        res.setHeader('location', '/changeSiteToServe');
        res.writeHead(307);
        res.end();
        return;
    }
    if (req.url.startsWith('/http') && (req.url.substring(1).startsWith('https://'+req.headers.host) || req.url.substring(1).startsWith('https:/'+req.headers.host) || req.url.substring(1).startsWith('http://'+req.headers.host) || req.url.substring(1).startsWith('http:/'+req.headers.host))) {
        res.setHeader('location', req.url.split('/'+req.headers.host).pop().replaceAll('//', '/'));
        res.writeHead(301);
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
    if (args.nc) {
        url = removeArg(url, 'nc');
    }
    url=url.replaceAll('https%3A%2F%2F%2F', '');
    url=url.replaceAll('https%3A%2F'+req.headers.host, 'https%3A%2F%2F'+req.headers.host);
    var vc = args.vc, nc = args.nc;
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
        var body = await fetch(req.method, url, req.headers, reqBody, site2Proxy, host);
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
                    if (isAbsoluteProxy) {
                        cookies.push(body[3][k][i])
                    } else {
                        cookies.push(hostname+'_'+body[3][k][i])
                    }
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
    if (vc == 'true' || vc == '1' || nc == 'true' || nc == '1') {
        res.setHeader('content-type', 'text/plain')
    }
    if (body[0] === true) {
        var code = body[4];
        var mime = body[2];
        //javascript/html parsing
        if (!nc || (nc != '1' && nc != 'true')) {
            body = parseTextFile(body[1], body[2].includes('html'), body[2].includes('x-www-form-urlencoded'), site2Proxy, url, host);
        } else {
            body = body[1];
        }
        if (isAbsoluteProxy && absoluteProxySite === 'https://www.instagram.com' && mime.includes('javascript') && !url.includes('worker')) {
            body+='\nif (typeof window !== undefined && typeof document !== undefined && !window.checkInterval) {window.checkInterval=setInterval(function(){document.querySelectorAll("svg").forEach(e => {if (e.attributes["aria-label"]&&e.attributes["aria-label"].textContent) {e.innerHTML = e.attributes["aria-label"].textContent}})}, 200)}';
        }
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


function createHttpHeader(line, headers) {
  return Object.keys(headers).reduce(function (head, key) {
    var value = headers[key];

    if (!Array.isArray(value)) {
      head.push(key + ': ' + value);
      return head;
    }

    for (var i = 0; i < value.length; i++) {
      head.push(key + ': ' + value[i]);
    }
    return head;
  }, [line])
  .join('\r\n') + '\r\n\r\n';
}

server.on('upgrade', function(req, socket, head) {
    if (head && head.length) socket.unshift(head);
    socket.setTimeout(0);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 0);
    var newHeaders = {};
    var {hostname,pathname,search} = new URL('wss:/'+req.url);
    var headers = req.headers;
    if (headers) {
        for (var k in headers) {
            if (k.startsWith('x-replit') || k === 'accept-encoding') {
                continue;
            }
            if (k === 'cookie') {
                var cookies = [];
                var ck = headers[k].split(';');
                for (var i=0; i<ck.length; i++) {
                    if (isAbsoluteProxy) {
                        if (!ck[i].includes('proxySite')) {
                            cookies.push(ck[i].trim());
                        }
                    } else if (ck[i].trim().split('_')[0].trim() === hostname && !ck[i].includes('proxySite')) {
                        cookies.push(ck[i].trim().split(ck[i].trim().split('_')[0].trim()+'_').pop());
                    }
                }
                var cookie = '';
                cookie = cookies.join('; ')
                newHeaders[k] = cookie;
                continue;
            }
            if (headers[k].includes(hostname)) {
                headers[k] = headers[k].replaceAll(headers[k].split('https://').pop().split('/')[0], site2Proxy.split('://').pop())
            }
            newHeaders[k] = headers[k];
        }
    }
    newHeaders['host'] = hostname;
    var outgoing = {};
    var origin = '';
    if (req.headers.cookie.includes('proxySite=')) {
        origin = 'https://'+req.headers.cookie.split('proxySite=').pop().split(';')[0];
    }
    if (isAbsoluteProxy) {
        origin = absoluteProxySite;
    }
    newHeaders['origin'] = origin;
    var proxyReq = https.request('https:/'+req.url);
    for (var k in newHeaders) {
        proxyReq.setHeader(k, newHeaders[k]);
    }
    proxyReq.on('response', function(res) {
        if (!res.upgrade) {
            socket.write(createHttpHeader('HTTP/' + res.httpVersion + ' ' + res.statusCode + ' ' + res.statusMessage, res.headers));
            res.pipe(socket);
        }
    })
    proxyReq.on('error', function(e){});
    proxyReq.on('upgrade', function(proxyRes, proxySocket, proxyHead){
        if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
        proxySocket.setTimeout(0);
        proxySocket.setNoDelay(true);
        proxySocket.setKeepAlive(true, 0);
        proxySocket.on('end', function (e) {});
        proxySocket.on('error', function(e) {})
        socket.on('error', function(e) {})
        socket.write(createHttpHeader('HTTP/1.1 101 Switching Protocols', proxyRes.headers));
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
        server.emit('open', proxySocket);
        server.emit('proxySocket', proxySocket);
    });
    proxyReq.end();
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
