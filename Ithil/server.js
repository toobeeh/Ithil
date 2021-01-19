var fs = require('fs');
var app = require('express')();
var https = require('https');
let server = https.createServer({
    key: fs.readFileSync('/etc/letsencrypt/live/typo.rip/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/typo.rip/cert.pem')
}, app);

var io = require('socket.io').listen(server);
io.on('connection', (socket) => {
    console.log('a user connected');
});