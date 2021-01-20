class TypoSocket {
    constructor(socket, db, sharedData) {
        this.db = db;
        this.sharedData = sharedData;
        this.socket = socket;
        this.socket.on("login", this.login);
        this.socket.volatile.emit("public data", { event: "public data", payload: { publicData: this.sharedData.publicData } }); // send public data on beginning
    }
    // Function to emit event and optionally expect an response within a timeout
    emitEvent = (event, payload, listenResponse = false, responseTimeout = 2000) => {
        return new Promise((resolve, reject) => {
            if (listenResponse) this.socket.once(event + " response", (data) => {
                resolve(data.payload);
                console.log(`Received response: ${event} @ ${this.loginToken}\n${data.payload}`);
            });
            try {
                this.socket.emit(event, { event: event, payload: payload });
                console.log(`Emitted event: ${event} @ ${this.loginToken}\n${payload}`);
            }
            catch { reject(new Error("Failed emitting event: " + event)); }
            if (!listenResponse) resolve(true);
            else setTimeout(() => reject(new Error("Response timed out")), responseTimeout);
        });
    }

    sendActiveLobbies = (lobbies) => { // send all verified of the active lobbies, called by server
        console.log(this.socket.rooms);
        if (!this.socket.rooms.has("idle")) return;
        let authenticatedLobbies = lobbies.filter(l => this.db.getUserByLogin.Guilds.any(g => g.GuildID == l.GuildID));
        this.socket.volatile.emit("active lobbies", { event: "active lobbies", payload: { lobbies: authenticatedLobbies } });
    }

    // On login event: authorize user, close conn if unauthorized
    login = (data) => {
        let member = this.db.getUserByLogin(data.payload.loginToken); // check if member exists with login
        let publicdata = this.sharedData.publicData;
        if (!member.valid) {
            this.emitEvent(data.event + " response", { authorized: false, public: publicdata });
            this.socket.join("public");
            return;
        }
        this.loginToken = data.payload.loginToken; // set login
        this.socket.off("login", this.login);
        this.socket.join("idle");// join idle room
        this.socket.on("get user", this.getUser); // add event handler get user
        this.emitEvent(data.event + " response", { authorized: true, public: publicdata }); // reply with status
        console.log(`Login was set for socket: ${this.loginToken}`);
    }
    // on get user event: respond with member data
    getUser = (data) => {
        // get user data
        let member = this.db.getUserByLogin(this.loginToken);
        this.emitEvent(data.event + " response", { user: member });
    }

}
module.exports = TypoSocket;