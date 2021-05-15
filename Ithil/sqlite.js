const palantirDb = {
    Database: require("better-sqlite3"),
    path: "/home/pi/Database/palantir.db",
    db: null,
    open: () => {
        palantirDb.db = new palantirDb.Database(palantirDb.path);
        palantirDb.db.pragma('journal_mode = WAL');
    },
    close: () => {
        palantirDb.db.close();
        palantirDb.db = null;
    },
    getUserByLogin: (login) => {
        let result = { valid: false };
        let row;
        try {
            palantirDb.open();
            row = palantirDb.db.prepare("SELECT * FROM Members WHERE Login = ?").get(login);
            result = {
                valid: true,
                member: JSON.parse(row.Member),
                bubbles: row.Bubbles,
                sprites: row.Sprites,
                drops: row.Drops,
                flag: row.Flag
            };
        }
        catch{
            palantirDb.close();
            return result;
        }
        palantirDb.close();
        return result;
    },
    getActiveLobbies: () => {
        let result = { valid: false };
        let rows;
        try {
            palantirDb.open();
            rows = palantirDb.db.prepare(`SELECT "'" || GuildID || "'" as GuildID, Lobbies FROM GuildLobbies`).all();
            result.lobbies = [];
            rows.forEach(row => {
                console.log(row.GuildID);
                result.lobbies.push({ guildID: "" + row.GuildID, guildLobbies: JSON.parse(row.Lobbies) });
            });
            result.lobbies.forEach(g => g.guildLobbies.forEach(l => l.Players = l.Players.length));
            result.valid = true;
        }
        catch{
            palantirDb.close();
            return result;
        }
        palantirDb.close();
        return result;
    },
    getPublicData: () => {
        let result = { valid: false };
        try {
            palantirDb.open();
            // get eventdrops
            eventdrops = palantirDb.db.prepare("SELECT * FROM EventDrops LEFT JOIN Events ON EventDrops.EventID = Events.EventID").all();
            // get active sprites
            onlinesprites = palantirDb.db.prepare("SELECT * FROM OnlineSprites").all();
            // get sprites
            sprites = palantirDb.db.prepare("SELECT * FROM Sprites").all();
            result.valid = true;
            result.publicData = {
                drops: eventdrops,
                onlineSprites: onlinesprites,
                sprites: sprites,
            }
        }
        catch{
            palantirDb.close();
            return result;
        }
        palantirDb.close();
        return result;
    },
    getLobby: (value, indicator = "key") => {
        let result = { valid: false };
        if (indicator != "key" && indicator != "id") return result;
        try {
            palantirDb.open();
            if (indicator == "id") { // get lobby by id
                let dbres = palantirDb.db.prepare("SELECT * FROM Lobbies WHERE LobbyID = ?").get(value);
                if (dbres) {
                    result.lobby = JSON.parse(dbres.Lobby);
                    result.found = true;
                }
                else result.found = false;
                result.valid = true;
            }
            else { // get lobby by key
                let statement = palantirDb.db.prepare("SELECT * FROM Lobbies");
                for (const lobbyMatch of statement.iterate()) {
                    let obj = JSON.parse(lobbyMatch.Lobby);
                    if (obj.Key == value) {
                        result.lobby = obj;
                        result.found = true;
                    }
                };
                if (!result.lobby) result.found = false;
                result.valid = true;
            }
        }
        catch (e) {
            palantirDb.close();
            result.error = e;
            return result;
        }
        palantirDb.close();
        return result;
    },
    setLobby: (id, key, description = "", restriction = "") => {
        let result = { valid: false };
        try {
            palantirDb.open();
            //let r = palantirDb.db.prepare("SELECT json_extract(Lobby, '$.Restriction') as r FROM 'Lobbies' WHERE LobbyID = ").get(id).r;
            //console.log(r);
            palantirDb.db.prepare("REPLACE INTO Lobbies VALUES(?,?)").run(id, JSON.stringify({ ID: id, Key: key, Description: description, Restriction: restriction }));
            result = { valid: true };
        }
        catch{
            palantirDb.close();
            return result;
        }
        palantirDb.close();
        return result;
    },
    writeLobbyReport: (lobbies) => {
        let result = { valid: false };
        try {
            palantirDb.open();
            lobbies.forEach(lobby => {
                palantirDb.db.prepare("REPLACE INTO REPORTS VALUES(?,?,?,datetime('now'))")
                    .run(lobby.ID, lobby.ObserveToken, JSON.stringify(lobby));
            });
            result = { valid: true };
        }
        catch{
            palantirDb.close();
            return result;
        }
        palantirDb.close();
        return result;
    },
    writePlayerStatus: (status, session) => {
        let result = { valid: false };
        try {
            palantirDb.open();
            palantirDb.db.prepare("REPLACE INTO Status VALUES(?,?,datetime('now'))")
                .run(session, JSON.stringify(status));
            result = { valid: true };
        }
        catch{
            palantirDb.close();
            return result;
        }
        palantirDb.close();
        return result;
    },
    clearVolatile: () => {
        let result = { valid: false };
        try {
            palantirDb.open();
            palantirDb.db.prepare("DELETE FROM Reports WHERE Date < datetime('now', '-30 seconds')").run();
            palantirDb.db.prepare("DELETE FROM Status WHERE Date < datetime('now', '-10 seconds')").run();
            palantirDb.db.prepare("DELETE FROM OnlineSprites WHERE Date < datetime('now', '-10 seconds')").run();
            palantirDb.db.prepare("DELETE From Lobbies WHERE json_extract(Lobby, '$.ID') NOT IN (SELECT DISTINCT json_extract(Status, '$.LobbyID') from Status WHERE json_extract(Status, '$.LobbyID') IS NOT NULL) AND " +Date.now()+" - LobbyID > 60000;").run();
            // delete duplicate keys
            let lobbies = palantirDb.db.prepare("SELECT LobbyID, json_extract(Lobby, '$.Key') as LobbyKey FROM Lobbies").all();
            lobbies.forEach((lobby, index) => {
                if (lobbies.findIndex(unique => lobby.LobbyKey == unique.LobbyKey) != index && lobby.LobbyKey.indexOf("https") < 0) {
                    console.log("dupe found:" + lobby.key + lobby.LobbyID);
                    palantirDb.db.prepare("DELETE FROM Lobbies WHERE LobbyID = ?").run(lobby.LobbyID);
                }
            });
            result = { valid: true };
        }
        catch{
            palantirDb.close();
            return result;
        }
        palantirDb.close();
        return result;
    },
    getDrop: (id = -1) => {
        let result = { valid: false };
        try {
            palantirDb.open();
            // get drop
            let drop = id > -1 ? palantirDb.db.prepare("SELECT * FROM 'Drop' WHERE DropID = ?").get(id) :
                palantirDb.db.prepare("SELECT * FROM 'Drop'").get();
            result.valid = true;
            result.drop = drop;
        }
        catch{
            palantirDb.close();
            return result;
        }
        palantirDb.close();
        return result;
    },
    claimDrop: (lobbyKey, playerName, dropID, userid) => {
        let result = { valid: false };
        try {
            palantirDb.open();
            // get drop
            palantirDb.db.prepare("UPDATE 'Drop' SET CaughtLobbyKey = ?, CaughtLobbyPlayerID = ? WHERE DropID = ?").run(lobbyKey, playerName, dropID);
            palantirDb.db.prepare("INSERT INTO PastDrops Select * From 'Drop'").run();
            palantirDb.db.prepare("UPDATE PastDrops SET CaughtLobbyPlayerID = ? WHERE DropID = ?").run(userid, dropID);
            result.valid = true;
        }
        catch{
            palantirDb.close();
            return result;
        }
        palantirDb.close();
        return result;
    },
    rewardDrop: (login, eventdrop) => {
        let result = { valid: false };
        try {
            palantirDb.open();
            if (eventdrop > 0) {
                let info = palantirDb.db.prepare("UPDATE EventCredits SET Credit = Credit + 1 WHERE EventDropID = ? AND Login = ?").run(eventdrop, login);
                if (info.changes <= 0) palantirDb.db.prepare("INSERT INTO EventCredits VALUES(?, ?, 1)").run(login, eventdrop);
            }
            else palantirDb.db.prepare("UPDATE Members SET Drops = Drops + 1 WHERE Login = ?").run(login);
            result.valid = true;
        }
        catch{
            palantirDb.close();
            return result;
        }
        palantirDb.close();
        return result;
    },
    isPalantirLobbyOwner: (lobbyID, playerID) => {
        try {
            palantirDb.open();
            let lobbyplayers = palantirDb.db.prepare("select json_extract(Status, '$.LobbyPlayerID') as playerid from Status where json_extract(Status, '$.LobbyID') = ?").all(lobbyID);
            palantirDb.close();
            return !lobbyplayers.some(player => player.playerid < playerID);
        }
        catch (e) {
            console.log(e);
            palantirDb.close();
            return false;
        }
    }
}
module.exports = palantirDb;