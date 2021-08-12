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
const app = require('express')();
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const palantirDb = require("./palantirDatabase");
const tynt = require("tynt");

// logging function
const logLoading = (msg) => { console.log(tynt.BgWhite(tynt.Blue(msg))); }
const logState = (msg) => { console.log(tynt.Cyan(msg)); }
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
        balancer.workers = balancer.workers.filter(worker => worker.port !== port); // remove worker
        logState("Ithil Worker disconnected on port " + port);
    },
    updateClients: (port, clients) => balancer.workers.find(worker => worker.port == port).clients = clients,
    getBalancedWorker: async () => {
        await new Promise((resolve, reject) => { // wait until minimum of workers are online
            if (balancer.workers.length < config.minAvailableWorker) balancer.queue.push(resolve);
            else resolve();
        });
        return balancer.workers.sort(worker => worker.clients)[0]; // return worker with fewest clients
    }
}

// DEBUG
let dummy = 0;
setTimeout(() => balancer.addWorker(++dummy, "test"), 10000);

// start public server with cors & ssl
logLoading("Starting public endpoint with CORS & SSL");
app.use(cors()); // use cors
const server = https.createServer({ // create server
    key: fs.readFileSync(config.certificatePath + '/privkey.pem', 'utf8'),
    cert: fs.readFileSync(config.certificatePath + '/cert.pem', 'utf8'),
    ca: fs.readFileSync(config.certificatePath + '/chain.pem', 'utf8')
}, app);
server.listen(config.masterPort); // start listening on master worker port
const masterSocket = require('socket.io')(server, { // start socket server
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"]
    },
    pingTimeout: 20000
});
logLoading("Initiating public endpoint connection event");
masterSocket.on('connection', async (socket) => { // on socket connect, get free balance 
    socket.on("request port", async (data) => {
        let port = config.publicPort;
        if (data.auth === "member") port = await balancer.getBalancedWorker(); // get balanced port if client wants to login
        socket.emit("balanced port", { port: port }); // send balanced port
        socket.disconnect(); // disconnect from client
    });
    setTimeout(() => socket.connected ? socket.disconnect() : 1, 5000); // socket has 5 seconds to request port
});


