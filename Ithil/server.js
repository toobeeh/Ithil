var fs = require('fs');
var app = require('express')();
var https = require('https');
var options = {
    key: fs.readFileSync('/etc/letsencrypt/live/typo.rip/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/typo.rip/cert.pem'),
    ca: fs.readFileSync('/etc/letsencrypt/live/typo.rip/chain.pem'),
};
let server = https.createServer(options, function (req, res) {
    res.writeHead(200);
    res.end("hello world\n");
}).listen(3000);

var io = require('socket.io').listen(server);
io.on('connection', (socket) => {
    console.log('a user connected');
});