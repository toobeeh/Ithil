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
    }
    getUser = (data) => {
        // get user data
        this.socket.emit(data.event + " response", { loginToken: this.loginToken });
    }
}
module.exports = TypoSocket;