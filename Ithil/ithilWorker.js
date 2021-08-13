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
portscanner.findAPortNotInUse(config.workerRange[0], config.workerRange[1], '127.0.0.1', async (error, port) => {
    if (error) {
        logState("No free port found - exiting worker process");
        process.exit(1);
    }
    const workerPort = port;
    logState("Ithil Worker Server - Starting on port " + workerPort);

    // connect to coordination ipc server
    logState("Connecting to oordination IPC...");
    ipc.config.id = 'worker' + workerPort;
    ipc.config.retry = 1500;
    ipc.config.silent = true;
    const { on, emit } = await new Promise(resolve => {
        ipc.connectTo("coord", () => {
            ipc.of.coord.on("connect", () => {
                const on = (event, callback) => ipc.of.coord.on(event, callback);
                const emit = (event, data) => ipc.of.coord.emit(event, data);
                emit("workerConnect", { port: workerPort });
                logState("...done.");
                resolve({ on, emit });
            });
        });
    });

    // start worker server with cors and ssl
    logLoading("Starting worker socket endpoint with CORS & SSL");
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
    let sockets = [];
    workerSocket.on("connection", async (socket) => {
        sockets.push(socket.id);
        socket.on("disconnect", () => {
            sockets = sockets.filter(conn => conn.id != socket.id);
            logState("Disconnected client on port " + workerPort);
            emit("updatePortBalance", { port: workerPort, clients: sockets.length });
        });
        logState("New client on port " + workerPort);
        emit("updatePortBalance", { port: workerPort, clients: sockets.length });
    });
    setTimeout(() => process.send("ready"), 500);

    
});


