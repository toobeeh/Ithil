// require packets
const app = require('express')();
const workerHttps = require('https');
const fs = require('fs');
const cors = require('cors');
const ipc = require('node-ipc');
const config = require("../ecosystem.config").config;
const palantirDb = require("../palantirDatabase");
import WebSocket, { WebSocketServer } from 'ws';

console.log(config);

// use cors
app.use(cors());
const dropServer = workerHttps.createServer({ // create server
    key: fs.readFileSync(config.certificatePath + '/privkey.pem', 'utf8'),
    cert: fs.readFileSync(config.certificatePath + '/cert.pem', 'utf8'),
    ca: fs.readFileSync(config.certificatePath + '/chain.pem', 'utf8')
}, app);
const wss = new WebSocketServer({ dropServer });
wss.on('connection', function connection(ws) {
    ws.on('message', function message(data) {
        console.log('received: %s', data);
    });

    ws.send('something');
});

dropServer.listen(config.dropPort);

