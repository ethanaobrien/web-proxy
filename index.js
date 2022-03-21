
const https = require('https');
const http = require('http');
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
    'https://www.xvideos.com',
    'https://www.instagram.com' //broken, to fix
]
let site2Proxy = sites[1];
let proxyOutsideSites = true;

function fetch(method, url, headers, body) {
	return new Promise(function(resolve, reject) {
        var newHeaders = {};
        if (headers) {
            for (var k in headers) {
                if (['upgrade-insecure-requests'].includes(k.toLowerCase()) || k.startsWith('x-')) {
                    continue;//todo-securely set cookies accross multiple sites
                }
                if (k === 'host') {
                    //newHeaders[k] = site2Proxy.split('://').pop();
                    continue;
                }
                if (k === 'cookie') {
                    var {hostname} = new URL(url);
                    var cookies = [];
                    var ck = headers[k].split(';');
                    for (var i=0; i<ck.length; i++)
                        if (ck[i].trim().split('_')[0].trim() === hostname) {
                            cookies.push(ck[i].trim().split(ck[i].split('_')[0]+'_').pop());
                    }
                    newHeaders[k] = cookies;
                    continue
                }
                if (k === 'accept-encoding') {
                    //todo
                    continue;
                }
                if (headers[k].includes('repl.co')) {
                    headers[k] = headers[k].replaceAll(headers[k].split('https://').pop().split('/')[0], site2Proxy.split('://').pop())
                }
                newHeaders[k] = headers[k];
            }
        }
        var protReq = url.startsWith('https:') ? https : http;
		var req = protReq.request(url, {method: method});
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
			res.on('end', function() {
				resolve([true, body.toString(), res.headers['content-type'], res.headers, res.statusCode])
			})
		})
        req.on('error', function(e) {
            reject(e);
        })
        req.end()
	})
}

function parseTextFile(body, isHtml) {
    //todo- only replace src urls
    body = body.replaceAll(site2Proxy+'/', '/').replaceAll(site2Proxy, '').replaceAll(site2Proxy.replaceAll('\\/', '/')+'/', '/').replaceAll(site2Proxy.replaceAll('\\/', '/'), '').replaceAll('discord', 'discordddd');
    if (!proxyOutsideSites) {
        return body;
    }
    if (isHtml) {
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
        return body.replaceAll('http://', '/http://').replaceAll('https://', '/https://').replaceAll('http:\\/\\/', '/http:\\/\\/').replaceAll('https:\\/\\/', '/https:\\/\\/');
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

function changeHtml(req, res) {
    if (req.url.includes('?')) {
        var args = transformArgs(req.url);
        if (args.site && sites.includes(decodeURIComponent(args.site))) {
            site2Proxy = decodeURIComponent(args.site);
            res.setHeader('location', '/');
            res.writeHead(307);
            res.end();
            return;
        }
    }
    res.setHeader('content-type', 'text/html; chartset=utf-8')
    var html = '';
    html += '<ul><br><h1>Change Site to Serve</h1><br><br><ul><form action="" method="GET">';
    for (var i=0; i<sites.length; i++) {
        html += '<input type="radio" id="'+encodeURIComponent(sites[i])+'" name="site" value="'+encodeURIComponent(sites[i])+'"><label for="'+encodeURIComponent(sites[i])+'">'+sites[i]+'</label><br>';
    }
    html += '<br><input type="submit" value="Submit"><ul></ul>'
    res.end(html)
}

var server = http.createServer(async function(req, res) {
    if (req.url.split('?')[0] === '/changeSiteToServe') {
        changeHtml(req, res);
        return;
    }
    if (! site2Proxy) {
        res.setHeader('location', '/changeSiteToServe');
        res.writeHead(307);
        res.end();
        return;
    }
    var url = req.url.startsWith('/http') ? req.url.substr(1) : site2Proxy+req.url;
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
        var body = await fetch(req.method, url, req.headers, reqBody)
    } catch(e) {
        res.writeHead(404);
        res.end('error');
        return;
    }
    for (var k in body[3]) {
        if (['content-length', 'transfer-encoding'].includes(k.toLowerCase())) {
            continue
        }
        if (k === 'set-cookie') {
            var {hostname} = new URL(url);
            if (Array.isArray(body[3][k])) {
                var cookies = [];
                for (var i=0; i<body[3][k].length; i++) {
                    cookies.push(hostname+'_'+body[3][k][i])
                }
                res.setHeader(k, cookies);
            } else {
                res.setHeader(k, hostname+'_'+body[3][k]);
            }
            continue;
        }
        if (typeof body[3][k] == 'string' && proxyOutsideSites) {
            res.setHeader(k, body[3][k].replaceAll(site2Proxy+'/', '/').replaceAll(site2Proxy, '').replaceAll('http', '/http'));
        } else {
            res.setHeader(k, body[3][k]);
        }
    }
    res.writeHead(body[4] || 200);
    if (body[0] === true) {
        //javascript/html parsing
        body = parseTextFile(body[1], body[2].includes('html'));
        res.end(body);
    } else {
        body[1].pipe(res);
    }
})
server.listen(process.env.PORT, () => {
    console.log('server started');
});
