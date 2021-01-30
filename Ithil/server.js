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
                this.activeLobbies.forEach(guildLobbies => {
                    io.to("guild" + guildLobbies.guildID.slice(0,-2)).emit("active lobbies", { event: "active lobbies", payload: { activeGuildLobbies: guildLobbies } });
                });
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
        // clean volatile db tables
        setInterval(this.db.clearVolatile, 2000);
    }
}
sharedData = new SharedData(palantirDb);

// drops
const drops = {
    idle: async (timeMs) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => resolve(), timeMs);
        });
    },
    getNextDrop: async () => {
        let nextDrop;
        // wait for next drop to appear, check in 5s intervals
        while (!(nextDrop = palantirDb.getDrop()).valid || nextDrop.drop.LobbyPlayerID == "") await drops.idle(5000);
        let ms = (new Date(nextDrop.drop.ValidFrom)).getTime() - Date.now();
        console.log("Next drop in " + ms / 1000 + "s");
        await drops.idle(ms);
        return nextDrop.drop;
    },
    start: () => {
        setTimeout(async () => {
            while (true) {
                let drop = await drops.getNextDrop();
                io.to("playing").emit("new drop", { event: "new drop", payload: { drop: drop } });
            }
        }, 1);        
    }
}
drops.start();


let typoSockets = [];
console.log("Initiating connection events..");
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