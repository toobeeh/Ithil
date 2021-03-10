class TypoSocket {
    constructor(socket, db, sharedData, prodb) {
        this.db = db;
        this.prodb = prodb;
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
                                guildLobby.GuildID = guild.GuildID;
                                guildLobbies.push(guildLobby);
                            });
                            this.db.writeLobbyReport(guildLobbies);
                            let playerid = lobbyRaw.Players.find(player => player.Sender).LobbyPlayerID;
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
            case "waiting":
                let writeSearchWaitStatus = () => {
                    if (this.socket.rooms.has("waiting") || this.socket.rooms.has("searching")) {
                        let member = this.db.getUserByLogin(this.loginToken).member;
                        member.UserName = this.searchData.userName;
                        try {
                            let status = { PlayerMember: member, Status: this.searchData.waiting ? "waiting" : "searching", LobbyID: null, LobbyPlayerID: null };
                            this.db.writePlayerStatus(status, this.socket.id);
                        }
                        catch (e) { console.log("Error writing status data: " + e); }
                        finally { setTimeout(writeSearchWaitStatus, 2500); }
                    }
                }
                writeSearchWaitStatus();
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
                //console.log(`Received response: ${event} @ ${this.loginToken}\n${data.payload}`);
            });
            try {
                this.socket.emit(event, { event: event, payload: payload });
                //console.log((new Date()).toTimeString().split(" ")[0] + `: Emitted event: ${event} @ ${this.loginToken}`);
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
        member.member.Guilds.forEach(guild => {
            this.socket.join("guild" + guild.GuildID.slice(0,-2));
        });
        let flags = (Number(member.flag) >>> 0).toString(2);
        if (flags[flags.length - 4] == "1") { this.riproEnabled = true; console.log("ripro connected");}
        else this.riproEnabled = false;
        this.loginDate = Math.ceil(Date.now());
        this.loginToken = data.payload.loginToken; // set login
        this.socket.off("login", this.login);
        this.setStatusRoom("idle");// join idle room
        this.socket.on("get user", this.getUser); // add event handler get user
        this.socket.on("join lobby", this.joinLobby); // set lobby of socket, set playing and return lobbydata
        this.socket.on("set lobby", this.setLobby); // set lobby of socket, set playing and return lobbydata
        this.socket.on("search lobby", this.searchLobby); // set searching status
        this.socket.on("leave lobby", this.leaveLobby); // set idle status
        this.socket.on("claim drop", this.claimDrop); // claim drop
        this.socket.on("store drawing", this.storeDrawing); // store drawing local and permanent
        this.socket.on("fetch drawing", this.fetchDrawing); // get stored drawing
        this.socket.on("remove drawing", this.removeDrawing); // get stored drawing
        this.socket.on("get commands", this.getCommands); // get stored drawing commands
        this.socket.on("get meta", this.getUserMeta); // get all meta
        this.emitEvent(data.event + " response", {
            authorized: true,
            activeLobbies: this.sharedData.activeLobbies.filter(a => this.socket.rooms.has("guild" + a.guildID.slice(0, -2)))
        }); // reply with status
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
            let desc = data.payload.description;
            if (data.payload.lobby.Players.findIndex(p => p.Sender == true) == 0 && data.payload.description) // if owner and desc set
                desc = data.payload.description;
            else desc = this.lobbyData.lobby.Description;
            if (key != this.lobbyData.lobby.Key || desc != this.lobbyData.lobby.Description) { // if new lobby key / desc differs from old, set new key in db
                this.db.setLobby(this.lobbyData.lobby.ID, key, desc);
                this.lobbyData = this.db.getLobby(this.lobbyData.lobby.ID, "id");
            }
        }
    }
    // on set searching event: set status as searching
    searchLobby = (data) => {
        this.searchData = data.payload.searchData;
        if (this.searchData.waiting) this.setStatusRoom("waiting");
        else this.setStatusRoom("searching");
    }
    // on leave lobby event: join idle status, reset player lobby
    leaveLobby = (data) => {
        this.setStatusRoom("idle");
        this.lobby = null;
        this.lobbyData = null;
        this.searchData = null;
        this.emitEvent(data.event + " response", {
            activeLobbies: this.sharedData.activeLobbies.filter(a => this.socket.rooms.has("guild" + a.guildID.slice(0, -2)))
        }); // reply with active lobbies
    }
    claimDrop = (data) => {
        console.log(data.payload.name + " claims a drop: " + (data.payload.drop ? data.payload.drop.DropID : " no drop - invalid."));
        if (!data.payload.drop) return;
        let res = this.db.getDrop(data.payload.drop.DropID);
        console.log(JSON.stringify(res));
        res = res.drop;
        let result;
        if (res.CaughtLobbyKey == "" && data.payload.timedOut === false) {
            this.db.claimDrop(data.payload.lobbyKey, data.payload.name, data.payload.drop.DropID);
            this.socket.to("playing").emit("clear drop", { payload: { result: { caughtPlayer: data.payload.name, caughtLobbyKey: data.payload.lobbyKey } } });
            this.db.rewardDrop(this.loginToken, data.payload.drop.EventDropID);
            result = {
                caught: true,
            }
        }
        else {
            result = {
                caught: false,
                caughtPlayer: res.CaughtLobbyPlayerID,
                caughtLobbyKey: res.CaughtLobbyKey
            }
        }
        this.emitEvent(data.event + " response", {
            result: result
        }); // reply with result
    }
    storeDrawing = (data) => {
        let meta = data.payload.meta;
        let uri = data.payload.uri;
        let commands = data.payload.commands;
        if (!meta.name) meta.name = "Unnamed";
        if (!meta.author) meta.author = "Unknown";
        if (!meta.date) meta.date = (new Date()).toString();
        meta.login = this.loginToken;
        let id = Math.ceil(Date.now()).toString();

        if (this.prodb.addDrawing(this.loginToken, id, meta)) {
            this.prodb.addDrawCommands(id, commands);
            this.prodb.addURI(id, uri);
        }
        this.emitEvent(data.event + " response", {
            id: id
        }); 
    }
    removeDrawing = data => {
        let id = data.payload.id;
        this.prodb.removeDrawing(id, this.loginToken);
    }
    fetchDrawing = data => {
        let id = data.payload.id;
        let result = this.prodb.getDrawing(id);
        if (data.payload.withCommands != true) result.commands = null;
        this.emitEvent(data.event + " response", {
            drawing: result
        }); 
    }
    getCommands = data => {
        let id = data.payload.id;
        let result = this.prodb.getDrawing(id);
        this.emitEvent(data.event + " response", {
            commands: result.commands
        });
    }
    getUserMeta = data => {
        let limit = data.payload.limit;
        if (!limit) limit = -1;
        let query = data.payload.query;
        let result = this.prodb.getUserMeta(this.loginToken, limit, query);
        this.emitEvent(data.event + " response", {
            drawings: result.drawings
        }); 
    }
    resetTypro = () => {
        if(!this.riproEnabled)this.prodb.removeEntries(this.loginToken, this.loginDate - 1000 * 60 * 60 * 24 * 14); // delete older than 14 days
    }
}
module.exports = TypoSocket;