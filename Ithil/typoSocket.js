class TypoSocket {
    constructor(socket, db, sharedData) {
        this.db = db;
        this.sharedData = sharedData;
        this.socket = socket;
        this.socket.on("login", this.login);
        this.socket.emit("public data", { event: "public data", payload: { publicData: this.sharedData.publicData } }); // send public data on beginning
    }
    // leave all rooms
    leaveAllRooms = () => this.socket.rooms.forEach(r => { if (r != this.socket.id) this.socket.leave(r); });
    // Function to emit event and optionally expect an response within a timeout
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
        let activeLobbies = this.sharedData.activeLobbies;
        if (!member.valid) {
            this.emitEvent(data.event + " response", { authorized: false});
            this.socket.join("public");
            return;
        }
        this.loginToken = data.payload.loginToken; // set login
        this.socket.off("login", this.login);
        this.socket.leaveAllRooms();
        this.socket.join("idle");// join idle room
        this.socket.on("get user", this.getUser); // add event handler get user
        this.socket.on("join lobby", this.joinLobby); // set lobby of socket, set playing and return lobbydata
        this.emitEvent(data.event + " response", { authorized: true, activeLobbies: activeLobbies }); // reply with status
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
        this.lobbyData = lobbyData;
        responseData.lobbyData = lobbyData;
        this.socket.leaveAllRooms();
        this.socket.join("playing");
        this.emitEvent(data.event + " response", responseData);
    }
    // on report lobby event: get lobby and write report
    reportLobby = (data) => {
        // get lobby
        // write database
    }
}
module.exports = TypoSocket;