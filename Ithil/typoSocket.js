class TypoSocket {
    constructor(socket, db, sharedData, log, tynt) {
        this.log = log;
        this.tynt = tynt;
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
                                guildLobby.GuildID = guild.GuildID;
                                guildLobbies.push(guildLobby);
                            });
                            this.db.writeLobbyReport(guildLobbies);
                            let playerid = lobbyRaw.Players.find(player => player.Sender).LobbyPlayerID;
                            let status = { PlayerMember: member, Status: "playing", LobbyID: lobbyRaw.ID, LobbyPlayerID: playerid };
                            this.db.writePlayerStatus(status, this.socket.id); 
                        }
                        catch (e) { this.log(this.socket.id, this.username, this.tynt.Red("Error writing report data: ") + e); }
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
                        catch (e) { this.log(this.socket.id, this.username, this.tynt.Red("Error writing status data: ") + e); }
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
            });
            try {
                this.socket.emit(event, { event: event, payload: payload });
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
        let flags = ("00000000" + (Number(member.flag) >>> 0).toString(2)).slice(-8).split("").reverse();
        this.flags = flags;
        if (flags[5] == "1") {
            this.emitEvent(data.event + " response", { authorized: false, banned: true });
            console.log("banned connected");
            this.socket.join("public");
            return;
        }
        if (flags[3] == "1" || flags[4] == "1") {
            this.patron = true;
            this.log(this.socket.id, this.username, "Recognized Patron");
        }
        else this.patron = false;
        member.member.Guilds.forEach(guild => {
            this.socket.join("guild" + guild.GuildID);
        });
        this.loginDate = Math.ceil(Date.now());
        this.loginToken = data.payload.loginToken; // set login
        this.username = member.member.UserName;
        this.id = member.member.UserID;
        this.socket.off("login", this.login);
        this.imageDatabase = new (require("./imageDatabase"))(this.loginToken);
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
        this.socket.on("disconnect", this.clearCloud); // clear image cloud
        this.emitEvent(data.event + " response", {
            authorized: true,
            activeLobbies: this.sharedData.activeLobbies.filter(a => this.socket.rooms.has("guild" + a.guildID))
        }); // reply with status
        this.log(this.socket.id, this.username, this.tynt.Green("Logged in: ") + this.loginToken);
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
            responseData.valid = this.db.setLobby(Date.now(), data.payload.key, "").valid; 
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
        let owner = false;
        if (this.socket.rooms.has("playing")) {
            this.lobby = data.payload.lobby;
            try {
                owner = this.db.isPalantirLobbyOwner(this.lobbyData.lobby.ID, this.lobby.Players.find(player => player.Sender).LobbyPlayerID); 
            }
            catch{ owner = false;}
            let key = data.payload.lobbyKey;
            let desc = "";
            let rest = "";
            if (owner && data.payload.description) // if owner and desc set
                desc = data.payload.description;
            else desc = this.lobbyData.lobby.Description;
            if (this.lobby.Private && owner && data.payload.restriction) {
                rest = data.payload.restriction;
                if (rest == "") rest = "unrestricted";
            }
            else rest = this.lobbyData.lobby.Restriction;
            if (key != this.lobbyData.lobby.Key || desc != this.lobbyData.lobby.Description || rest != this.lobbyData.lobby.Restriction) { // if new lobby key / desc differs from old, set new key in db
                this.db.setLobby(this.lobbyData.lobby.ID, key, desc, rest);
                this.lobbyData = this.db.getLobby(this.lobbyData.lobby.ID, "id");
            }
        }
        let responseData = {};
        responseData.lobbyData = this.lobbyData;
        responseData.owner = owner;
        this.emitEvent(data.event + " response", responseData);
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
        if (data.payload.joined) {
            this.emitEvent(data.event + " response", {
                activeLobbies: this.sharedData.activeLobbies.filter(a => this.socket.rooms.has("guild" + a.guildID))
            }); // reply with active lobbies
            this.log(this.socket.id, this.username, "Left a lobby");
        }
    }
    claimDrop = (data) => {
        this.log(this.socket.id, this.username, "Claims a drop: " + (data.payload.drop ? data.payload.drop.DropID : " no drop - invalid."));
        if (!data.payload.drop || this.flags[6] == "1") return;
        let res = this.db.getDrop(data.payload.drop.DropID);
        console.log(JSON.stringify(res));
        res = res.drop;
        let result;
        if (res.CaughtLobbyKey == "" && data.payload.timedOut === false) {
            this.db.claimDrop(data.payload.lobbyKey, `<a href='#${data.payload.drop.DropID}'>${data.payload.name}</a>`, data.payload.drop.DropID, this.id);
            this.db.rewardDrop(this.loginToken, data.payload.drop.EventDropID);
            result = {
                caught: true,
            }
        }
        else {
            result = {
                caught: false
            }
        }
        this.emitEvent(data.event + " response", result); // reply with result
        // request clear drop, no matter if caught or not
        this.sharedData.clearDrop(data.payload.drop.DropID);
    }
    storeDrawing = (data) => {
        let meta = data.payload.meta;
        let uri = data.payload.uri;
        let commands = data.payload.commands;
        if (!meta.name) meta.name = "Unnamed";
        if (!meta.author) meta.author = "Unknown";
        if (!meta.date) meta.date = (new Date()).toString();
        meta.login = this.loginToken;
        meta.save = this.patron;
        let id = Math.ceil(Date.now()).toString();

        if (this.imageDatabase.addDrawing(this.loginToken, id, meta)) {
            this.imageDatabase.addDrawCommands(id, commands);
            this.imageDatabase.addURI(id, uri);
        }
        this.emitEvent(data.event + " response", {
            id: id
        }); 
    }
    removeDrawing = data => {
        let id = data.payload.id;
        this.imageDatabase.removeDrawing(id, this.loginToken);
    }
    fetchDrawing = data => {
        let id = data.payload.id;
        let result = this.imageDatabase.getDrawing(id);
        if (data.payload.withCommands != true) result.commands = null;
        this.emitEvent(data.event + " response", {
            drawing: result
        }); 
    }
    getCommands = data => {
        let id = data.payload.id;
        let result = this.imageDatabase.getDrawing(id);
        this.emitEvent(data.event + " response", {
            commands: result.commands
        });
    }
    getUserMeta = data => {
        let limit = data.payload.limit;
        if (!limit) limit = -1;
        let query = data.payload.query;
        let result = this.imageDatabase.getUserMeta(this.loginToken, limit, query);
        this.emitEvent(data.event + " response", {
            drawings: result.drawings
        }); 
    }
    clearCloud = () => {
        if(!this.patron) this.imageDatabase.removeEntries(this.loginToken, this.loginDate - 1000 * 60 * 60 * 24 * 30); // delete older than 30 days
    }
}
module.exports = TypoSocket;