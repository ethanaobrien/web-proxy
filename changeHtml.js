module.exports = async function(req, res) {
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
