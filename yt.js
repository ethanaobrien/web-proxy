async function yt(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method.toLowerCase() === 'post') {
        body = await consumeBody(req);
        body = body.toString();
        args = transformArgs('?'+body);
    } else {
        args = transformArgs(req.url);
    }
    if (!args.video) {
        const html = '<html><head><title>Youtube Downloader</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><ul><br><h1>Youtube Downloader</h1><ul><form action="" method="POST" autocomplete="off"><br><label for="video">Youtube Link: </label><input type="text" id="video" name="video"><br><br><input type="submit" value="Submit"></form><ul></ul></body></html>';
        end(html, res, 'text/html; chartset=utf-8');
        return;
    }
    let result;
    try {
        result = await ytdl(args.video);
    } catch(e) {
        end('Error getting video urls', res);
        return;
    }
    if (args.json) {
        end(JSON.stringify(result), res, 'application/json');
        return;
    }
    let {urls,video,audio,videoTitle} = result;
    let html = '<html><head><title>Youtube Downloader</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><ul><br><h1>YouTube Downloader</h1>\n<ul><h2>Title: ' + videoTitle + '</h2>\n';
    for (let i=0; i<urls.length; i++) {
        html += '<p>Quality: ' +urls[i].qualityLabel + '; fps: ' + urls[i].fps + '; Mimetype: ' +urls[i].mimeType.split(';')[0] + '; Url: <a target="_blank" href="' + urls[i].url + '">Open</a> <a target="_blank" href="' + urls[i].url + '&title=' +
videoTitle.replaceAll(' ', '+') + '">Download</a></p>\n';
    };
    html += '\n<h2>No Audio</h2><ul>';
    for (let i=0; i<video.length; i++) {
        html += '<p>Quality: ' + video[i].qualityLabel + '; fps: ' + video[i].fps + '; Mimetype: ' + video[i].mimeType.split(';')[0] + '; Url: <a target="_blank" href="' + video[i].url + '">Open</a></p>\n';
    };
    html += '</ul>\n<h2>Only Audio</h2><ul>';
    for (let i=0; i<audio.length; i++) {
        html += '<p>Bitrate: ' + audio[i].bitrate + '; Mimetype: ' + audio[i].mimeType.split(';')[0] + '; Url: <a target="_blank" href="' + audio[i].url + '">Open</a></p>\n';
    };
    html += '</ul></ul></ul></body></html>';
    end(html, res, 'text/html; chartset=utf-8');
}

module.exports = yt;
