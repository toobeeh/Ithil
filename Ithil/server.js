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
    constructor(database) {
        // refresh active lobbies every 4 seconds 
        this.db = database;
        this.activeLobbies = [];
        this.publicData = { onlineSprites: [], drops: [], sprites: [] };
        const refreshLobbies = () => {
            let refreshedLobbies = this.db.getActiveLobbies(); // send lobbies if new
            if (refreshedLobbies.valid && JSON.stringify(this.activeLobbies) != JSON.stringify(refreshedLobbies.lobbies)) {
                this.activeLobbies = refreshedLobbies.lobbies;
                io.to("idle").volatile.emit("active lobbies", { event: "active lobbies", payload: { activeLobbies: this.activeLobbies } });
            }
        }
        refreshLobbies();
        setInterval(refreshLobbies, 4000);
        // refresh public data - sprites all 10s
        const refreshPublic = () => {
            let refreshedPublic = this.db.getPublicData(); // send public data if new
            if (refreshedPublic.valid && JSON.stringify(refreshedPublic.publicData.onlineSprites) != JSON.stringify(this.publicData.onlineSprites)) {
                this.publicData = refreshedPublic.publicData;
                io.volatile.emit("online sprites", { event: "online sprites", payload: { onlineSprites: this.publicData.onlineSprites } });
            }
            this.publicData = refreshedPublic.publicData;
        }
        refreshPublic();
        setInterval(refreshPublic, 10000);
    }
}
sharedData = new SharedData(palantirDb);

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