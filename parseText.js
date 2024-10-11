module.exports = function(body, contentType, opts, url, reqHost, proxyJSReplace, optz) {
    let {site2Proxy,replaceExternalUrls} = opts;
    let funcString = `
(function() {
    if (typeof window !== "undefined") {
        window.addEventListener("DOMContentLoaded", function() {
            const registerServiceWorker = async () => {
                if ("serviceWorker" in navigator) {
                    console.log("Attempting to register service worker");
                    try {
                        const registration = await navigator.serviceWorker.register("/worker.js?proxyWorker=true");
                        if (registration.installing) {
                            console.log("Service worker installing");
                        } else if (registration.waiting) {
                            console.log("Service worker installed");
                        } else if (registration.active) {
                            console.log("Service worker active");
                        }
                    } catch (error) {
                        console.log("failed to start service worker", e);
                    }
                }
            };
            if (window.checkInterval) return;
            registerServiceWorker();
            window.checkInterval = setInterval(function() {
                document.querySelectorAll("svg").forEach(e => {
                    if (e && e.attributes && e.attributes["aria-label"] && e.attributes["aria-label"].textContent) {
                        e.innerHTML = e.attributes["aria-label"].textContent
                    }
                })
            }, 200);
            function fixUrl(url) {
                console.log("fixurl: ", url);
                if (new URL(url).pathname.startsWith("/http")) return url;
                try {
                    if (!url.startsWith('/') && new URL(url).hostname !== window.location.hostname && ["http", "https"].includes(new URL(url).protocol)) {
                        url = '/'+url;
                    }
                } catch(e) {
                    if (url.startsWith('http')) {
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
                            let {hostname} = new URL(url);
                            if (!hostname === window.location.host) {
                                let prot = (window.location.protocol === 'https:') ? 'wss' : 'ws';
                                url = prot+'://'+url;
                            }
                        } catch(e) {}
                        return new oldSocket(url, prot);
                    }
                })(window.WebSocket)
            }
        })
    }
})();`;
    let date = new Date(),
        origBody = body,
        hn2 = new URL(url).hostname,
        hostname = new URL(site2Proxy).hostname,
        startWithSite = ((new URL(url)).hostname !== hostname),
        startUrl = '';
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
        .replaceNC("'"+site2Proxy.split('://').pop(), "'"+reqHost)
        .replaceNC('"'+site2Proxy.split('://').pop(), '"'+reqHost)
        .replaceNC("'"+hostname, "'"+reqHost)
        .replaceNC('"'+hostname, '"'+reqHost)
        .replaceNC("'"+hn2, "'"+reqHost)
        .replaceNC('"'+hn2, '"'+reqHost)
        .replaceNC('wss://', 'wss://'+reqHost+'/')
        .replaceNC('integrity', 'integrityy')
        .replaceNC('crossorigin', 'sadfghjj')
        .replaceAll('magnet:?', '/torrentStream?magnet=')
        .replaceNC(btoa(site2Proxy+'/'), btoa('https://'+reqHost+'/'))
        .replaceAll('url(//', 'url(https://')
        .replaceNC(btoa(site2Proxy), btoa('https://'+reqHost));
    if (contentType.includes('html')) {
        let a = body.split('src');
        for (let i=1; i<a.length; i++) {
            if (a[i].replaceAll(' ', '').replaceAll('"', '').replaceAll("'", '').trim().startsWith('=//')) {
                a[i] = a[i].replace('//', 'https://');
            }
            if (startUrl && a[i].replaceAll('=', '').replaceAll('"', '').replaceAll("'", '').trim().startsWith('/')) {
                a[i] = a[i].replace('/', startUrl+'/');
            }
        }
        body = a.join('src');
        a = body.split('//');
        for (let i=1; i<a.length; i++) {
            if ((a[i-1].endsWith('"') || a[i-1].endsWith("'")) &&
                (a[i].split('\n')[0].includes('"') || a[i].split('\n')[0].includes("'"))) {
                a[i-1]+='https:';
            }
        }
        body = a.join('//');
        a = body.split('http');
        for (let i=1; i<a.length; i++) {
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
        a = body.split('href');
        for (let i=1; i<a.length; i++) {
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
        if (optz.debug) {
            console.log('html parsing took '+(((new Date())-date)/1000)+' seconds');
        }
        body = '<script>'+funcString+'</script>\n'+body;
        return body
            .replaceAll('/https://', '/https:/')
            .replaceAll('/http://', '/https:/')
            .replaceAll('/http:/www.w3.org/', 'http://www.w3.org/')
            .replaceAll('/https:/www.w3.org/', 'https://www.w3.org/');
    } else if (contentType.includes('x-www-form-urlencoded')) {
        let h = new URL(url).hostname;
        hostname = new URL(site2Proxy).hostname;
        let a = body.split('&')
        let changed = false;
        for (let i=0; i<a.length; i++) {
            let b = a[i].split('=');
            for (let j=0; j<b.length; j++) {
                let c = b[j].split('+');
                for (let k=0; k<c.length; k++) {
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
        if (optz.debug) {
            console.log('url encoded parsing took '+(((new Date())-date)/1000)+' seconds');
        }
        return body
            .replaceAll('/http:/www.w3.org/', 'http://www.w3.org/')
            .replaceAll('/https:/www.w3.org/', 'https://www.w3.org/');
    } else {
        if (proxyJSReplace) {
            let a = body.split('//');
            for (let i=1; i<a.length; i++) {
                if ((a[i-1].endsWith('"') && !a[i].split('"')[0].includes(' ')) ||
                    (a[i-1].endsWith("'") && !a[i].split("'")[0].includes(' '))) {
                    a[i-1]+='https:';
                }
            }
            body = a.join('//');
        }
        body = body.replaceAll('http://', '/http:/').replaceAll('https://', '/https:/');
        if (contentType.includes('javascript') && !url.includes('worker')) {
            body = body + "\n" + funcString;
        }
        if (optz.debug) {
            console.log('javascript parsing took '+(((new Date())-date)/1000)+' seconds');
        }
        return body
            .replaceAll('/https://', '/https://')
            .replaceAll('/http://', '/https://')
            .replaceAll('/http:/www.w3.org/', 'http://www.w3.org/')
            .replaceAll('/https:/www.w3.org/', 'https://www.w3.org/');
    }
}
