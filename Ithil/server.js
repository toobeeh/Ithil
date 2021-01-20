// require packets
const app = require('express')();
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const TypoSocket = require("./typoSocket");
const palantirDb = require("./sqlite");

app.use(cors()); // use cors
const path = '/etc/letsencrypt/live/typo.rip'; // path to certs
const server = https.createServer({ // create server
    key: fs.readFileSync(path + '/privkey.pem', 'utf8'),
    cert: fs.readFileSync(path + '/cert.pem', 'utf8'),
    ca: fs.readFileSync(path + '/chain.pem', 'utf8')
}, app);
server.listen(3000); // start listening on port 3000
const io = require('socket.io')(server, { // start io server with cors allowed
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"]
    }
});

class SharedData {
    constructor() {
        // refresh active lobbies and public data all 2s
        setInterval(() => {
            let refreshedLobbies = palantirDb.getActiveLobbies(); // send lobbies if new
            if (refreshedLobbies.valid && this.activeLobbies != refreshedLobbies.lobbies) {
                this.activeLobbies = refreshedLobbies.lobbies;
                console.log(JSON.stringify(this.activeLobbies);
                typoSockets.forEach(s => s.sendActiveLobbies(this.activeLobbies));
            }
            let refreshedPublic = palantirDb.getPublicData(); // send public data if new
            if (refreshedPublic.valid && refreshedPublic.publicData != this.publicData) {
                this.publicData = refreshedPublic.publicData;
                io.volatile.emit("public data", { event: "public data", payload: { publicData: this.publicData } });
            }
        }, 2000);
    }
}
sharedData = new SharedData();



let typoSockets = [];
io.on('connection', (socket) => { // on socket connect, add new typo socket
    console.log('Connected socket ' + socket.id);
    let typosck = new TypoSocket(socket, palantirDb, sharedData);
    typoSockets.push(typosck);
    socket.on("disconnect", () => {
        // on disconnect remove reference
        typoSockets = typoSockets.filter(s => s.socket.id != typosck.socket.id);
        typosck = null;
        console.log("Disconnected socket " + socket.id);
    });
});