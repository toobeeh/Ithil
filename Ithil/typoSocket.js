class TypoSocket {
    constructor(socket) {
        this.socket = socket;
        this.socket.on("login", this.login);
        // close if not logged in within 5s
        setTimeout(() => { if (!this.login) this.socket.disconnect(); }, 5000);
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

    // On login event: authorize user, close conn if unauthorized
    login = (data) => {
        // check if member exists with login
        let member = palantirDb.getUserByLogin(data.payload.loginToken);
        if (!member.valid) {
            this.emitEvent(data.event + " response", false);
            this.socket.disconnect();
        }
        // set login
        this.loginToken = data.payload.loginToken;
        this.socket.off("login", this.login);
        // add event handler
        this.socket.on("get user", this.getUser);
        this.emitEvent(data.event + " response", true);
        console.log(`Login was set for socket: ${this.loginToken}\nAdded get user event`);
    }
    // on get user event: respond with member data
    getUser = (data) => {
        // get user data
        let member = palantirDb.getUserByLogin(this.loginToken);
        this.emitEvent(data.event + " response", { user: member });
    }
}
module.exports = TypoSocket;