let i = io("https://typo.rip:4000", );
i.on("connect", () => {
    i.on("balanced port", (data) => console.log(data));
    i.emit("request port", { auth: "member" });
})