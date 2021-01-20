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
            result.valid = true;
        }
        catch{
            return result;
        }
        palantirDb.close();
        return result;
    }
}
module.exports = palantirDb;