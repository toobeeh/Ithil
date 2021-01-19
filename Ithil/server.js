var fs = require('fs');
var app = require('express')();
var https = require('https');
var server = https.createServer({
    key: fs.readFileSync('/etc/letsencrypt/live/typo.rip/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/typo.rip/cert.pem'),
    ca: fs.readFileSync('/etc/letsencrypt/live/typo.rip/chain.pem'),
    requestCert: false,
    rejectUnauthorized: false
}, app);
server.listen(3000);

var io = require('socket.io').listen(server);
io.on('connection', (socket) => {
    console.log('a user connected');
});