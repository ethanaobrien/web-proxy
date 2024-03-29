global.parseSetCookie = function(cookie, hostname, isAbsoluteProxy) {
    let cookieHeader;
    if (cookie.includes('Domain=')) {
        cookieHeader = cookie.split('Domain=').pop().split(';')[0];
        cookie = cookie.replaceAll('Domain='+cookie.split('Domain=').pop().split(';')[0]+';', '').replaceAll('  ', ' ');
    }
    if (!cookieHeader) {
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
    if (! cookie.startsWith('ck_') || isAbsoluteProxy) return cookie.trim();
    let parts = cookie.split('_'),
        httpOnly = parseInt(parts[1]),
        allowHost = parts[2],
        reqHost = new RegExp(allowHost);
    if (hostname.match(reqHost) !== null) {
        return cookie.replace('ck_'+parts[1]+'_'+parts[2]+'_', '').trim();
    }
    return null;
}

module.exports = function(method, url, headers, body, opts, reqHost, forceText) {
    return new Promise(function(resolve, reject) {
        let newHeaders = {};
        let {hostname} = new URL(url);
        if (headers) {
            for (const k in headers) {
                if (k.startsWith('x-replit') || k === 'accept-encoding' || k.startsWith('sec-')) {
                    continue;
                }
                if (k === 'cookie') {
                    let cookies = [];
                    let ck = headers[k].split(';');
                    for (let i=0; i<ck.length; i++) {
                        if (ck[i].includes('proxySettings')) {
                            continue;
                        }
                        let result = parseResCookie(ck[i], hostname, opts.isAbsoluteProxy);
                        if (result !== null) {
                            cookies.push(result);
                        }
                    }
                    newHeaders[k] = cookies.join('; ');
                    continue
                }
                if (headers[k].includes(reqHost)) {
                    headers[k] = headers[k].replaceAll(headers[k].split('https://').pop().split('/')[0], opts.site2Proxy.split('://').pop())
                }
                if (typeof headers[k] == 'string') {
                    newHeaders[k] = headers[k]
                        .replaceAll('/postGet', '/')
                        .replaceAll('/changeSiteToServe', '/');
                } else {
                    newHeaders[k] = headers[k];
                }
            }
        }
        newHeaders['host'] = hostname;
        let protReq = url.startsWith('https:') ? https : http;
        let req = protReq.request(url, {method: method});
        for (const k in newHeaders) {
            req.setHeader(k, newHeaders[k]);
        }
        if (body && !body.stream && body.data.byteLength !== 0) {
            req.setHeader('content-length', body.data.byteLength);
        } else if (body && body.stream && body.length) {
            req.setHeader('content-length', body.length);
        }
        req.on('response', async function(res) {
            if ((!res.headers['content-type'] ||
                !(res.headers['content-type'] &&
                 (res.headers['content-type'].includes('javascript') ||
                  res.headers['content-type'].includes('html') ||
                  res.headers['content-type'].includes('json') ||
                  res.headers['content-type'].includes('css') ||
                  res.headers['content-type'].includes('x-www-form-urlencoded')))) && forceText !== true) {
                resolve({
                    isString: false,
                    body: null,
                    res: res,
                    contentType: res.headers['content-type'],
                    headers: res.headers,
                    code: res.statusCode
                });
                return;
            }
            let body = await consumeBody(res);
            body = body.toString();
            resolve({
                isString: true,
                body: body,
                res: res,
                contentType: res.headers['content-type'],
                headers: res.headers,
                code: res.statusCode
            });
        })
        req.on('error', function(e) {
            reject(e);
        })
        if (body && !body.stream && body.data.byteLength !== 0) {
            req.write(body.data);
            req.end();
        } else if (body && body.stream) {
            body.data.pipe(req);
        }
    })
}
