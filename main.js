if (!global.https) global.https = require('https');
if (!global.http) global.http = require('http');
if (!global.torrentStream) global.torrentStream = require('torrent-stream');
if (!global.JSZip) global.JSZip = require("jszip");
if (!global.MIMETYPES) global.MIMETYPES = require("./mime.js").MIMETYPES;
if (!global.fetchURL) global.fetchURL = require("./fetch.js");
if (!global.torrent) global.torrent = require("./torrent.js");
if (!global.parseTextFile) global.parseTextFile = require("./parseText.js");
if (!global.changeHtml) global.changeHtml = require("./changeHtml.js");
if (!global.hideTitle) global.hideTitle = require("./hideTitle.js");
if (!global.setupWebsocket) global.setupWebsocket = require("./websocket.js");
if (!global.urlShortener) global.urlShortener = require("./urlShortener.js");
if (!global.ytdl) global.ytdl = require('youtube-downloader-2');
if (!global.yt) global.yt = require("./yt.js");
if (!global.fs) global.fs = require('fs');
if (!global.net) global.net = require('net');
let a = require("./utils.js");
for (const k in a) {
    if (!global[k]) global[k] = a[k];
}

//if you want to force a site to proxy, put url here
//leave empty if not. Will set the client to absolute proxy mode

global.sites = [
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

async function onRequest(req, res, optz, preventDefault) {
    if (typeof preventDefault === 'function') preventDefault();
    let host = req.headers.host,
        url = req.url,
        method = req.method;
    
    // Torrent Stream to browser
    if (url.split('?')[0] === '/torrentStream' && optz.torrent) {
        return torrent(req, res);
    }
    if (url === '/worker.js?proxyWorker=true') {
        return res.end("todo");
    }
    //YouTube Downloader
    if (url.split('?')[0] === '/yt' && optz.yt) {
        return yt(req, res);
    }
    // Url Shortener
    if (url.split('?')[0].toLowerCase().startsWith('/tinyurl')) {
        return urlShortener(req, res);
    }
    // The site configuration page
    if (req.url.split('?')[0] === '/changeSiteToServe') {
        return changeHtml(req, res, optz);
    }
    let opts = getOpts(req.headers.cookie);
    if (url.startsWith('/http') && (url.substring(1).startsWith('https://'+req.headers.host) || url.substring(1).startsWith('https:/'+req.headers.host) || url.substring(1).startsWith('http://'+req.headers.host) || url.substring(1).startsWith('http:/'+req.headers.host))) {
        res.setHeader('location', url.split('/'+req.headers.host).pop().replaceAll('//', '/'));
        res.setHeader('content-length', 0);
        res.writeHead(301);
        res.end();
        return;
    }
    let result;
    try {
        result = processUrl(url, host, opts);
        url = removeArg(result.url, 'cors');;
        args = result.args;
        if (!opts.site2Proxy) {
            opts.site2Proxy = new URL('/', url);
            opts.site2Proxy = opts.site2Proxy.toString();
            if (opts.site2Proxy.endsWith('/')) {
                opts.site2Proxy = opts.site2Proxy.substring(0, opts.site2Proxy.length-1);
            }
        }
    } catch(e) {
        res.setHeader('location', '/changeSiteToServe');
        res.setHeader('content-length', 0);
        res.writeHead(307);
        res.end();
        return;
    }
    try {
        const isNotGood = isNotGoodSite((new URL(url)).hostname);
        if (isNotGood && !optz.allowAdultContent) {
            const body = bodyBuffer('<p>Site blocked. Contact the site owner for more information</p>');
            res.setHeader('content-type', 'text/html; chartset=utf-8');
            res.setHeader('content-length', body.byteLength);
            res.writeHead(200);
            res.end(body);
            return;
        } else if (isNotGood && !opts.allowAdultContent) {
            const body = bodyBuffer('<p>This site requires configuring to visit. </p><p><a href="/changeSiteToServe">Go here to change your settings</a></p>');
            res.setHeader('content-type', 'text/html; chartset=utf-8');
            res.setHeader('content-length', body.byteLength);
            res.writeHead(200);
            res.end(body);
            return;
        }
    }catch(e){};
    
    if (req.url.split('?')[0] === '/hideTitle') {
        return hideTitle(req, res, opts);
    }
    //TODO - encryption?
    if (opts.useHiddenPage && req.headers['sec-fetch-dest'] === 'document') {
        res.setHeader('location', '/hideTitle?'+encodeURIComponent(btoa(encodeURIComponent('url='+req.url))));
        res.setHeader('content-length', 0);
        res.writeHead(307);
        res.end();
        return;
    }
    if (opts.proxyJSReplace === undefined) {
        opts.proxyJSReplace = true;
    }
    let vc = args.vc, //View Source
        nc = args.nc; //No Change
    
    if (opts.noChange) {
        nc = true;
    }

    let reqBody;
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

    let resp;
    try {
        resp = await fetchURL(method, url, req.headers, reqBody, opts, host);
    } catch(e) {
        if (optz.debug) console.warn(e);
        res.writeHead(404);
        res.end('Error');
        return;
    }

    for (const k in resp.headers) {
        if (['content-security-policy', 'content-encoding'].includes(k) || (k === 'content-length' && resp.isString)) continue;
        if (k === 'set-cookie') {
            const {hostname} = new URL(url);
            if (Array.isArray(resp.headers[k])) {
                let cookies = [];
                for (let i=0; i<resp.headers[k].length; i++) {
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
        if (typeof resp.headers[k] === 'string') {
            res.setHeader(k, resp.headers[k].replaceAll(opts.site2Proxy+'/', '/').replaceAll(opts.site2Proxy, '').replaceAll('http', '/http'));
        } else {
            res.setHeader(k, resp.headers[k]);
        }
    }

    res.setHeader('x-frame-options', 'SAMEORIGIN');
    if (["1", "true"].includes(vc)) {
        res.setHeader('content-type', 'text/plain');
    }
    if (["1", "true"].includes(args.cors)) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    if (resp.isString) {
        //JavaScript/html parsing
        let body;
        if (![true, "true", "1"].includes(nc)) {
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
