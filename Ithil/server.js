app = require('express');
const io = require('socket.io')({ transports: ['websocket'] });
io.on('connection', socket => { console.log('a user connected'); });
app.listen(3000);


