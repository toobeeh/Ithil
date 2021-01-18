
const server = require('http').createServer();
options = {
    cors: true,
    origins: ["*"],
}
const io = require('socket.io')(server, options);
io.on('connection', socket => { console.log('a user connected'); });
server.listen(3000);


