/*
 * Ithil Master Server
 * - public socketio endpoint to redirect to Ithil Master Server
 *   redirect point depending on load balance
 * - internal socketio endpoint to coordinate Ithil Workers
 *   keeps track of drops, data & load balance
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
const masterExpress = require('express')();
const masterHttps = require('https');
const fs = require('fs');
const cors = require('cors');
const palantirDb = require("./palantirDatabase");
const tynt = require("tynt");
const ipc = require('node-ipc');
const portscanner = require('portscanner');

// logging function
const logState = (msg) => { console.log(tynt.BgWhite(tynt.Blue(msg))); }
const logLoading = (msg) => { console.log(tynt.Cyan(msg)); }
logState("owo owo owo || Ithil Master Server || owo owo owo");

// balancing object
balancer = {
    workers: [],
    queue: [],
    addWorker: (port, socket) => {
        // add worker to list
        balancer.workers.push({ port: port, socket: socket, clients: 0 });
        // resolve queues if present
        if (balancer.workers.length >= config.minAvailableWorker) { balancer.queue.forEach(resolve => resolve()); balancer.queue = [] };
        logState("New Ithil Worker online on port " + port);
    },
    removeWorker: (port) => {
        balancer.workers.splice(balancer.workers.findIndex(worker => worker.port == port), 1); // remove worker
        logState("Ithil Worker disconnected on port " + port);
    },
    updateOnlineWorker: () => [...balancer.workers].forEach(worker => 
        portscanner.checkPortStatus(worker.port, "127.0.0.1", (error, status) =>
            status == "closed" ? balancer.removeWorker(worker.port) : 1)),
    updateClients: (port, clients) => balancer.workers.find(worker => worker.port == port).clients = clients,
    getBalancedWorker: async () => {
        await new Promise((resolve, reject) => { // wait until minimum of workers are online
            if (balancer.workers.length < config.minAvailableWorker) balancer.queue.push(resolve);
            else resolve();
        });
        return balancer.workers.sort((a, b) => a.clients - b.clients)[0]; // return worker with fewest clients
    },
    currentBalancing: () => balancer.workers.map(worker => `${worker.clients}@:${worker.port}`).join(", ")
}

// start public server with cors & ssl
logLoading("Starting public endpoint with CORS & SSL");
masterExpress.use(cors()); // use cors
const masterServer = masterHttps.createServer({ // create server
    key: fs.readFileSync(config.certificatePath + '/privkey.pem', 'utf8'),
    cert: fs.readFileSync(config.certificatePath + '/cert.pem', 'utf8'),
    ca: fs.readFileSync(config.certificatePath + '/chain.pem', 'utf8')
}, masterExpress);
masterServer.listen(config.masterPort); // start listening on master worker port
const masterSocket = require('socket.io')(masterServer, { // start socket master server
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"]
    },
    pingTimeout: 20000
});
logLoading("Initiating master socket connection event");
masterSocket.on('connection', async (socket) => { // on socket connect, get free balance 
    socket.on("request port", async (data) => {
        let port = config.publicPort;
        if (data.auth === "member") port = (await balancer.getBalancedWorker()).port; // get balanced port if client wants to login
        socket.emit("balanced port", { port: port }); // send balanced port
        socket.disconnect(); // disconnect from client
        logState("Balancing: " + balancer.currentBalancing());
        console.log("Sent client to port " + port);
    });
    setTimeout(() => socket.connected ? socket.disconnect() : 1, 5*60*1000); // socket has max 5 mins idling to request port
});

// init shared data
class SharedData {
    constructor(database, ipcBroadcast) {
        // refresh active lobbies every 4 seconds 
        this.db = database;
        this.activeLobbies = [];
        this.publicData = { onlineSprites: [], drops: [], sprites: [] };
        const refreshLobbies = () => {
            let refreshedLobbies = this.db.getActiveLobbies();
            // if database request is valid
            if (refreshedLobbies.valid) {
                // if data has changed
                if (JSON.stringify(this.activeLobbies) != JSON.stringify(refreshedLobbies.lobbies))
                    ipcBroadcast("activeLobbies", this.activeLobbies);
                this.activeLobbies = refreshedLobbies.lobbies;
            }
        }
        refreshLobbies();
        setInterval(refreshLobbies, 3000);
        // refresh sprites all 10s
        const refreshPublic = () => {
            let refreshedPublic = this.db.getPublicData();
            // if database request is valid 
            if (refreshedPublic.valid) {
                // if data has changed
                if (JSON.stringify(refreshedPublic.publicData.onlineSprites) != JSON.stringify(this.publicData.onlineSprites))
                    ipcBroadcast("publicData", this.publicData);
                this.publicData = refreshedPublic.publicData;
            }
        }
        refreshPublic();
        setInterval(refreshPublic, 5000);
        // clean volatile db tables
        setInterval(this.db.clearVolatile, 2000);
    }
}

logLoading("Initiating coordinating IPC");
// start coordination ipc server 
ipc.config.id = 'coord';
ipc.config.retry = 1500;
ipc.config.silent = true;
ipc.serve(() => {
    const on = (event, callback) => ipc.server.on(event, callback);
    const broadcast = (event, callback) => ipc.server.broadcast(event, callback);
    on("workerConnect", (data, socket) => {
        balancer.addWorker(data.port, socket);
        logState("Balancing: " + balancer.currentBalancing());
    });
    on("socket.disconnected", (socket, id) => {
        setTimeout(() => {
            balancer.updateOnlineWorker();
            logState("Balancing: " + balancer.currentBalancing());
        }, 100);
    });
    on("updatePortBalance", (data, socket) => {
        if (data.port && data.clients) balancer.updateClients(data.port, data.clients);
        logState("Balancing: " + balancer.currentBalancing());
    });

    logLoading("Initiating shared data");
    const sharedData = new SharedData(palantirDb, broadcast);
});
ipc.server.start();


