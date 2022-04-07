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
var a = require("./utils.js");
for (var k in a) {
    global[k] = a[k];
}
global.debug = false;
//if you want to force a site to proxy, put url here
//leave empty if not. Will set the client to absolute proxy mode
global.forceSite = '';
if (process.env.FORCE_SITE && typeof process.env.FORCE_SITE == 'string') {
    global.forceSite = process.env.FORCE_SITE
}

let port = 3000;
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

function hideTitle(req, res, opts) {
    var url = '/';
    if (req.url.includes('?')) {
        url = transformArgs(req.url).url;
    }
    var html = '<html><head><link rel="icon" type="image/png" href="/https:/ssl.gstatic.com/classroom/favicon.png"><title>Classes</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{padding:0;margin:0;}iframe{margin:0 auto;}</style></head><body><noscript><p>Some features may not work without javascript</p></noscript><script>var iframe=document.getElementById("mainFrame");function goBack(){iframe.contentWindow.history.back();};function goForward() {iframe.contentWindow.history.forward();}</script><button onclick="goBack()">Back</button> <button onclick="goForward()">Forward</button><iframe width=99% height=95% frameBoarder=0 src="'+url+'" id="mainFrame"></iframe></body></html>';
    html = bodyBuffer(html);
    res.setHeader('content-length', html.byteLength);
    res.setHeader('content-type', 'text/html; chartset=utf-8');
    res.end(html);
}

async function postGet(req, res) {
    if (req.method === 'GET') {
        var html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><form method="POST" action=""><br><label for="url">link</label><input type="text" id="url" name="url"><br><br><input type="submit" value="Submit"></form></body></html>';
        html = bodyBuffer(html);
        res.setHeader('content-length', html.byteLength);
        res.setHeader('content-type', 'text/html; chartset=utf-8');
        res.end(html);
        return null;
    }
    var body = await consumeBody(req);
    var args = transformArgs('?'+body);
    if (! args.url.startsWith('/')) {
        args.url = '/'+args.url;
    }
    return args.url;
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
    var opts = {};
    if (req.headers.cookie && req.headers.cookie.includes('proxySettings=')) {
        opts.site2Proxy = decodeURIComponent(req.headers.cookie.split('proxySettings=').pop().split(';')[0].split('_')[0]);
        opts.proxyJSReplace = (req.headers.cookie.split('proxySettings=').pop().split(';')[0].split('_')[1] === '1');
        opts.isAbsoluteProxy = (req.headers.cookie.split('proxySettings=').pop().split(';')[0].split('_')[2] === '1');
        opts.useHiddenPage = (req.headers.cookie.split('proxySettings=').pop().split(';')[0].split('_')[3] === '1');
        opts.replaceExternalUrls = (req.headers.cookie.split('proxySettings=').pop().split(';')[0].split('_')[4] === '1');
    }
    if (! opts.site2Proxy) {
        res.setHeader('location', '/changeSiteToServe');
        res.setHeader('content-length', 0);
        res.writeHead(307);
        res.end();
        return;
    }
    if (req.url.split('?')[0] === '/hideTitle') {
        hideTitle(req, res, opts);
        return
    }
    if (opts.useHiddenPage && req.headers['sec-fetch-dest'] === 'document') {
        res.setHeader('location', '/hideTitle?url='+encodeURIComponent(req.url));
        res.setHeader('content-length', 0);
        res.writeHead(307);
        res.end();
        return;
    }
    if (!opts.proxyJSReplace) {
        opts.proxyJSReplace = true;
    }
    if (req.url.startsWith('/http') && (req.url.substring(1).startsWith('https://'+req.headers.host) || req.url.substring(1).startsWith('https:/'+req.headers.host) || req.url.substring(1).startsWith('http://'+req.headers.host) || req.url.substring(1).startsWith('http:/'+req.headers.host))) {
        res.setHeader('location', req.url.split('/'+req.headers.host).pop().replaceAll('//', '/'));
        res.setHeader('content-length', 0);
        res.writeHead(301);
        res.end();
        return;
    }
    var url=req.url,method=req.method,consumed=false;
    if (url.split('?')[0] === '/postGet') {
        url = await postGet(req, res);
        if (url === null) {
            return null;
        }
        method = 'GET';
        consumed = true;
    }
    var a = processUrl(url, host, opts);
    url = a.url;
    args = a.args;
    var vc = args.vc, nc = args.nc;
    var reqBody;
    if (!consumed) {
        reqBody = await consumeBody(req);
        if (req.headers['content-type'] && req.headers['content-type'].includes('x-www-form-urlencoded')) {
            reqBody = Buffer.from(parseTextFile(reqBody.toString(), false, true, opts, url, host, false));
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
            resp.headers[k] = resp.headers[k].replaceAll('//', 'https://');
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
            body = parseTextFile(resp.body, resp.contentType.includes('html'), resp.contentType.includes('x-www-form-urlencoded'), opts, url, host, opts.proxyJSReplace);
        } else {
            body = resp.body;
        }
        if (opts.site2Proxy === 'https://www.instagram.com' && resp.contentType.includes('javascript') && !url.includes('worker')) {
            body+='\nif (typeof window !== undefined && typeof document !== undefined && !window.checkInterval) {window.checkInterval=setInterval(function(){document.querySelectorAll("svg").forEach(e => {if (e.attributes["aria-label"]&&e.attributes["aria-label"].textContent) {e.innerHTML = e.attributes["aria-label"].textContent}})}, 200)}';
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
    console.log(req.url, 'upgrade')
    if (head && head.length) socket.unshift(head);
    socket.setTimeout(0);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 0);
    var newHeaders = {};
    var {hostname,pathname,search} = new URL('wss:/'+req.url);
    var headers = req.headers;
    var opts = {};
    if (req.headers.cookie && req.headers.cookie.includes('proxySettings=')) {
        opts.site2Proxy = decodeURIComponent(req.headers.cookie.split('proxySettings=').pop().split(';')[0].split('_')[0]);
        opts.isAbsoluteProxy = (req.headers.cookie.split('proxySettings=').pop().split(';')[0].split('_')[2] === '1');
    }
    if (headers) {
        for (var k in headers) {
            if (k.startsWith('x-replit') || k === 'accept-encoding') {
                continue;
            }
            if (k === 'cookie') {
                var cookies = [];
                var ck = headers[k].split(';');
                for (var i=0; i<ck.length; i++) {
                    if (ck[i].includes('proxySettings')) {
                        continue;
                    }
                    var a = parseResCookie(ck[i], hostname, opts.isAbsoluteProxy);
                    if (a !== null) {
                        cookies.push(a);
                    }
                }
                newHeaders[k] = cookies.join('; ');
                continue;
            }
            if (headers[k].includes(hostname)) {
                headers[k] = headers[k].replaceAll(headers[k].split('https://').pop().split('/')[0], opts.site2Proxy.split('://').pop())
            }
            newHeaders[k] = headers[k];
        }
    }
    newHeaders['host'] = hostname;
    var outgoing = {};
    var origin = '';
    if (req.headers.cookie && req.headers.cookie.includes('proxySettings=')) {
        origin = opts.site2Proxy;
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
