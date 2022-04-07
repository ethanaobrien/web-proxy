global.parseSetCookie = function(cookie, hostname, isAbsoluteProxy) {
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

global.parseResCookie = function(cookie, hostname, isAbsoluteProxy) {
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

module.exports = function(method, url, headers, body, opts, reqHost) {
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
