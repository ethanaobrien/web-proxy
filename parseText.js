module.exports = function(body, contentType, opts, url, reqHost, proxyJSReplace) {
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
        .replaceNC('"'+site2Proxy+'/', '"'+startUrl+'/')
        .replaceNC("'"+site2Proxy+'/', '\''+startUrl+'/')
        .replaceNC("'"+site2Proxy, '\''+startUrl+'')
        .replaceNC('"'+site2Proxy, '"'+startUrl)
        .replaceNC("'"+site2Proxy.replaceNC('\\/', '/')+'/', '\'/')
        .replaceNC('"'+site2Proxy.replaceNC('\\/', '/')+'/', '"/')
        .replaceNC("'"+site2Proxy.replaceNC('\\/', '/'), '\'')
        .replaceNC('"'+site2Proxy.replaceNC('\\/', '/'), '"')
        .replaceNC(site2Proxy.split('://').pop(), reqHost)
        .replaceNC(site2Proxy.split('://').pop(), reqHost)
        .replaceNC("'"+hostname, "'"+reqHost)
        .replaceNC('"'+hostname, '"'+reqHost)
        .replaceNC("'"+hn2, "'"+reqHost)
        .replaceNC('"'+hn2, '"'+reqHost)
        .replaceNC('discord', 'discordddd')
        .replaceNC('wss://', 'wss://'+reqHost+'/')
        .replaceNC('integrity', 'integrityy')
        .replaceNC('crossorigin', 'sadfghjj')
        .replaceAll('magnet:?', '/torrentStream?stage=step1&magnet=')
        .replaceNC(btoa(site2Proxy+'/'), btoa('http://'+reqHost+'/'))
        .replaceAll('url(//', 'url(https://')
        .replaceNC(btoa(site2Proxy), btoa('http://'+reqHost));
    if (contentType.includes('html')) {
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
                !(a[i-1].replaceAll('"', '').replaceAll("'", '').replaceAll(' ', '').toLowerCase().endsWith('href='))) {
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
    } else if (contentType.includes('x-www-form-urlencoded')) {
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
                    c[k] = encodeURIComponent(decodeURIComponent(c[k]).replaceNC(hostname, h));
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
        body = body.replaceAll('http://', '/http:/').replaceAll('https://', '/https:/');
        if (contentType.includes('javascript') && !url.includes('worker')) {
            body+='\n!function(){if(void 0!==typeof window&&void 0!==typeof document&&!window.checkInterval){function t(t){try{t.startsWith("/")||new URL(t).hostname===window.location.hostname||(t="/"+t)}catch(e){!t.startsWith("/")&&t.startsWith("http")&&(t="/"+t)}return t}window.checkInterval=setInterval(function(){document.querySelectorAll("svg").forEach(t=>{t&&t.attributes&&t.attributes["aria-label"]&&t.attributes["aria-label"].textContent&&(t.innerHTML=t.attributes["aria-label"].textContent)})},200),window.fetch&&(window.fetch=(o=window.fetch,function(e,n){return n&&n.integrity&&delete n.integrity,o(t(e),n)})),window.XMLHttpRequest&&(window.XMLHttpRequest.prototype.open=(n=window.XMLHttpRequest.prototype.open,function(e,o,i,w,r){return n.apply(this,[e,t(o),i,w,r])})),window.WebSocket&&(window.WebSocket=(e=window.WebSocket,function(t,n){try{var{hostname:o}=new URL(t);!o===window.location.host&&(t=(n="https:"===window.location.protocol?"wss":"ws")+"://"+t)}catch(t){}return new e(t,n)}))}var e,n,o}();';
        }
        if (debug) {
            console.log('javascript parsing took '+(((new Date())-date)/1000)+' seconds');
        }
        return body.replaceAll('/https://', '/https://').replaceAll('/http://', '/https://')
    }
}

/*
(function() {
    if (typeof window !== undefined && typeof document !== undefined && !window.checkInterval) {
        window.checkInterval = setInterval(function() {
            document.querySelectorAll("svg").forEach(e => {
                if (e && e.attributes && e.attributes["aria-label"] && e.attributes["aria-label"].textContent) {
                    e.innerHTML = e.attributes["aria-label"].textContent
                }
            })
        }, 200);
        function fixUrl(url) {
            try {
                if (!url.startsWith('/')&&new URL(url).hostname !== window.location.hostname) {
                    url = '/'+url;
                }
            } catch(e) {
                if (!url.startsWith('/') && url.startsWith('http')) {
                    url = '/'+url;
                }
            }
            return url;
        }
        if (window.fetch) {
            window.fetch = (function(oldFetch) {
                return function(url, opts) {
                    if (opts && opts.integrity) delete opts.integrity;
                    return oldFetch(fixUrl(url), opts);
                }
            })(window.fetch);
        }
        if (window.XMLHttpRequest) {
            window.XMLHttpRequest.prototype.open = (function(oldOpen) {
                return function(method, url, c, d, e) {
                    return oldOpen.apply(this, [method, fixUrl(url), c, d, e]);
                }
            })(window.XMLHttpRequest.prototype.open);
        }
        if (window.WebSocket) {
            window.WebSocket = (function(oldSocket) {
                return function(url, prot) {
                    try {
                        var {hostname} = new URL(url);
                        if (!hostname === window.location.host) {
                            var prot = (window.location.protocol === 'https:') ? 'wss' : 'ws';
                            url = prot+'://'+url;
                        }
                    } catch(e) {}
                    return new oldSocket(url, prot);
                }
            })(window.WebSocket)
        }
    }
})();

*/
