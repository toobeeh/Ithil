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
                        catch (e) { 0 && this.log(this.socket.id, this.username, this.tynt.Red("Error writing report data: ") + e); }
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
    login = async (data) => {
        let login = data.payload.loginToken;
        let access = data.payload.accessToken;
        console.log(access, !access, access == false);
        console.log(login, !login, login == false);
        if (access) login = this.db.getLoginFromAccessToken(access).login;
        let member = this.db.getUserByLogin(login); // check if member exists with login
        if (!member.valid) {
            this.emitEvent(data.event + " response", { authorized: false});
            this.socket.join("public");
            return;
        }
        this.username = member.member.UserName;
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
        this.spriteSlots = 1 + Math.floor(member.drops / 1000) + (this.patron === true ? 1 : 0);
        if (flags[1] == "1") this.spriteSlots = 100;
        member.member.Guilds.forEach(guild => {
            this.socket.join("guild" + guild.GuildID);
        });
        this.loginDate = Math.ceil(Date.now());
        this.loginToken = login; // set login
        this.id = member.member.UserID;
        this.socket.off("login", this.login);
        const { spawn, Thread, Worker } = require("threads");
        const thread = this.imageDatabaseWorker = await spawn(new Worker("./imageDatabase"));
        this.setStatusRoom("idle");// join idle room
        this.socket.on("get user", this.getUser); // add event handler get user
        this.socket.on("set slot", this.setSlot); // add event handler set slot
        this.socket.on("set combo", this.setCombo); // add event handler set combo
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
        this.socket.on("disconnect", async () => { // clear up things
            this.clearCloud(); // clear image cloud
            await Thread.terminate(thread); // terminate imagecloud thread
        });
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
        member.slots = this.spriteSlots;
        this.emitEvent(data.event + " response", { user: member });
    }
    isSpecialSprite = (id) => {

    }
    // set a sprite
    setSlot = (data) => {
        // get current user data
        let member = this.db.getUserByLogin(this.loginToken);
        const setSlot = parseInt(data.payload.slot);
        const setSprite = parseInt(data.payload.sprite);
        const slots = 1 + (this.patron ? 1 : 0) + Math.floor(member.drops / 1000) + (this.flags[1] == "1" ? 100 : 0);
        const availablesprites = member.sprites
            .split(",")
            .filter(sprite => sprite.replaceAll(".", "") > 0 && !sprite.includes("."))
            .map(sprite => parseInt(sprite.replaceAll(".","")));
        if (setSlot > 0 && setSlot <= slots && (availablesprites.includes(setSprite) || setSprite == 0)) {
            // disable old sprite
            const inv = member.sprites.split(",");
            const oldIndex = inv.findIndex(item => item.split(".").length - 1 == setSlot);
            const newIndex = inv.findIndex(item => parseInt(item.replaceAll(".", "")) == setSprite);
            console.log(newIndex, oldIndex);
            if (oldIndex >= 0) inv[oldIndex] = inv[oldIndex].replaceAll(".", "");
            if (newIndex >= 0) inv[newIndex] = ".".repeat(setSlot) + setSprite.toString();
            this.db.setUserSprites(this.loginToken, inv.join(","));
        }
        // update member 
        member = this.db.getUserByLogin(this.loginToken);
        member.slots = slots;
        this.emitEvent(data.event + " response", { user: member });
    }
    // set a combo
    setCombo = (data) => {
        // get current user data
        let member = this.db.getUserByLogin(this.loginToken);
        const combo = data.payload.combostring.split(",");
        const slots = 1 + (this.patron ? 1 : 0) + Math.floor(member.drops / 1000) + (this.flags[1] == "1" ? 100 : 0);
        const availablesprites = member.sprites.replaceAll(".", "").split(",");
        let verifiedCombo = combo.map(slot => { return { slot: parseInt(slot.split(".").length - 1), sprite: parseInt(slot.replaceAll(".","")) } });
        verifiedCombo = verifiedCombo.filter(slot => slot.slot > 0 && slot.slot <= slots && (availablesprites.some(s => s == slot.sprite) || slot.sprite == 0));
        const inv = member.sprites.replaceAll(".", "").split(",");
        verifiedCombo.forEach(slot => {
            inv[inv.findIndex(item => item == slot.sprite.toString())] = ".".repeat(slot.slot) + slot.sprite;
        });

        // update member 
        this.db.setUserSprites(this.loginToken, inv.join(","));
        member = this.db.getUserByLogin(this.loginToken);
        member.slots = slots;
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
    claimDrop = async (data) => {
        this.log(this.socket.id, this.username, "Claims a drop: " + (data.payload.drop ? data.payload.drop.DropID : " no drop - invalid."));
        if (!data.payload.drop || data.timedOut == true || this.flags[6] == "1") return;
        this.sharedData.claimDrop({
            login: this.loginToken,
            username: data.payload.name,
            userID: this.id,
            lobbyKey: data.payload.lobbyKey,
            dropID: data.payload.drop.DropID,
            claimSocketID: this.socket.id
        });
    }
    storeDrawing = async (data) => {
        let meta = data.payload.meta;
        let uri = data.payload.uri;
        let commands = data.payload.commands;
        if (!meta.name) meta.name = "Unnamed";
        if (!meta.author) meta.author = "Unknown";
        if (!meta.date) meta.date = (new Date()).toString();
        meta.login = this.loginToken;
        meta.save = this.patron;
        let id = Math.ceil(Date.now()).toString();

        if (await this.imageDatabaseWorker.addDrawing(this.loginToken, id, meta)) {
            await this.imageDatabaseWorker.addDrawCommands(this.loginToken, id, commands);
            await this.imageDatabaseWorker.addURI(this.loginToken, id, uri);
        }
        this.emitEvent(data.event + " response", {
            id: id
        }); 
    }
    removeDrawing = async (data) => {
        let id = data.payload.id;
        await this.imageDatabaseWorker.removeDrawing(this.loginToken, id);
    }
    fetchDrawing = async (data) => {
        let id = data.payload.id;
        let result = await this.imageDatabaseWorker.getDrawing(this.loginToken, id);
        if (data.payload.withCommands != true) result.commands = null;
        this.emitEvent(data.event + " response", {
            drawing: result
        }); 
    }
    getCommands = async (data) => {
        let id = data.payload.id;
        let result = await this.imageDatabaseWorker.getDrawing(this.loginToken, id);
        this.emitEvent(data.event + " response", {
            commands: result.commands
        });
    }
    getUserMeta = async (data) => {
        let limit = data.payload.limit;
        if (!limit) limit = -1;
        let query = data.payload.query;
        let result = await this.imageDatabaseWorker.getUserMeta(this.loginToken, limit, query);
        this.emitEvent(data.event + " response", {
            drawings: result.drawings
        }); 
    }
    clearCloud = async () => {
        if (!this.patron) await this.imageDatabaseWorker.removeEntries(this.loginToken, this.loginDate - 1000 * 60 * 60 * 24 * 30); // delete older than 30 days
    }
}
module.exports = TypoSocket;