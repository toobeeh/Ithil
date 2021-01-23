class TypoSocket {
    constructor(socket, db, sharedData) {
        this.db = db;
        this.sharedData = sharedData;
        this.socket = socket;
        this.socket.on("login", this.login);
        this.socket.emit("public data", { event: "public data", payload: { publicData: this.sharedData.publicData } }); // send public data on beginning
    }
    // leave all rooms
    leaveAllStateRooms = () => this.socket.rooms.forEach(r => {
        if (r == "idle" || r == "playing" || r == "searching" || r == "waiting") this.socket.leave(r);
    });
    // emit event and optionally expect an response within a timeout
    emitEvent = (event, payload, listenResponse = false, responseTimeout = 2000) => {
        return new Promise((resolve, reject) => {
            if (listenResponse) this.socket.once(event + " response", (data) => {
                resolve(data.payload);
                console.log(`Received response: ${event} @ ${this.loginToken}\n${data.payload}`);
            });
            try {
                this.socket.emit(event, { event: event, payload: payload });
                console.log(`Emitted event: ${event} @ ${this.loginToken}`);
            }
            catch { reject(new Error("Failed emitting event: " + event)); }
            if (!listenResponse) resolve(true);
            else setTimeout(() => reject(new Error("Response timed out")), responseTimeout);
        });
    }
    // On login event: authorize user, set room public if unauthorized
    login = (data) => {
        let member = this.db.getUserByLogin(data.payload.loginToken); // check if member exists with login
        if (!member.valid) {
            this.emitEvent(data.event + " response", { authorized: false});
            this.socket.join("public");
            return;
        }
        this.loginToken = data.payload.loginToken; // set login
        this.socket.off("login", this.login);
        this.leaveAllStateRooms();
        this.socket.join("idle");// join idle room
        this.socket.on("get user", this.getUser); // add event handler get user
        this.socket.on("join lobby", this.joinLobby); // set lobby of socket, set playing and return lobbydata
        this.socket.on("set lobby", this.setLobby); // set lobby of socket, set playing and return lobbydata
        this.emitEvent(data.event + " response", { authorized: true, activeLobbies: this.sharedData.activeLobbies }); // reply with status
        console.log(`Login was set for socket: ${this.loginToken}`);
    }
    // on get user event: respond with member data
    getUser = (data) => {
        // get user data
        let member = this.db.getUserByLogin(this.loginToken);
        this.emitEvent(data.event + " response", { user: member });
    }
    // on join lobby event: set status as playing and get lobby id
    joinLobby = (data) => {
        // get lobby
        let responseData = {};
        let lobbyData = this.db.getLobby(data.payload.key);
        responseData.valid = lobbyData.valid;
        if (!lobbyData.found) {
            responseData.valid = this.db.setLobby(Math.random().toString(10).substr(2, 8), data.payload.key, "").valid;
            lobbyData = this.db.getLobby(data.payload.key);
        }
        this.searchData = null;
        this.lobbyData = lobbyData;
        this.leaveAllStateRooms();
        responseData.lobbyData = lobbyData;
        this.socket.join("playing");
        this.socket.join("lobby#" + this.lobbyData.ID);
        this.emitEvent(data.event + " response", responseData);
        // write report as long as player is in playing room
        let writeLobbyPlaying = () => {
            if (this.socket.rooms.has("playing")) {
                try {
                    let lobbyRaw = this.lobby;
                    let lobbyData = this.lobbyData;
                    lobbyRaw.ID = lobbyData.ID
                    lobbyRaw.Description = lobbyData.Description;
                    lobbyRaw.Key = lobbyData.Key;
                    let guildLobbies = [];
                    this.db.getUserByLogin(this.loginToken).member.Guilds.forEach(guild => {
                        let guildLobby = JSON.parse(JSON.stringify(lobbyRaw));
                        guildLobby.ObserveToken = guild.ObserveToken;
                        guildLobbies.push(guildLobby);
                    });
                    this.db.writeLobbyReport(guildLobbies);
                }
                catch (e) { console.log("Error writing report data: " + e); }
                finally {
                    setTimeout(writeLobbyPlaying, 2500);
                }
            }
        }
        writeLobbyPlaying();
    }
    // on report lobby event: get lobby and write report, update key if changed
    setLobby = (data) => {
        if (this.socket.rooms.has("playing")) {
            this.lobby = data.payload.lobby;
            let key = data.payload.lobbyKey;
            if (key != this.lobbyData.Key) {
                this.db.setLobby(this.lobbyData.ID, key, this.lobbyData.Description);
                this.lobbyData = this.db.getLobby(this.lobbyData.ID, "id");
            }
            console.log("Set lobby: lobbydata:" + JSON.stringify(this.lobbyData) + " lobby:" + JSON.stringify(this.lobby));
        }
    }
    // on set searching event: set status as searching
    searchLobby = (data) => {
        let searchData = data.payload.searchData;
        this.leaveAllStateRooms();
        if (searchData.waiting) {
            this.socket.join("waiting");
        }
        else {
            this.socket.join("searching");
        }
        this.searchData = searchData;
    }
    // on leave lobby event: join idle status, reset player lobby
    leaveLobby = (data) => {
        this.lobby = null;
        this.lobbyData = null;
        this.searchData = null;
        this.leaveAllStateRooms();
        this.socket.join("idle");
    }
}
module.exports = TypoSocket;