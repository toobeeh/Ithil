/*
 * Ithil Worker Server
 * - public socketio endpoint to serve typo client connection
 *   data exchange, drops, image storing
 * - connects to internal socketio coordination server
 *   gets drops & shared data
 */
const config = {
    masterPort: 4000,
    coordinationPort: 3999,
    publicPort: 4001,
    workerRange: [4002, 4010],
    minAvailableWorker: 7,
    certificatePath: '/etc/letsencrypt/live/typo.rip'
}

// require packets
const app = require('express')();
const workerHttps = require('https');
const fs = require('fs');
const cors = require('cors');
const palantirDb = require("./palantirDatabase");
const tynt = require("tynt");
const portscanner = require('portscanner');
const ipc = require('node-ipc');

// logging function
const logState = (msg) => { console.log(tynt.BgWhite(tynt.Blue(msg))); }
const logLoading = (msg) => { console.log(tynt.Cyan(msg)); }

// wrap everything else after port was found
portscanner.findAPortNotInUse(config.workerRange[0], config.workerRange[1], '127.0.0.1', function (error, port) {
    if (error) {
        logState("No free port found - exiting worker process");
        process.exit(1);
    }
    const workerPort = port;
    logState("Ithil Worker Server - Starting on port " + workerPort);

    // start worker server with cors and ssl
    logLoading("Starting worker endpoint");
    app.use(cors());
    const workerServer = workerHttps.createServer({ // create server
        key: fs.readFileSync(config.certificatePath + '/privkey.pem', 'utf8'),
        cert: fs.readFileSync(config.certificatePath + '/cert.pem', 'utf8'),
        ca: fs.readFileSync(config.certificatePath + '/chain.pem', 'utf8')
    },app);
    const workerSocket = require('socket.io')(workerServer, { // start worker worker server
        cors: {
            origin: "*",
            methods: ["GET", "POST", "OPTIONS"],
            credentials: false
        },
        pingTimeout: 20000
    });
    workerServer.listen(workerPort); // start listening on master worker port
    logLoading("Initiating worker socket connection event");
    workerSocket.on("connection", async (socket) => {
        logState("Client connected!");
    });
    setTimeout(() => process.send("ready"), 1000);

    // connect to coordination ipc server
    ipc.config.id = 'worker' + workerPort;
    ipc.config.retry = 1500;
    ipc.config.logDepth = 1;
    ipc.connectTo("coord", () => {
        ipc.of.coord.on("connect", () => {
            logState("connected to coord");
            ipc.of.coord.emit("workerConnect", { port: workerPort });
        });

    });
});


