function getStage(args) {
    if (args.download==='1'&&args.zip==='1') return "dlAsZip";
    if (args.fileIndex||args.fileName) return "step2";
    return "step1";
}

module.exports = async function(req, res) {
    //https://ogp.me
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeContinue();
    if (req.url.includes("magnet:?")) {
        redirect(req.url.split('magnet:?')[0]+'magnet='+encodeURIComponent(req.url.split('magnet:?').pop()), res, 301);
        return;
    }
    if (!req.url.includes('magnet=')) {
        res.writeHeader(400);
        res.end('invalid request');
        return;
    }
    if (req.url.split('magnet=').pop().split('&')[0].includes('=')) {
        redirect(req.url.split('magnet=')[0]+'magnet='+encodeURIComponent(req.url.split('magnet=').pop()), res, 301);
        return;
    }
    
    let args = transformArgs(req.url);
    
    let magnet = encodeURIComponent(args.magnet);
    let engine;
    try {
        engine = torrentStream('magnet:?'+args.magnet);
    } catch(e) {
        res.end('error getting torrent metedata');
        return;
    }
    let ready = setTimeout(function() {
        engine.destroy();
        end('Timeout getting torrent metedata', res, undefined, 500);
    }, 20000);
    await new Promise(resolve => engine.on('ready', resolve));
    clearTimeout(ready);
    
    let files = engine.files;
    for (let i=0; i<files.length; i++) files[i].path=files[i].path.replaceAll('\\', '/');
    const torrentName = engine.torrent.name;
    let stage = getStage(args);
    
    if (stage === "step1") {
        let html = '<html><head><meta property="og:title" content="'+torrentName+'">';
        let cover = getFolderImage(files, magnet);
        if (cover) {
            html += '<meta property="og:image" content="'+cover.path+'"><meta property="og:image:url" content="'+cover.path+'"><meta property="og:image:type" content="'+cover.mime+'">';
        }
        html += '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Download</title></head><body><br><ul><h1>Download</h1><br>';
        html += generateTorrentTree(files, magnet);
        html += '<br>'
        let downloadUrl2 = '/torrentStream?download=1&zip=1&magnet='+magnet;
        html += '<br><a style="text-decoration:none" href="'+downloadUrl2+'">Download All As Zip</a></ul><br></body></html>';
        engine.destroy();
        end(html, res, 'text/html; chartset=utf-8');
    } else if (stage === 'step2') {
        let fileName = args.fileName;
        let file;
        for (let i=0; i<files.length; i++) {
            if (files[i].path === fileName) {
                file = files[i];
                break;
            }
        }
        if (!file && !isNaN(args.fileIndex)) {
            let i = parseInt(args.fileIndex);
            if (files[i]) file = files[i];
            if (files[i]) fileName = file.path;
        }
        if (! file) {
            end('error finding file', res, undefined, 500);
            engine.destroy();
            return;
        }
        let ct = MIMETYPES[file.name.split('.').pop()].split('/')[0];
        if (args.stream === 'on') {
            let downloadUrl = '/torrentStream?fileName='+encodeURIComponent(file.path)+'&magnet='+magnet;
            let tagName = ['video', 'audio'].includes(ct) ? ct : ('image' === ct ? 'img' : 'iframe');
            let html = '<html><head><meta property="og:title" content="'+file.name+'">';
            if (['image', 'video', 'audio'].includes(ct)) {
                html += '<meta property="og:'+ct+'" content="'+downloadUrl+'"><meta property="og:'+ct+':url" content="'+downloadUrl+'"><meta property="og:'+ct+':type" content="'+MIMETYPES[file.name.split('.').pop()]+'">';
            }
            if (ct === 'video') {
                let cover = getFolderImage(files, magnet, fileName);
                if (cover) {
                    html += '<meta property="og:image" content="'+cover.path+'"><meta property="og:image:url" content="'+cover.path+'"><meta property="og:image:type" content="'+cover.mime+'">';
                }
            }
            html += '<style>.nb{text-decoration:none;display:inline-block;padding:8px 16px;border-radius:12px;transition:0.35s;color:black;}.previous{background-color:#00b512;}.previous:hover{background-color:#ee00ff;}.next{background-color:#ffa600;}.next:hover{background-color:#0099ff;}</style><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+file.name+'</title></head><body><br><br><br><center>';
            let cover = getFolderImage(files, magnet, fileName);
            if (cover && ct === 'audio') {
                html += '<img style="object-fit:contain;width:25%;height:40%;" src="'+cover.path+'"><br><br>';
            }
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
            let nb = getConcurentFiles(file.path, files, magnet);
            if (['video', 'audio'].includes(ct)) {
                html += '<script>let element = document.getElementById("element");let errCt=0;function err(e){if(errCt>25){return};errCt++;let a=element.src;element.src=a;element.play()};element.addEventListener("abort", err);element.addEventListener("error", err);element.play();';
                if (nb && nb[1]) {
                    let name = transformArgs(nb[1]).fileName;
                    if (name && MIMETYPES[name.split('.').pop()] && ['audio', 'video'].includes(MIMETYPES[name.split('.').pop()].split('/')[0])) {
                        html += 'element.addEventListener("ended", function(e) {document.getElementById("next").click()});'
                    }
                }
                html += '</script>';
            }
            html += '<h2>'+file.name+'</h2><br>';
            if (nb) {
                if (nb[0]) {
                    html += '<a href="'+nb[0]+'" class="previous nb">&laquo; Previous</a>';
                }
                if (nb[0] && nb[1]) {
                    html += ' ';
                }
                if (nb[1]) {
                    html += '<a href="'+nb[1]+'" class="next nb" id="next">Next &raquo;</a>';
                }
            }
            html += '</center><br><ul>';
            html += generateTorrentTree(files, magnet);
            html += '</ul><br><br></body></html>';
            end(html, res, 'text/html; chartset=utf-8');
            return;
        }
        res.setHeader('content-length', file.length);
        res.setHeader('accept-ranges','bytes');
        if (MIMETYPES[file.name.split('.').pop()]) {
            res.setHeader('content-type', MIMETYPES[file.name.split('.').pop().toLowerCase()]);
        }
        let fileOffset, fileEndOffset;
        if (args.download === '1') {
            res.setHeader('Content-Disposition', 'attachment; filename="'+encodeURIComponent(fileName)+'"');
        } else {
            res.setHeader('Content-Disposition', 'inline; filename="'+encodeURIComponent(fileName)+'"');
        }
        let code;
        if (req.headers['range']) {
            console.log('range request');
            let range = req.headers['range'].split('=')[1].trim();
            let rparts = range.split('-');
            if (! rparts[1]) {
                fileOffset = parseInt(rparts[0]);
                fileEndOffset = file.length - 1;
                res.setHeader('content-length', file.length-fileOffset);
                res.setHeader('content-range','bytes '+fileOffset+'-'+(file.length-1)+'/'+file.length);
                code = ((fileOffset === 0) ? 200 : 206);
            } else {
                fileOffset = parseInt(rparts[0]);
                fileEndOffset = parseInt(rparts[1])
                res.setHeader('content-length', fileEndOffset - fileOffset + 1);
                res.setHeader('content-range','bytes '+fileOffset+'-'+(fileEndOffset)+'/'+file.length)
                code = 206;
            }
        } else {
            fileOffset = 0;
            fileEndOffset = file.length - 1;
            code = 200;
        }
        res.writeHead(code);
        let stream = file.createReadStream({start: fileOffset,end: fileEndOffset});
        stream.pipe(res);
        stream.on('finish', function() {
            engine.destroy();
        })
        req.on("close", function() {
            engine.destroy();
        })
    } else if (stage === 'dlAsZip') {
        let zip = new JSZip();
        for (let i=0; i<files.length; i++) {
            if (args.directory2DL && !files[i].path.startsWith(args.directory2DL)) {
                continue;
            }
            zip.file(files[i].path, files[i].createReadStream())
        }
        res.setHeader('content-type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="'+encodeURIComponent(torrentName+'.zip')+'"');
        res.writeHead(200);
        let stream = zip.generateNodeStream({streamFiles:true});
        stream.pipe(res);
        stream.on('finish', function() {
            engine.destroy();
        })
        req.on("close", function() {
            engine.destroy();
        })
    } else {
        end('Invalid request', res, undefined, 400);
        engine.destroy();
    }
}
