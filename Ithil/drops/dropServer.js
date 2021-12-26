"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// require packets
var app = require('express')();
var workerHttps = require('https');
var fs = require('fs');
var cors = require('cors');
var ipc = require('node-ipc');
var config = require("../ecosystem.config").config;
var palantirDb = require("../palantirDatabase");
var ws_1 = require("ws");
console.log(config);
// use cors
app.use(cors());
var dropServer = workerHttps.createServer({
    key: fs.readFileSync(config.certificatePath + '/privkey.pem', 'utf8'),
    cert: fs.readFileSync(config.certificatePath + '/cert.pem', 'utf8'),
    ca: fs.readFileSync(config.certificatePath + '/chain.pem', 'utf8')
}, app);
var wss = new ws_1.WebSocketServer({ dropServer: dropServer });
wss.on('connection', function connection(ws) {
    ws.on('message', function message(data) {
        console.log('received: %s', data);
    });
    ws.send('something');
});
dropServer.listen(config.dropPort);
//# sourceMappingURL=dropServer.js.map