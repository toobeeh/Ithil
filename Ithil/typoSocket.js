class TypoSocket {
    constructor(socket) {
        this.socket = socket;
        this.socket.on("login", this.login);
    }
    emitEvent = (event, payload, listenResponse = false, responseTimeout = 2000) => {
        return new Promise((resolve, reject) => {
            if (listenResponse) this.socket.once(event + " response", (data) => {
                resolve(data.payload);
            });
            try { this.socket.emit(event, { event: event, payload: payload }); }
            catch { reject(new Error("Failed emitting event: " + event)); }
            if (!listenResponse) resolve(true);
            else setTimeout(() => reject(new Error("Response timed out")), responseTimeout);
        });
    }
    login = (data) => {
        // set login
        this.loginToken = data.payload.loginToken;
        this.socket.off("login", this.login);
        // add event handler
        this.socket.on("get user", this.getUser);
        console.log(`Login was set for socket: ${this.loginToken}\nAdded get user event`);
    }
    getUser = (data) => {
        // get user data
        this.emitEvent(data.event + " response", { loginToken: this.loginToken });
        console.log(`Emitted event: ${data.event} response`);
    }
}
module.exports = TypoSocket;