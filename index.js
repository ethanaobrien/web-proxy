global.https = require('https');
global.http = require('http');
global.torrentStream = require('torrent-stream');
global.JSZip = require("jszip");
const {MIMETYPES} = require("./mime.js");
global.MIMETYPES = MIMETYPES;
global.fetch = require("./fetch.js");
global.torrent = require("./torrent.js");
global.parseTextFile = require("./parseText.js");
global.changeHtml = require("./changeHtml.js");
global.hideTitle = require("./hideTitle.js");
global.setupWebsocket = require("./websocket.js");
global.urlShortener = require("./urlShortener.js");
global.ytdl = require('youtube-downloader-ethanaobrien');
var a = require("./utils.js");
for (var k in a) {
    global[k] = a[k];
}
global.debug = false;
global.allowAdultContent = true;
let port = 3000;
//if you want to force a site to proxy, put url here
//leave empty if not. Will set the client to absolute proxy mode
global.forceSite = '';
if (process.env.FORCE_SITE && typeof process.env.FORCE_SITE == 'string') {
    global.forceSite = process.env.FORCE_SITE
}
if (process.argv.includes('--site')) {
    global.forceSite = process.argv[process.argv.indexOf('--site')+1];
}
if (process.env.PORT) {
    port = process.env.PORT;
}
if (process.argv.includes('--port')) {
    global.forceSite = process.argv[process.argv.indexOf('--port')+1];
}

global.sites = [ //no '/' at end
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
    ['https://www1.thepiratebay3.to', false, 'the pirate bay'],
    ['https://9anime.to', true, '9anime'],
    ['https://www.webtoons.com', false, 'webtoons']
]

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

var server = http.createServer(async function(req, res) {
    var host = req.headers.host;
    var url=req.url,method=req.method,consumed=false;
    if (req.url.split('?')[0] === '/torrentStream') {
        torrent(req, res);
        return;
    }
    if (req.url.split('?')[0] === '/yt') {
        yt(req, res);
        return;
    }
    if (req.url.split('?')[0].toLowerCase().startsWith('/tinyurl')) {
        urlShortener(req, res);
        return;
    }
    if (req.url.split('?')[0] === '/changeSiteToServe') {
        changeHtml(req, res);
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
        if (isNotGood && !allowAdultContent) {
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
    var vc = args.vc, nc = args.nc;
    var reqBody;
    if (!consumed) {
        reqBody = await consumeBody(req);
        if (req.headers['content-type'] && req.headers['content-type'].includes('x-www-form-urlencoded')) {
            reqBody = Buffer.from(parseTextFile(reqBody.toString(), 'x-www-form-urlencoded', opts, url, host, false));
        }
    }
    try {
        var resp = await fetch(method, url, req.headers, reqBody, opts, host);
    } catch(e) {
        if (debug) {
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
        if (typeof resp.headers[k] == 'string') {
            res.setHeader(k, resp.headers[k].replaceAll(opts.site2Proxy+'/', '/').replaceAll(opts.site2Proxy, '').replaceAll('http', '/http'));
        } else {
            res.setHeader(k, resp.headers[k]);
        }
    }
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    if (vc == 'true' || vc == '1' || nc == 'true' || nc == '1') {
        res.setHeader('content-type', 'text/plain');
    }
    if (resp.isString) {
        //javascript/html parsing
        var body = '';
        if (!nc || (nc != '1' && nc != 'true')) {
            body = parseTextFile(resp.body, resp.contentType, opts, url, host, opts.proxyJSReplace);
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
})

setupWebsocket(server);

server.on('clientError', function (err, socket) {
    if (err.code === 'ECONNRESET' || !socket.writable) {
        return;
    }
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
server.on('listening', function() {
    console.log('listening on port '+port);
})
function tryListen() {
    console.log('trying to listen on port '+port);
    server.listen(port);
}
server.on('error', function(e) {
    if (e.code === 'EADDRINUSE') {
        console.log('failed to listen on port '+port);
        port++;
        tryListen();
    }
})
tryListen();
