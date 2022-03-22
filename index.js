
const https = require('https');
const http = require('http');
const {ungzip} = require('node-gzip');
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
                if (k.startsWith('x-replit')) {
                    continue;
                }
                if (k === 'cookie') {
                    var cookies = [];
                    var ck = headers[k].split(';');
                    for (var i=0; i<ck.length; i++) {
                        if (ck[i].trim().split('_')[0].trim() === hostname) {
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
        newHeaders['accept-encoding'] = 'gzip';
        newHeaders['host'] = hostname;
        var protReq = url.startsWith('https:') ? https : http;
        var req = protReq.request(url, {method: method, body: body});
        if (body && body.byteLength !== 0) {
            req.setHeader('content-length', body.byteLength);
        }
        req.on('response', function(res) {
            if (!res.headers['content-type'] || !(res.headers['content-type'] && res.headers['content-type'].includes('javascript') || res.headers['content-type'].includes('html'))) {
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

function parseTextFile(body, isHtml, site2Proxy) {
    body = body.replaceAll(site2Proxy+'/', '/').replaceAll(site2Proxy, '').replaceAll(site2Proxy.replaceAll('\\/', '/')+'/', '/').replaceAll(site2Proxy.replaceAll('\\/', '/'), '').replaceAll('discord', 'discordddd');
    if (isHtml) {
        body = body.replaceAll('integrity=', 'sadfghj=');
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

function removeArg(url, argName) {
    if (! url.includes(argName)) {
        return url;
    }
    var a = url.split(argName).pop().split('&')[0];
    return url.replace(argName+a, '')
}

function changeHtml(req, res) {
    if (req.url.includes('?')) {
        var args = transformArgs(req.url);
        var error = false;
        if (args.site || args.custom) {
            if (args.custom) {
                try {
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
                res.setHeader('location', '/');
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
    try {
        var body = await fetch(req.method, url, req.headers, reqBody, site2Proxy)
    } catch(e) {
        res.writeHead(404);
        res.end('error');
        return;
    }
    for (var k in body[3]) {
        if (['transfer-encoding', 'content-security-policy', 'content-encoding'].includes(k) || (k === 'content-length' && body[0] === true)) {
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
        body = parseTextFile(body[1], body[2].includes('html'), site2Proxy);
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
