if (!global.https) global.https = require('https');
if (!global.http) global.http = require('http');
if (!global.torrentStream) global.torrentStream = require('torrent-stream');
if (!global.JSZip) global.JSZip = require("jszip");
if (!global.MIMETYPES) global.MIMETYPES = require("./mime.js").MIMETYPES;
if (!global.fetch) global.fetch = require("./fetch.js");
if (!global.torrent) global.torrent = require("./torrent.js");
if (!global.parseTextFile) global.parseTextFile = require("./parseText.js");
if (!global.changeHtml) global.changeHtml = require("./changeHtml.js");
if (!global.hideTitle) global.hideTitle = require("./hideTitle.js");
if (!global.setupWebsocket) global.setupWebsocket = require("./websocket.js");
if (!global.urlShortener) global.urlShortener = require("./urlShortener.js");
if (!global.ytdl) global.ytdl = require('youtube-downloader-ethanaobrien');
if (!global.fs) global.fs = require('fs');
if (!global.net) global.nte = require('net');
var a = require("./utils.js");
for (var k in a) {
    if (!global[k]) global[k] = a[k];
}
//if you want to force a site to proxy, put url here
//leave empty if not. Will set the client to absolute proxy mode

global.sites = [ //no '/' at end
    //site, isBuggy, display_name
    ['https://simplewebserver.org/', false, 'Simple Web Server']
]

function connect(req, clientSocket, head) {
    console.log(req.socket.remoteAddress + ':', 'Request',req.method, req.url);
    const {port, hostname} = new URL('http://'+req.url);
    const serverSocket = net.connect(port || 443, hostname, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                           'Proxy-agent: Simple-Web-Server-Proxy\r\n' +
                           '\r\n')
        serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    })
    serverSocket.on('error', function(e) {});
    clientSocket.on('error', function(e) {});
}

async function yt(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method.toLowerCase() === 'post') {
        body = await consumeBody(req);
        body = body.toString();
        args = transformArgs('?'+body);
    } else {
        args = transformArgs(req.url);
    }
    if (!args.video) {
        var html = '<html><head><title>Youtube Downloader</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><ul><br><h1>Youtube Downloader</h1><ul><form action="" method="POST" autocomplete="off"><br><label for="video">Youtube Link: </label><input type="text" id="video" name="video"><br><br><input type="submit" value="Submit"></form><ul></ul></body></html>';
        end(html, res, 'text/html; chartset=utf-8');
        return;
    }
    try {
        var urls = await ytdl(args.video);
    } catch(e) {
        end('error getting video urls', res);
        return;
    }
    if (args.json) {
        end(JSON.stringify(urls), res, 'application/json');
        return;
    }
    var {urls,video,audio,videoTitle} = urls;
    var html = '<html><head><title>Youtube Downloader</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><ul><br><h1>YouTube Downloader</h1>\n<ul><h2>Title: ' + videoTitle + '</h2>\n';
    for (var i=0; i<urls.length; i++) {
        html += '<p>Quality: ' +urls[i].qualityLabel + '; fps: ' + urls[i].fps + '; Mimetype: ' +urls[i].mimeType.split(';')[0] + '; Url: <a target="_blank" href="' + urls[i].url + '">Open</a> <a target="_blank" href="' + urls[i].url + '&title=' +
videoTitle.replaceAll(' ', '+') + '">Download</a></p>\n';
    };
    html += '\n<h2>No Audio</h2><ul>';
    for (var i=0; i<video.length; i++) {
        html += '<p>Quality: ' + video[i].qualityLabel + '; fps: ' + video[i].fps + '; Mimetype: ' + video[i].mimeType.split(';')[0] + '; Url: <a target="_blank" href="' + video[i].url + '">Open</a></p>\n';
    };
    html += '</ul>\n<h2>Only Audio</h2><ul>';
    for (var i=0; i<audio.length; i++) {
        html += '<p>Bitrate: ' + audio[i].bitrate + '; Mimetype: ' + audio[i].mimeType.split(';')[0] + '; Url: <a target="_blank" href="' + audio[i].url + '">Open</a></p>\n';
    };
    html += '</ul></ul></ul></body></html>';
    end(html, res, 'text/html; chartset=utf-8');
}

async function onRequest(req, res, optz, preventDefault) {
    if (preventDefault && typeof preventDefault == 'function') preventDefault();
    //https://ogp.me
    var host = req.headers.host;
    var url=req.url,method=req.method,consumed=false;
    if (req.url.split('?')[0] === '/torrentStream' && optz.torrent) {
        torrent(req, res);
        return;
    }
    if (req.url === '/worker.js?proxyWorker=true') {
        res.setHeader('content-type', 'text/javascript; chartset=utf-8');
        try {
            res.end(fs.readFileSync(require.resolve("./worker.js")));
        } catch(e) {
            res.end('error');
            console.warn('error reading service worker file', e);
        }
        return;
    }
    if (req.url.split('?')[0] === '/yt' && optz.yt) {
        yt(req, res);
        return;
    }
    if (req.url.split('?')[0].toLowerCase().startsWith('/tinyurl')) {
        urlShortener(req, res);
        return;
    }
    if (req.url.split('?')[0] === '/changeSiteToServe') {
        changeHtml(req, res, optz);
        return;
    }
    var opts = getOpts(req.headers.cookie);
    if (! opts.site2Proxy && req.url.split('?')[0] && !req.url.startsWith('/http')) {
        res.setHeader('location', '/changeSiteToServe');
        res.setHeader('content-length', 0);
        res.writeHead(307);
        res.end();
        return;
    }
    if (req.url.startsWith('/http') && (req.url.substring(1).startsWith('https://'+req.headers.host) || req.url.substring(1).startsWith('https:/'+req.headers.host) || req.url.substring(1).startsWith('http://'+req.headers.host) || req.url.substring(1).startsWith('http:/'+req.headers.host))) {
        res.setHeader('location', req.url.split('/'+req.headers.host).pop().replaceAll('//', '/'));
        res.setHeader('content-length', 0);
        res.writeHead(301);
        res.end();
        return;
    }
    var a = processUrl(url, host, opts);
    url = a.url;
    url = removeArg(url, 'cors');
    args = a.args;
    if (!opts.site2Proxy) {
        opts.site2Proxy = new URL('/', url);
        opts.site2Proxy = opts.site2Proxy.toString();
        if (opts.site2Proxy.endsWith('/')) {
            opts.site2Proxy = opts.site2Proxy.substring(0, opts.site2Proxy.length-1);
        }
    }
    try {
        var isNotGood = isNotGoodSite((new URL(url)).hostname);
        if (isNotGood && !optz.allowAdultContent) {
            var body = bodyBuffer('<p>site blocked. Contact the site owner for more information</p>');
            res.setHeader('content-type', 'text/html; chartset=utf-8');
            res.setHeader('content-length', body.byteLength);
            res.writeHead(200);
            res.end(body);
            return;
        } else if (isNotGood && !opts.allowAdultContent) {
            var body = bodyBuffer('<p>this site requires configuring to visit. </p><a href="/changeSiteToServe">Go here to change your settings</a>');
            res.setHeader('content-type', 'text/html; chartset=utf-8');
            res.setHeader('content-length', body.byteLength);
            res.writeHead(200);
            res.end(body);
            return;
        }
    }catch(e){};
    if (req.url.split('?')[0] === '/hideTitle' && !consumed) {
        hideTitle(req, res, opts);
        return
    }
    if (opts.useHiddenPage && req.headers['sec-fetch-dest'] === 'document' && !consumed) {
        res.setHeader('location', '/hideTitle?'+encodeURIComponent(btoa(encodeURIComponent('url='+req.url))));
        res.setHeader('content-length', 0);
        res.writeHead(307);
        res.end();
        return;
    }
    if (!opts.proxyJSReplace) {
        opts.proxyJSReplace = true;
    }
    let vc = args.vc, nc = args.nc;
    
    if (opts.noChange) {
        nc = true;
    }
    var reqBody = {};
    if (!consumed) {
        if (req.headers['content-type'] && req.headers['content-type'].includes('x-www-form-urlencoded')) {
            reqBody = {
                data: Buffer.from(parseTextFile((await consumeBody(req)).toString(), 'x-www-form-urlencoded', opts, url, host, false, optz)),
                stream: false
            };
        } else {
            reqBody = {
                data: req,
                stream: true,
                length: req.headers['content-length']
            };
        }
    }
    try {
        var resp = await fetch(method, url, req.headers, reqBody, opts, host);
    } catch(e) {
        if (optz.debug) {
            console.log(e)
        }
        res.writeHead(404);
        res.end('error');
        return;
    }
    if (['1', 'true'].includes(args.video) && resp.isString && resp.body.includes('setVideoUrlHigh(\'')) {
        res.setHeader('location', '/'+resp.body.split('setVideoUrlHigh(\'').pop().split("'")[0]);
        res.setHeader('content-length', 0);
        res.writeHead(307);
        res.end();
        return;
    }
    for (var k in resp.headers) {
        if (['content-security-policy', 'content-encoding'].includes(k) || (k === 'content-length' && resp.isString)) {
            continue
        }
        if (k === 'set-cookie') {
            var {hostname} = new URL(url);
            if (Array.isArray(resp.headers[k])) {
                var cookies = [];
                for (var i=0; i<resp.headers[k].length; i++) {
                    cookies.push(parseSetCookie(resp.headers[k][i], hostname, opts.isAbsoluteProxy));
                }
                res.setHeader(k, cookies);
            } else {
                res.setHeader(k, parseSetCookie(resp.headers[k], hostname, opts.isAbsoluteProxy));
            }
            continue;
        }
        if (resp.headers[k].startsWith('//')) {
            resp.headers[k] = 'https:'+resp.headers[k];
        }
        if (resp.headers[k].startsWith('/')) {
            try {
                resp.headers[k] = 'https://'+(new URL(url)).hostname+resp.headers[k];
            } catch(e){}
        }
        if (typeof resp.headers[k] == 'string') {
            res.setHeader(k, resp.headers[k].replaceAll(opts.site2Proxy+'/', '/').replaceAll(opts.site2Proxy, '').replaceAll('http', '/http'));
        } else {
            res.setHeader(k, resp.headers[k]);
        }
    }
    //res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    if (vc == 'true' || vc == '1') {
        res.setHeader('content-type', 'text/plain');
    }
    if (args.cors=='1') {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    if (resp.isString) {
        //javascript/html parsing
        var body = '';
        if (nc !== '1' && nc !== 'true' && nc !== true) {
            body = parseTextFile(resp.body, resp.contentType, opts, url, host, opts.proxyJSReplace, optz);
        } else {
            body = resp.body;
        }
        body = bodyBuffer(body);
        res.setHeader('content-length', body.byteLength);
        res.writeHead(resp.code || 200);
        res.end(body);
    } else {
        res.writeHead(resp.code || 200);
        resp.res.pipe(res);
    }
}

function onStart(server) {
    server.on('connect', connect);
    setupWebsocket(server);
}


module.exports = {
    onRequest,
    onStart
};

