'use strict';
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = 3000;

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS");
    next();
});

http.listen(port, () => {
    console.log(`Listening on port:${port}.`)
});

io.of("/socket.io").on("connection", (socket) => {
    console.log(`sio User connected: ${JSON.stringify(socket)}`);
    socket.on("disconnect", () => {
        console.log("He's gone.");
    });
});
io.of("/nodejs").on("connection", (socket) => {
    console.log(`njs User connected: ${JSON.stringify(socket)}`);
    socket.on("disconnect", () => {
        console.log("He's gone.");
    });
});
io.on("connection", (socket) => {
    console.log(`User connected: ${JSON.stringify(socket)}`);
    socket.on("disconnect", () => {
        console.log("He's gone.");
    });
});