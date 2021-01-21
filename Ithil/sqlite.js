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
            rows = palantirDb.db.prepare("SELECT * FROM GuildLobbies").all();
            result.lobbies = [];
            rows.forEach(row => result.lobbies.push({ guildID: row.GuildID, guildLobbies: JSON.parse(row.Lobbies) }));
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
        let rows;
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
            // get eventdrops
            if (indicator == "id") {
                let dbres = palantirDb.db.prepare("SELECT * FROM Lobbies WHERE LobbyID = ?").get(value);
                if (dbres) {
                    result.lobby = JSON.parse(dbres.Lobby);
                    result.found = true;
                }
                else result.found = false;
                result.valid = true;
            }
            else {
                //palantirDb.db.prepare("SELECT * FROM Lobbies WHERE Lobby LIKE ?").all("'%" + value + "%'").forEach(lobbyMatch => {
                //    let obj = JSON.parse(lobbyMatch.Lobby);
                //    if (obj.Key == value) {
                //        result.lobby = obj;
                //        result.found = true;
                //    }
                //});
                //if (!result.lobby) result.found = false;
                //result.valid = true;
                let dbres = palantirDb.db.prepare("SELECT * FROM Lobbies WHERE Lobby LIKE ?").get("'%" + value + "%'");
                if (dbres) {
                    result.lobby = JSON.parse(dbres.Lobby);
                    result.found = true;
                }
                else result.found = false;
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
    }
}
module.exports = palantirDb;