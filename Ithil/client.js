let sck = io("https://typo.rip:3000");

let emitEvent = (event, payload, listenResponse = false, responseTimeout = 2000) => {
    return new Promise((resolve, reject) => {
        if (listenResponse) sck.once(event + " repsonse", (data) => {
            resolve(data.payload);
        });
        try { sck.emit(event, { event: event, payload: payload }); }
        catch { reject(new Error("Failed emitting event: " + event)); }
        if (!listenResponse) resolve(true);
        else setTimeout(() => reject(new Error("Response timed out")), responseTimeout);
    });
}

await emitEvent("login", "123456");

await emitEvent("get user", null, true);