class TypoSocket {
    constructor(socket, db, sharedData) {
        this.db = db;
        this.sharedData = sharedData;
        this.socket = socket;
        this.socket.on("login", this.login);
        this.socket.emit("public data", { event: "public data", payload: { publicData: this.sharedData.publicData } }); // send public data on beginning
    }
    setStatusRoom = (status) => {
        this.socket.rooms.forEach(r => { // leave all status rooms
            if (r == "idle" || r == "playing" || r == "searching" || r == "waiting") this.socket.leave(r);
        });
        this.socket.join(status);
        // write status to db
        switch (status) {
            case "playing":
                // write report as long as player is in playing room
                let writeLobbyPlaying = () => {
                    if (this.socket.rooms.has("playing")) {
                        try {
                            let lobbyRaw = this.lobby;
                            let lobbyData = this.lobbyData;
                            let member = this.db.getUserByLogin(this.loginToken).member;
                            lobbyRaw.ID = lobbyData.lobby.ID
                            lobbyRaw.Description = lobbyData.lobby.Description;
                            lobbyRaw.Key = lobbyData.lobby.Key;
                            let guildLobbies = [];
                            member.Guilds.forEach(guild => {
                                let guildLobby = JSON.parse(JSON.stringify(lobbyRaw));
                                guildLobby.ObserveToken = guild.ObserveToken;
                                guildLobbies.push(guildLobby);
                            });
                            this.db.writeLobbyReport(guildLobbies);
                            let playerid = lobbyraw.Players.find(player => player.Sender).LobbyPlayerID;
                            let status = { PlayerMember: member, Status: "playing", LobbyID: lobbyRaw.ID, LobbyPlayerID: playerid };
                            this.db.writePlayerStatus(status, this.socket.id);
                        }
                        catch (e) { console.log("Error writing report data: " + e); }
                        finally {
                            setTimeout(writeLobbyPlaying, 2500);
                        }
                    }
                }
                writeLobbyPlaying();                
                break;
            case "searching":
                let writeSearchingStatus = () => {
                    if (this.socket.rooms.has("searching")) {
                        try {
                            let status = { PlayerMember: this.db.getUserByLogin(this.loginToken).member, Status: "searching", LobbyID: null, LobbyPlayerID: null };
                            this.db.writePlayerStatus(status, this.socket.id);
                        }
                        catch (e) { console.log("Error writing status data: " + e); }
                        finally { setTimeout(writeSearchingStatus, 2500); }
                    }
                }
                writeSearchingStatus();
                break;
            case "waiting":
                let writeWaitingStatus = () => {
                    if (this.socket.rooms.has("waiting")) {
                        try {
                            let status = { PlayerMember: this.db.getUserByLogin(this.loginToken).member, Status: "waiting", LobbyID: null, LobbyPlayerID: null };
                            this.db.writePlayerStatus(status, this.socket.id);
                        }
                        catch (e) { console.log("Error writing status data: " + e); }
                        finally { setTimeout(writeWaitingStatus, 2500); }
                    }
                }
                writeWaitingStatus();
                break;
            case "idle":
                break;
        }
    }
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
        this.setStatusRoom("idle");// join idle room
        this.socket.on("get user", this.getUser); // add event handler get user
        this.socket.on("join lobby", this.joinLobby); // set lobby of socket, set playing and return lobbydata
        this.socket.on("set lobby", this.setLobby); // set lobby of socket, set playing and return lobbydata
        this.socket.on("search lobby", this.searchLobby); // set searching status
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
        responseData.lobbyData = lobbyData;
        this.setStatusRoom("playing");
        this.socket.join("lobby#" + this.lobbyData.ID);
        this.emitEvent(data.event + " response", responseData);
    }
    // on report lobby event: get lobby and write report, update key if changed
    setLobby = (data) => {
        if (this.socket.rooms.has("playing")) {
            this.lobby = data.payload.lobby;
            let key = data.payload.lobbyKey;
            if (key != this.lobbyData.lobby.Key) { // if new lobby key differs from old, set new key in db
                this.db.setLobby(this.lobbyData.lobby.ID, key, this.lobbyData.lobby.Description);
                this.lobbyData = this.db.getLobby(this.lobbyData.lobby.ID, "id");
            }
            this.emitEvent(data.event + " response", this.lobbyData);
        }
    }
    // on set searching event: set status as searching
    searchLobby = (data) => {
        this.searchData = data.payload.searchData;
        if (searchData.waiting) this.setStatusRoom("waiting");
        else this.setStatusRoom("searching");
    }
    // on leave lobby event: join idle status, reset player lobby
    leaveLobby = (data) => {
        this.lobby = null;
        this.lobbyData = null;
        this.searchData = null;
        this.socket.join("idle");
    }
}
module.exports = TypoSocket;