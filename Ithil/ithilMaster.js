/*
 * Ithil Master Server
 * - public socketio endpoint to redirect to Ithil Master Server
 *   redirect point depending on load balance
 * - internal socketio endpoint to coordinate Ithil Workers
 *   keeps track of drops, data & load balance
 */

// require packets
const masterExpress = require('express')();
const masterHttps = require('https');
const fs = require('fs');
const cors = require('cors');
const palantirDb = require("./palantirDatabase");
const tynt = require("tynt");
const ipc = require('node-ipc');
const portscanner = require('portscanner');
const config = require("./ecosystem.config").config;

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
    currentBalancing: () => balancer.workers.reduce((sum, worker) => sum + Number(worker.clients), 0) + " / " + balancer.workers.map(worker => `${worker.clients}@:${worker.port}`).join(", ")
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
        //logState("Balancing: " + balancer.currentBalancing());
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

// init drops 
class Drops {
    constructor(database, ipcBroadcast, ipcOn) {
        // async timeout func
        const idle = async (timeMs) => {
            return new Promise((resolve, reject) => {
                setTimeout(() => resolve(), timeMs);
            });
        };
        this.getNextDrop = async () => {
            let nextDrop;
            // wait for next drop to appear, check in 5s intervals
            while (!(nextDrop = database.getDrop()).drop || nextDrop.drop.CaughtLobbyKey != "") await idle(5000);
            let ms = (new Date(nextDrop.drop.ValidFrom + " UTC")).getTime() - Date.now();
            if (ms < 0) return false; // old drop hasnt been claimed
            logLoading("Next drop in " + ms / 1000 + "s");
            await idle(ms);
            return nextDrop.drop;
        };
        // the last claimed drop
        let lastClaimed = { dropID: null, username: null, lobbyKey: null, claimSocketID: null };
        // clears the last claimed drop
        const clearDrop = () => {
            logState("Cleared drop ID " + lastClaimed.dropID + " by " + lastClaimed.username);
            const result = {
                dropID: lastClaimed.dropID,
                caughtPlayer: "<a href='" + lastClaimed.dropID + "'>" + lastClaimed.username + "</a>",
                caughtLobbyKey: lastClaimed.CaughtLobbyKey,
                claimSocketID: lastClaimed.claimSocketID;
            };
            ipcBroadcast("clearDrop", result);
        };
        this.processClaim = claim => {
            console.log("Processing drop claim:", claim);
            console.log("Last claimed is:", lastClaimed);
            // if last claimed is this drop -> already claimed
            if (claim.dropID != lastClaimed.dropID) {
                // check if drop is current drop
                let result = database.getDrop(dropID);
                if (result.valid === true) {
                    console.log("Drop fetch result:", result);
                    // if drop is not claimed, claim and reward
                    if (result.drop.CaughtLobbyKey == "") {
                        this.db.claimDrop(claim.lobbyKey, claim.username, result.drop.DropID, claim.login);
                        this.db.rewardDrop(claim.login, result.drop.EventDropID);
                        // set last claim
                        lastClaimed.dropID = result.drop.DropID;
                        lastClaimed.username = claim.username;
                        lastClaimed.lobbyKey = claim.lobbyKey;
                        lastClaimed.claimSocketID = 0;
                    }
                    else { // drop however is already claimed, update lastclaim
                        lastClaimed.dropID = result.drop.DropID;
                        lastClaimed.username = result.drop.CaughtLobbyPlayerID;
                        lastClaimed.lobbyKey = result.drop.caughtLobbyKey;
                        lastClaimed.claimSocketID = claim.claimSocketID;
                    }
                    console.log("Last claimed is now:", lastClaimed);
                    clearDrop();
                }
            }
            // else respond with a clear for the drop
            //else clearDrop();
        }
        // claim drop
        ipcOn("claimDrop", (claim) => this.processClaim(claim));
        // check async for drops once in 5s
        setTimeout(async () => {
            while (true) {
                try {
                    let drop = await this.getNextDrop();
                    if (drop !== false) ipcBroadcast("newDrop", drop);
                    // drop catch timeout
                    const timeout = 5000;
                    const poll = 50;
                    let passed = 0;
                    while (passed < timeout) { // wait until claimed drop is current drop
                        if (lastClaimed.dropID == drop.DropID) {
                            clearDrop();
                            break;
                        }
                        passed += poll;
                        await idle(poll);
                    }
                    // set last claimed to current drop after timeout
                    lastClaimed.dropID = drop.DropID;
                    lastClaimed.username = "... no one";
                    lastClaimed.lobbyKey = 0;
                }
                catch (e) {console.warn("Error in drops:",e)}
            }
        }, 1);
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
        }, 100);
    });
    on("updatePortBalance", (data, socket) => {
        if (data.port && data.clients) balancer.updateClients(data.port, data.clients);
        logState("Balancing: " + balancer.currentBalancing());
    });

    logLoading("Initiating shared data");
    const sharedData = new SharedData(palantirDb, broadcast);
    logLoading("Initiating drops");
    const drops = new Drops(palantirDb, broadcast, on);
});
ipc.server.start();


