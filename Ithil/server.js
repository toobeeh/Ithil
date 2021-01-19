var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
server.listen(8000);
console.log('Server started at port: 8000');