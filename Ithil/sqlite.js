const palantirDb = {
    sqlite3: require("sqlite3").verbose(),
    path: "/home/pi/Database/palantir.db",
    db: null,
    open: () => {
        palantirDb.db = new sqlite3.Database(palantirDb.path);
        palantirDb.db.run('PRAGMA journal_mode = WAL;');
    },
    close: () => {
        palantirDb.db.close();
        palantirDb.db = null;
    },
    getUserByLogin: (login) => {
        palantirDb.open();
        let query = palantirDb.db.prepare("SELECT * FROM Members WHERE Login = ?");
        let result = { valid: false };
        query.get(login, (error, row) => {
            if (!error) result = {
                valid: true,
                member: JSON.parse(row.Member),
                bubbles: row.Bubbles,
                sprites: row.Sprites,
                drops: row.Drops,
                flag: row.Flag
            };
        });
        palantirDb.close();
        return result;
    }
}
module.exports = palantirDb;