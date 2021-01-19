class TypoSocket {
    constructor(socket) {
        this.socket = socket;
        this.socket.on("login", this.login);
    }
    login = (data) => {
        // set login
        this.loginToken = data.payload.loginToken;
        // add event handler
        this.socket.on("get user", this.getUser);
        console.log(`Login was set for socket: ${this.loginToken}\nAdded get user event`);
    }
    getUser = (data) => {
        // get user data
        this.socket.emit(data.event + " response", { loginToken: this.loginToken });
        console.log(`Emitted event: ${data.event} response`);
    }
}
module.exports = TypoSocket;