var app = require('express')();
var https = require('https');
var fs = require('fs');
const cors = require('cors');
app.use(cors());
// path to certs
var path = '/etc/letsencrypt/live/typo.rip';
// create server
var server = https.createServer({
    key: fs.readFileSync(path + '/privkey.pem', 'utf8'),
    cert: fs.readFileSync(path + '/cert.pem', 'utf8'),
    ca: fs.readFileSync(path + '/chain.pem', 'utf8')
}, app);
// start listening
server.listen(3000, function () {
    console.log('listening on *:3000');
});
// io client
var io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"]
    }
});

// testing connection
io.on('connection', function (socket) {
    console.log('connected');
    socket.on('test', function (data) {
        socket.emit('ackmessage', {
            'msg': 'data',
            'key': '222'
        });
    });
});