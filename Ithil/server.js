'use strict';
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = 3000;
const host = "0.0.0.0";

http.listen({ host: host, port: port }, () => {
    console.log(`Listening on ${host}:${port}.`)
});

io.on("connection", (socket) => {
    console.log(`User connected: ${JSON.stringify(socket)}`);
    socket.on("disconnect", () => {
        console.log("He's gone.");
    });
});