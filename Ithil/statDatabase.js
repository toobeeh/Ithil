const statDb = {
    Database: require("better-sqlite3"),
    path: "/home/pi/Database/typoStats.db",
    db: null,
    open: () => {
        statDb.db = new statDb.Database(statDb.path);
        statDb.db.pragma('journal_mode = WAL');
    },
    close: () => {
        statDb.db.close();
        statDb.db = null;
    },
    updateClientContact: (initTimestamp) => {
        try {
            statDb.open();
            statDb.db.prepare("REPLACE INTO clientContacts (clientInitTimestamp) VALUES ('?')").run(initTimestamp);
            statDb.close()
        }
        catch(e) {
            statDb.close();
            console.log(e);
        }
    }
}
module.exports = statDb;