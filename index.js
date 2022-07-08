
let port = 3000;
if (process.env.PORT) {
    port = process.env.PORT;
}
if (process.argv.includes('--port')) {
    port = process.argv[process.argv.indexOf('--port')+1];
}
let forceSite = '';
if (process.env.FORCE_SITE && typeof process.env.FORCE_SITE == 'string') {
    forceSite = process.env.FORCE_SITE
}
if (process.argv.includes('--site')) {
    forceSite = process.argv[process.argv.indexOf('--site')+1];
}

var main = require('./main.js');
var server = require('http').createServer(function(req, res) {
    main.onRequest(req, res, {debug:false, allowAdultContent:true, yt:true, torrent:true, forceSite});
});
main.onStart(server);

server.on('clientError', function (err, socket) {
    if (err.code === 'ECONNRESET' || !socket.writable) {
        return;
    }
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
server.on('listening', function() {
    console.log('listening on port '+port);
})
function tryListen() {
    console.log('trying to listen on port '+port);
    server.listen(port);
}
server.on('error', function(e) {
    if (e.code === 'EADDRINUSE') {
        console.log('failed to listen on port '+port);
        port++;
        tryListen();
    }
})
tryListen();
