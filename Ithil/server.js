const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    handlePreflightRequest: (req, res) => {
        res.writeHead(200, {
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
        });
        res.end();
    }
});

//app.get('/', (req, res) => {
//    res.sendFile(__dirname + '/index.html');
//});

io.on('connection', (socket) => {
    console.log('a user connected');
});

http.listen(3000, () => {
    console.log('listening on *:3000');
});