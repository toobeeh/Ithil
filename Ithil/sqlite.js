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
        palantirDb.open();
        let result = { valid: false };
        let row = palantirDb.db.prepare("SELECT * FROM Members WHERE Login = ?").get(login);
        if(row) result = {
            valid: true,
            member: JSON.parse(row.Member),
            bubbles: row.Bubbles,
            sprites: row.Sprites,
            drops: row.Drops,
            flag: row.Flag
        };
        palantirDb.close();
        return result;
    }
}
module.exports = palantirDb;