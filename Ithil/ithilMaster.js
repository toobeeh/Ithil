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
const statDb = require("./statDatabase");
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
        statDb.updateClientContact(data.client); // log client pseudo-id (not identifyable; only the timestamp of typo init -> pseudo usage stats)
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
            // wait for next drop to appear, check in 1s intervals
            while (!(nextDrop = database.getDrop()).drop || nextDrop.drop.CaughtLobbyKey != "") await idle(1000);
            let ms = (new Date(nextDrop.drop.ValidFrom + " UTC")).getTime() - Date.now();
            if (ms < 0) return false; // old drop hasnt been claimed
            logLoading("Next drop in " + ms / 1000 + "s");
            await idle(ms);
            return nextDrop.drop;
        };
        // buffer of claims - gets filled and procedurally processed to prevent concurrent claim processing
        let claimBuffer = [];
        // clears the last claimed drop
        const clearDrop = (clearData) => {
            logState("Clearing drop ID " + clearData.dropID + " by " + clearData.username);
            if ([...clearData.username].map(c => c.charCodeAt(0)).some(c => c == 8238 || c == 8237)) clearData.username = "Someone with an invalid name";
            const result = {
                dropID: clearData.dropID,
                caughtPlayer: "<abbr title='Drop ID: " + clearData.dropID + "'>" + clearData.username + "</abbr>",
                caughtLobbyKey: clearData.lobbyKey,
                claimSocketID: clearData.claimSocketID
            };
            ipcBroadcast("clearDrop", result);
        };
        const processClaim = claim => {
            let claimSuccess = false;
            // check if drop is current drop
            const result = database.getDrop(claim.dropID);
            if (result.valid === true && result.drop != undefined) {
                const clearData = {
                    dropID: null,
                    username: null,
                    lobbyKey: null,
                    claimSocketID: 0
                };
                // if drop is not claimed, claim and reward
                if (result.drop.CaughtLobbyKey == "") {
                    database.claimDrop(claim.lobbyKey, claim.userID, result.drop.DropID, claim.userID);
                    database.rewardDrop(claim.login, result.drop.EventDropID);
                    // set last claim
                    clearData.dropID = result.drop.DropID;
                    clearData.username = claim.username;
                    clearData.lobbyKey = claim.lobbyKey;
                    clearData.claimSocketID = claim.claimSocketID;
                }
                else { // drop however is already claimed, set clear info 
                    console.log("Claimed an already claimed drop: ", claim, result.drop);
                    clearData.dropID = result.drop.DropID;
                    clearData.username = result.drop.CaughtLobbyPlayerID;
                    clearData.lobbyKey = result.drop.CaughtLobbyKey;
                    clearData.claimSocketID = 0;
                }
                clearDrop(clearData);
                claimSuccess = true;
            }
            else console.log("Claimed an already invalid drop: ", claim, result.drop);
            return claimSuccess;
        }
        // claim drop
        ipcOn("claimDrop", (claim) => claimBuffer.push(claim));

        /* 
         * Drop claiming process:
         * 
         * - set timeout to start async processing
         * - - infinite loop:
         * - - - wait for next drop:
         * - - - - poll with 1s timeout for a new unclaimed drop
         * - - - - log found drop
         * - - - reset claim buffer
         * - - - poll with 50ms timeout for claims in the buffer as long as the drop isn't claimed and timeout not exceeded:
         * - - - - take a claim
         * - - - - check if claim is valid
         * - - - - add drop if valid and empty buffer 
         * - - - log all claims with their time after 2s
         * 
         */

        //setTimeout(async () => {
        //    while (true) {
        //        try {
        //            let drop = await this.getNextDrop();
        //            claimBuffer = []; // empty buffer from previous claims (drop ID would be checked anyway, but this saves time)
        //            if (drop !== false) ipcBroadcast("newDrop", drop);
        //            logLoading("Dispatched Drop: ", drop, claimBuffer);
        //            // drop catch timeout
        //            const timeout = 5000;
        //            const poll = 50;
        //            let passed = 0;
        //            let claimed = false;
        //            let lastProcessedClaim = null;
        //            while (passed < timeout && !claimed) { // process claim buffer while drop not claimed
        //                while (claimBuffer.length > 0) { // while buffer has claims
        //                    const claim = claimBuffer.shift(); // get first claim of buffer
        //                    lastProcessedClaim = claim;
        //                    if (processClaim(claim)) {
        //                        claimed = true;
        //                        break; // dont process any other claims
        //                    }
        //                    else claimed = false;
        //                }
        //                passed += poll;
        //                await idle(poll);
        //            }
        //            // log all claims after a while
        //            setTimeout(() => {
        //                if (lastProcessedClaim) {
        //                    // print claim times
        //                    claimBuffer.forEach(claim => {
        //                        console.log(" -" + claim.username + ": +" + (claim.timestamp - lastProcessedClaim.timestamp) + "ms");
        //                    });
        //                }
        //            }, 2000);
        //        }
        //        catch (e) { console.warn("Error in drops:", e);}
        //    }
        //}, 1);
        // NEW
        setTimeout(async () => {
            while (true) {
                try {
                    // wait for next drop to appear, check in 1s intervals
                    logLoading("Polling for next drop..");
                    let nextDrop = null;
                    while (!nextDrop || nextDrop.CaughtLobbyKey != "") {
                        nextDrop = database.getDrop().drop;
                        await idle(1000);
                    }

                    // get drop timeout for dispatch
                    const dropInMs = (new Date(nextDrop.ValidFrom + " UTC")).getTime() - Date.now();

                    // if drop is still valid
                    if (dropInMs < 0) {
                        // clear all left claims
                        claimBuffer = [];
                        logLoading("Next drop in " + dropInMs / 1000 + "s:", nextDrop);

                        // wait to dispatch drop
                        await idle(dropInMs);
                        ipcBroadcast("newDrop", nextDrop);
                        logLoading("Dispatched Drop: ", nextDrop, claimBuffer);
                        let timeout = 5000; // 5s to claim a drop
                        const poll = 50; // check for claims in 50ms poll interval

                        // poll for claims
                        while (timeout > 0) {
                            // take a claim and process it
                            const claim = claimBuffer.shift();
                            if (claim) {
                                // if the claim was successful, stop processing claims
                                if (processClaim(claim)) break;
                                // if invalid claim, continue loop without delay
                                else continue;
                            }
                            timeout -= poll;
                            await idle(poll);
                        }

                        // log all claims after a while
                        setTimeout(() => {
                            if (lastProcessedClaim) {
                                // print claim times
                                claimBuffer.forEach(claim => {
                                    console.log(" -" + claim.username + ": +" + (claim.timestamp - lastProcessedClaim.timestamp) + "ms");
                                });
                            }
                        }, 2000);
                    }
                }
                catch (e) { console.warn("Error in drops:", e); }
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
        broadcast("publicData", sharedData.publicData);
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


