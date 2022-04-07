const https = require('https');
const http = require('http');
const torrentStream = require('torrent-stream');
const JSZip = require("jszip");
const {MIMETYPES} = require("./mime.js");
const {
    consumeBody,
    transformArgs,
    removeArg,
    check4Redirects,
    generateTorrentTree,
    getConcurentFiles,
    bodyBuffer,
    isNotGoodSite
} = require("./utils.js");
const debug = false;
//if you want to force a site to proxy, put url here
//leave empty if not. Will set the client to absolute proxy mode
const forceSite = '';

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
    ['https://www1.thepiratebay3.to', false, 'the pirate bay'],
    ['https://9anime.to', true, '9anime'],
    ['https://www.webtoons.com', false, 'webtoons']
]

function parseSetCookie(cookie, hostname, isAbsoluteProxy) {
    var cookieHeader;
    if (cookie.includes('Domain=')) {
        cookieHeader = cookie.split('Domain=').pop().split(';')[0];
        cookie = cookie.replaceAll('Domain='+cookie.split('Domain=').pop().split(';')[0]+';', '').replaceAll('  ', ' ');
    }
    if (! cookieHeader) {
        cookieHeader = hostname;
    }
    if (isAbsoluteProxy) {
        return cookie.trim();
    } else {
        return 'ck_'+(cookie.includes('HttpOnly')?1:0)+'_'+cookieHeader+'_'+cookie.trim();
    }
}

function parseResCookie(cookie, hostname, isAbsoluteProxy) {
    cookie = cookie.trim();
    if (! cookie.startsWith('ck_') || isAbsoluteProxy) {
        return [cookie.trim(), null];
    }
    var parts = cookie.split('_');
    var httpOnly = parseInt(parts[1]);
    var allowHost = parts[2];
    var reqHost = new RegExp(allowHost);
    if (hostname.match(reqHost) !== null) {
        return [cookie.replace('ck_'+parts[1]+'_'+parts[2]+'_', '').trim(), null];
    }
    return null;
}

function fetch(method, url, headers, body, opts, reqHost) {
    return new Promise(function(resolve, reject) {
        var newHeaders = {};
        var needsToSetCookies = [];
        var {hostname} = new URL(url);
        if (headers) {
            for (var k in headers) {
                if (k.startsWith('x-replit') || k === 'accept-encoding' || k.startsWith('sec-')) {
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
                            cookies.push(a[0]);
                            if (a[1] !== null) {
                                needsToSetCookies.push(a[1]);
                            }
                        }
                    }
                    newHeaders[k] = cookies.join('; ');
                    continue
                }
                if (headers[k].includes(reqHost)) {
                    headers[k] = headers[k].replaceAll(headers[k].split('https://').pop().split('/')[0], opts.site2Proxy.split('://').pop())
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
        req.on('response', async function(res) {
            if (!res.headers['content-type'] ||
                !(res.headers['content-type'] &&
                 (res.headers['content-type'].includes('javascript') ||
                  res.headers['content-type'].includes('html') ||
                  res.headers['content-type'].includes('json') ||
                  res.headers['content-type'].includes('x-www-form-urlencoded')))) {
                resolve([false, res, res.headers['content-type'], res.headers, res.statusCode, needsToSetCookies])
                return;
            }
            var body = await consumeBody(res);
            body = body.toString();
            resolve([true, body, res.headers['content-type'], res.headers, res.statusCode, needsToSetCookies]);
        })
        req.on('error', function(e) {
            reject(e);
        })
        if (body && body.byteLength > 0) {
            req.write(body)
        }
        req.end()
    })
}

function parseTextFile(body, isHtml, isUrlEncoded, opts, url, reqHost, proxyJSReplace) {
    //todo - replace style urls
    var {site2Proxy,replaceExternalUrls} = opts;
    var date = new Date();
    var origBody = body;
    var {hostname} = new URL(url);
    var hn2 = hostname;
    var {hostname} = new URL(site2Proxy);
    var startWithSite = ((new URL(url)).hostname !== hostname);
    var startUrl = '';
    if (startWithSite) {
        startUrl = (new URL('/', url)).toString();
        startUrl = startUrl.substring(0, startUrl.length-1);
    }
    body = body
        .replaceAll('"'+site2Proxy+'/', '"'+startUrl+'/')
        .replaceAll("'"+site2Proxy+'/', '\''+startUrl+'/')
        .replaceAll("'"+site2Proxy, '\''+startUrl+'')
        .replaceAll('"'+site2Proxy, '"'+startUrl)
        .replaceAll("'"+site2Proxy.replaceAll('\\/', '/')+'/', '\'/')
        .replaceAll('"'+site2Proxy.replaceAll('\\/', '/')+'/', '"/')
        .replaceAll("'"+site2Proxy.replaceAll('\\/', '/'), '\'')
        .replaceAll('"'+site2Proxy.replaceAll('\\/', '/'), '"')
        .replaceAll("'"+hostname, "'"+reqHost)
        .replaceAll('"'+hostname, '"'+reqHost)
        .replaceAll("'"+hn2, "'"+reqHost)
        .replaceAll('"'+hn2, '"'+reqHost)
        .replaceAll('discord', 'discordddd')
        .replaceAll('wss://', 'wss://'+reqHost+'/')
    if (isHtml) {
        body = body.replaceAll('integrity=', 'sadfghj=').replaceAll('magnet:?', '/torrentStream?stage=step1&magnet=');
        var a = body.split('src');
        for (var i=1; i<a.length; i++) {
            if (a[i].replaceAll(' ', '').replaceAll('"', '').replaceAll("'", '').trim().startsWith('=//')) {
                a[i] = a[i].replace('//', 'https://');
            }
            if (startUrl && a[i].replaceAll('=', '').replaceAll('"', '').replaceAll("'", '').trim().startsWith('/')) {
                a[i] = a[i].replace('/', startUrl+'/');
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
            if (startUrl && a[i].replaceAll('=', '').replaceAll('"', '').replaceAll("'", '').trim().startsWith('/') && !(a[i].replaceAll('=', '').replaceAll('"', '').replaceAll("'", '').trim().startsWith('//'))) {
                a[i] = a[i].replace('/', '/'+startUrl+'/');
            }
            if (a[i-1].split('<').pop().split(' ')[0] === 'a' && !replaceExternalUrls) {
                continue;
            }
            if (a[i].replaceAll('=', '').replaceAll('"', '').replaceAll("'", '').trim().startsWith('//')) {
                a[i] = a[i].replace('//', 'https://');
            }
            if (a[i].replaceAll('=', '').replaceAll('"', '').replaceAll("'", '').trim().startsWith('http')) {
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
        if (proxyJSReplace) {
            var a = body.split('//');
            for (var i=1; i<a.length; i++) {
                if ((a[i-1].endsWith('"') && !a[i].split('"')[0].includes(' ')) ||
                    (a[i-1].endsWith("'") && !a[i].split("'")[0].includes(' '))) {
                    a[i-1]+='https:';
                }
            }
            body = a.join('//');
        }
        body = body.replaceAll('http://', '/http:/').replaceAll('https://', '/https:/'); //.replaceAll('http:\\/\\/', '/http:\\/\\/').replaceAll('https:\\/\\/', '/https:\\/\\/');
        if (debug) {
            console.log('javascript parsing took '+(((new Date())-date)/1000)+' seconds');
        }
        if (site2Proxy.includes('youtube')) {
            body = body.replaceAll('www.youtube.com', reqHost).replaceAll('youtube.com', reqHost).replaceAll('www.', '').replaceAll('!a.u.startsWith("local")', 'false');
        }
        return body.replaceAll('/https://', '/https://').replaceAll('/http://', '/https://')
    }
}

function torrent(req, res) {
    res.writeContinue();
    res.setHeader('Access-Control-Allow-Origin', '*');
    var args = transformArgs(req.url.split('magnet=')[0]);
    var stage = args.stage;
    var magnet = req.url.split('magnet=').pop();
    try {
        var engine = torrentStream('magnet:?'+magnet);
    } catch(e) {
        res.end('error getting torrent metedata');
        return;
    }
    var ready = setTimeout(function() {
        engine.destroy();
        res.end('timeout getting torrent metedata');
    }, 20000);
    engine.on('ready', function () {
        clearTimeout(ready);
        var files = engine.files;
        var torrentName = engine.torrent.name;
        if (stage === 'step1') {
            var html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Download</title></head><body><br><ul><h1>Download</h1><br>';
            html += generateTorrentTree(files, magnet);
            html += '<br>'
            var downloadUrl2 = '/torrentStream?stage=dlAsZip&magnet='+magnet;
            html += '<br><a style="text-decoration:none" href="'+downloadUrl2+'">Download All As Zip</a></ul><br></body></html>';
            engine.destroy();
            res.setHeader('content-type', 'text/html; chartset=utf-8')
            res.writeHead(200);
            html = bodyBuffer(html);
            res.setHeader('content-length', html.byteLength);
            res.writeHead(200);
            res.end(html);
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
            if (args.stream === 'on' && args.fetchFile === 'no') {
                var downloadUrl = '/torrentStream?fileName='+encodeURIComponent(file.path)+'&stage=step2&stream=on&magnet='+magnet;
                var tagName = ['video', 'audio'].includes(ct) ? ct : ('image' === ct ? 'img' : 'iframe');
                res.setHeader('content-type', 'text/html; chartset=utf-8');
                var html = '<html><head><style>.nb{text-decoration:none;display:inline-block;padding:8px 16px;border-radius:12px;transition:0.35s;color:black;}.previous{background-color:#00b512;}.previous:hover{background-color:#ee00ff;}.next{background-color:#ffa600;}.next:hover{background-color:#0099ff;}</style><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+file.name+'</title></head><body><br><br><br><center>';
                html += ('<'+tagName);
                if (['video', 'image'].includes(ct)) {
                    html += ' height="75%"';
                }
                if (['video', 'audio'].includes(ct)) {
                    html += ' controls preload=auto';
                }
                if (!['video', 'audio', 'image'].includes(ct)) {
                    html += ' frameBorder="0" height="75%"';
                }
                html += ' id="element" src="'+downloadUrl+'"></'+tagName+'>';
                if (['video', 'audio'].includes(ct)) {
                    html += '<script>var element = document.getElementById("element");var errCt=0;function err(e){if(errCt>25){return};errCt++;var a=element.src;element.src=a;element.play()};element.addEventListener("abort", err);element.addEventListener("error", err);element.play();</script>';
                }
                html += '<h2>'+file.name+'</h2><br>';
                var nb = getConcurentFiles(file.path, files, magnet);
                if (nb) {
                    if (nb[0]) {
                        html += '<a href="'+nb[0]+'" class="previous nb">&laquo; Previous</a>';
                    }
                    if (nb[0] && nb[1]) {
                        html += ' ';
                    }
                    if (nb[1]) {
                        html += '<a href="'+nb[1]+'" class="next nb">Next &raquo;</a>';
                    }
                }
                html += '</center><br><ul>';
                html += generateTorrentTree(files, magnet);
                html += '</ul><br><br></body></html>';
                html = bodyBuffer(html);
                res.setHeader('content-length', html.byteLength);
                res.writeHead(200);
                res.end(html);
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
                } else {
                    fileOffset = parseInt(rparts[0]);
                    fileEndOffset = parseInt(rparts[1])
                    res.setHeader('content-length', fileEndOffset - fileOffset + 1);
                    res.setHeader('content-range','bytes '+fileOffset+'-'+(fileEndOffset)+'/'+file.length)
                    res.writeHead(206);
                }
            } else {
                fileOffset = 0;
                fileEndOffset = file.length - 1;
                res.writeHead(200);
            }
            var stream = file.createReadStream({start: fileOffset,end: fileEndOffset});
            stream.pipe(res);
            stream.on('finish', function() {
                engine.destroy();
            })
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

async function changeHtml(req, res) {
    var errMsg = '', adultContent = false;
    if (typeof forceSite !== undefined &&
        typeof forceSite == 'string' &&
        forceSite.trim() !== '') {
        var site = forceSite;
        try {
            var b;
            while (b = await check4Redirects(site)) {
                site = b;
            }
            var newURL = new URL('/', site);
            newURL = newURL.toString();
            if (newURL.endsWith('/')) {
                newURL = newURL.substring(0, newURL.length-1);
            }
            site = newURL;
        } catch(e) {
            res.end('Message for site owner: Invalid absolute url');
            return;
        }
        res.setHeader('set-cookie', 'proxySettings='+encodeURIComponent(site)+'_1_1_0_0; Max-Age=2592000; HttpOnly');
        res.setHeader('location', path2Redir2 || '/');
        res.setHeader('content-length', 0);
        res.writeHead(307);
        res.end();
        return;
    }
    if (req.url.includes('?')) {
        var args = transformArgs(req.url);
        if ((args.site || args.custom)) {
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
                    if (a.hostname.includes('127.0') || a.hostname.includes('192.168')) {
                        throw new Error('Cannot use local url');
                    }
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
            if (!args.confirmation && isNotGoodSite(args.custom?args.custom:decodeURIComponent(args.site))) {
                error = true;
                adultContent = true;
            }
            if (!error) {
                res.setHeader('set-cookie', 'proxySettings='+(args.custom?encodeURIComponent(args.custom):args.site)+'_'+(args.JSReplaceURL?'1':'0')+'_'+(args.absoluteSite?'1':'0')+'_'+(args.hidden?'1':'0')+'_'+(args.replaceExternal?'1':'0')+'; Max-Age=2592000; HttpOnly');
                if (args.shareURL) {
                    var {hostname} = new URL(args.custom?args.custom:decodeURIComponent(args.site));
                    res.setHeader('content-type', 'text/html; chartset=utf-8');
                    var html = '<html><head><title>Share URL</title></head><body><br><center><p>drag the link below to your bookmark bar</p><p>Or right click and press copy link to share</p><p>or just click it to continue</p><a href="'+req.url.replace('shareURL=true', '')+'">'+hostname+'</a></center></body></html>';
                    html = bodyBuffer(html);
                    res.setHeader('content-length', html.byteLength);
                    res.writeHead(200);
                    res.end(html);
                } else {
                    res.setHeader('location', path2Redir2 || '/');
                    res.setHeader('content-length', 0);
                    res.writeHead(307);
                    res.end();
                }
                return;
            }
        } else {
            errMsg = 'URL not chosen';
        }
    }
    res.setHeader('content-type', 'text/html; chartset=utf-8');
    var html = '';
    html += '<html><head><title>Change Site to Serve</title></head><body><ul><br><h1>Change Site to Serve</h1><ul>';
    if (errMsg && errMsg.trim()) {
        html += '<p style="color:red;">Error: '+errMsg+'</p>';
    }
    if (adultContent) {
        html += '<p style="color:red;">Warning: site may include adult content. Please confirm your settings</p>';
    }
    html += '<form action="" method="GET">';
    for (var i=0; i<sites.length; i++) {
        html += '<input type="radio" id="'+encodeURIComponent(sites[i][0])+'" name="site" value="'+encodeURIComponent(sites[i][0])+'"><label for="'+encodeURIComponent(sites[i][0])+'">'+sites[i][2]+(sites[i][1]?' (buggy)':'')+'</label><br>';
    }
    html += '<br><label for="custom">Custom URL</label><input type="text" id="custom" name="custom"><br><br><input type="checkbox" id="JSReplaceURL" name="JSReplaceURL" value="true" checked><label for="JSReplaceURL"> Replace Javascript // urls (may break some sites)</label><br><br><input type="checkbox" id="absoluteSite" name="absoluteSite" value="true"><label for="absoluteSite"> Set as absolute proxy site (required for some sites, recommended to clear your cookies before enabling to prevent possible leak of personal data)</label><br><br><input type="checkbox" id="hidden" name="hidden" value="true"><label for="hidden"> Hide page title/url from search history (will appear as google classroom)</label><br><br><input type="checkbox" id="replaceExternal" name="replaceExternal" value="true"><label for="replaceExternal"> Replace External URLs</label><br><br><input type="checkbox" id="shareURL" name="shareURL" value="true"><label for="shareURL"> Get url to share (or bookmark)</label><br><br>';
    if (adultContent) {
        html += '<input type="checkbox" id="confirmation" name="confirmation" value="true"><label for="confirmation"> Check this box to confirm you know what you are about to see may be adult content.</label><br><br>';
    }
    html +='<input type="submit" value="Submit"></form><ul></ul>';
    html += '</body></html>';
    html = bodyBuffer(html);
    res.setHeader('content-length', html.byteLength);
    res.end(html)
}

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

//todo
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
            return;
        }
        method = 'GET';
        consumed = true;
    }
    url = url.startsWith('/http') ? url.substring(1) : opts.site2Proxy+url;
    if (url.startsWith('https:/') &&
        !url.startsWith('https://')) {
        url = url.replace('https:/', 'https://');
    }
    if (url.startsWith('http:/') &&
        !url.startsWith('http://')) {
        url = url.replace('http:/', 'http://');
    }
    if (url.startsWith('https://https:/')) {
        url = url.replace('https://https:/', 'https:/');
    }
    if (url.startsWith('http://http:/')) {
        url = url.replace('http://http:/', 'http:/');
    }
    var args = transformArgs(url);
    url = removeArg(url, 'vc');
    url = removeArg(url, 'nc');
    url = removeArg(url, 'video');
    if (url.endsWith('?')) {
        url = url.substring(0, url.length-1);
    }
    url=url.replaceAll('https%3A%2F%2F%2F', '');
    url=url.replaceAll('https%3A%2F'+req.headers.host, 'https%3A%2F%2F'+req.headers.host);
    var vc = args.vc, nc = args.nc;
    var reqBody;
    if (!consumed) {
        reqBody = await consumeBody(req);
        if (req.headers['content-type'] && req.headers['content-type'].includes('x-www-form-urlencoded')) {
            reqBody = Buffer.from(parseTextFile(reqBody.toString(), false, true, opts, url, host, false));
        }
    }
    try {
        var body = await fetch(method, url, req.headers, reqBody, opts, host);
    } catch(e) {
        console.log(e)
        res.writeHead(404);
        res.end('error');
        return;
    }
    if (['1', 'true'].includes(args.video) && body[0] === true && body[1].includes('setVideoUrlHigh(\'')) {
        res.setHeader('location', '/'+body[1].split('setVideoUrlHigh(\'').pop().split("'")[0]);
        res.setHeader('content-length', 0);
        res.writeHead(307);
        res.end();
        return;
    }
    for (var k in body[3]) {
        if (['content-security-policy', 'content-encoding'].includes(k) || (k === 'content-length' && body[0] === true)) {
            continue
        }
        if (k === 'set-cookie') {
            var {hostname} = new URL(url);
            if (Array.isArray(body[3][k])) {
                var cookies = [];
                for (var i=0; i<body[3][k].length; i++) {
                    cookies.push(parseSetCookie(body[3][k][i], hostname, opts.isAbsoluteProxy));
                }
                res.setHeader(k, cookies);
            } else {
                res.setHeader(k, parseSetCookie(body[3][k], hostname, opts.isAbsoluteProxy));
            }
            continue;
        }
        if (body[3][k].startsWith('//')) {
            body[3][k] = body[3][k].replaceAll('//', 'https://');
        }
        if (typeof body[3][k] == 'string') {
            res.setHeader(k, body[3][k].replaceAll(opts.site2Proxy+'/', '/').replaceAll(opts.site2Proxy, '').replaceAll('http', '/http'));
        } else {
            res.setHeader(k, body[3][k]);
        }
    }
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    if (vc == 'true' || vc == '1' || nc == 'true' || nc == '1') {
        res.setHeader('content-type', 'text/plain');
    }
    if (body[5].length > 0) {
        var a = res.getHeader('set-cookie');
        if (!a) {
            a = [];
        }
        for (var i=0; i<body[5].length; i++) {
            a.push(body[5][i]);
        }
        res.setHeader('set-cookie', a);
    }
    if (body[0] === true) {
        var code = body[4];
        var mime = body[2];
        //javascript/html parsing
        if (!nc || (nc != '1' && nc != 'true')) {
            body = parseTextFile(body[1], body[2].includes('html'), body[2].includes('x-www-form-urlencoded'), opts, url, host, opts.proxyJSReplace);
        } else {
            body = body[1];
        }
        if (opts.site2Proxy === 'https://www.instagram.com' && mime.includes('javascript') && !url.includes('worker')) {
            body+='\nif (typeof window !== undefined && typeof document !== undefined && !window.checkInterval) {window.checkInterval=setInterval(function(){document.querySelectorAll("svg").forEach(e => {if (e.attributes["aria-label"]&&e.attributes["aria-label"].textContent) {e.innerHTML = e.attributes["aria-label"].textContent}})}, 200)}';
        }
        body = bodyBuffer(body);
        res.setHeader('content-length', body.byteLength);
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
    console.log(req.url, 'upgrade')
    var needsToSetCookies = [];
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
                        cookies.push(a[0]);
                        if (a[1] !== null) {
                            needsToSetCookies.push(a[1]);
                        }
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
    if (needsToSetCookies > 0) {
        var a = res.getHeader('set-cookie');
        if (!a) {a = [];}
        for (var i=0; i<needsToSetCookies.length; i++) {
            a.push(needsToSetCookies[i]);
        }
        res.setHeader('set-cookie', a);
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
