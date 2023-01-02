module.exports = function(server) {
    server.on('upgrade', function(req, socket, head) {
        if (head && head.length) socket.unshift(head);
        socket.setTimeout(0);
        socket.setNoDelay(true);
        socket.setKeepAlive(true, 0);
        let newHeaders = {};
        let {hostname,pathname,search} = new URL('wss:/'+req.url);
        let headers = req.headers;
        let opts = getOpts(req.headers.cookie);
        if (headers) {
            for (let k in headers) {
                if (k.startsWith('x-replit') || k === 'accept-encoding') {
                    continue;
                }
                if (k === 'cookie') {
                    let cookies = [];
                    let ck = headers[k].split(';');
                    for (let i=0; i<ck.length; i++) {
                        if (ck[i].includes('proxySettings')) {
                            continue;
                        }
                        let a = parseResCookie(ck[i], hostname, opts.isAbsoluteProxy);
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
        let origin = '';
        if (req.headers.cookie && req.headers.cookie.includes('proxySettings=')) {
            origin = opts.site2Proxy;
        }
        newHeaders['origin'] = origin;
        let proxyReq = https.request('https:/'+req.url);
        for (let k in newHeaders) {
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
}
