let port = 3000;
const useHTTPS = false;
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
const forge = require('node-forge');
function createCrypto() {
    let data = { }
    let cn = "WebServerForChrome" + (new Date()).toISOString();
    console.log('Generating 1024-bit key-pair and certificate for \"' + cn + '\".');
    let keys = forge.pki.rsa.generateKeyPair(1024);
    console.log('key-pair created.');
    let cert = forge.pki.createCertificate();
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
    const attrs = [{
        name: 'commonName',
        value: cn
    }, {
        name: 'countryName',
        value: 'US'
    }, {
        shortName: 'ST',
        value: 'test-st'
    }, {
        name: 'localityName',
        value: 'Simple Web Server'
    }, {
        name: 'organizationName',
        value: 'Simple Web Server'
    }, {
        shortName: 'OU',
        value: 'WSC'
    }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([{
        name: 'basicConstraints',
        cA: true
    }, {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true
    }, {
        name: 'subjectAltName',
        altNames: [{
            type: 6, // URI
            value: 'http://localhost'
        }]
    }]);
    // FIXME: add subjectKeyIdentifier extension
    // FIXME: add authorityKeyIdentifier extension
    cert.publicKey = keys.publicKey;

    // self-sign certificate
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // save data
    data = {
        cert: forge.pki.certificateToPem(cert),
        privateKey: forge.pki.privateKeyToPem(keys.privateKey)
    };
    return data;
    console.log('certificate created for \"' + cn + '\": \n');
};

const main = require('./main.js');
let server;
if (useHTTPS) {
    const crypto = createCrypto();
    server = require('https').createServer({key: crypto.privateKey, cert: crypto.cert});
} else {
    server = require('http').createServer();
}
server.on('request', function(req, res) {
    main.onRequest(req, res, {debug:true, allowAdultContent:true, yt:true, torrent:true, forceSite});
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
    console.log('Listening on '+(useHTTPS?'https:':'http:')+'//0.0.0.0:'+port+'/');
})
function tryListen() {
    console.log('trying to listen on port '+port);
    server.listen(port, '0.0.0.0');
}
server.on('error', function(e) {
    if (e.code === 'EADDRINUSE') {
        console.log('failed to listen on port '+port);
        port++;
        tryListen();
    }
})
tryListen();
