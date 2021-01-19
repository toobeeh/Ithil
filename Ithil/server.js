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
var io = require('socket.io')(server);

// testing connection
io.on('connection', function (socket) {
    socket.on('test', function (data) {
        socket.emit('ackmessage', {
            'msg': 'data',
            'key': '222'
        });
        console.log('connected');
    });
});