// require packets
const app = require('express')();
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const typoSocket = require("./typoSocket");

// use cors
app.use(cors());

// path to certs
const path = '/etc/letsencrypt/live/typo.rip';
// create server
const server = https.createServer({
    key: fs.readFileSync(path + '/privkey.pem', 'utf8'),
    cert: fs.readFileSync(path + '/cert.pem', 'utf8'),
    ca: fs.readFileSync(path + '/chain.pem', 'utf8')
}, app);
// start listeningn port 3000
server.listen(3000, function () {
    console.log('listening on *:3000');
});
// io client with cors allowed
var io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"]
    }
});

// testing connection
io.on('connection', function (socket) {
    console.log('Connected socket');
    let typosck = new typoSocket(socket);
});