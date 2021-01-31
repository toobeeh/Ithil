const prodb = {
    Database: require("better-sqlite3"),
    path: "/home/pi/Webroot/rippro/rippro.db",
    db: null,
    open: () => {
        palantirDb.db = new palantirDb.Database(palantirDb.path);
        palantirDb.db.pragma('journal_mode = WAL');
    },
    close: () => {
        palantirDb.db.close();
        palantirDb.db = null;
    },
    addDrawing: (login, id, meta) => {
        success = false;
        try {
            prodb.open();
            palantirDb.db.prepare("INSERT INTO Drawings VALUES(?,?,?)").run(login, id, JSON.stringify(meta));
            prodb.close();
            success = true;
        }
        catch (e) {
            console.log(e.toString());
            prob.close();
        }
        return success;
    },
    addDrawCommands: (id, commands) => {
        success = false;
        try {
            prodb.open();
            palantirDb.db.prepare("INSERT INTO Commands VALUES(?,?)").run(id, JSON.stringify(commands));
            prodb.close();
            success = true;
        }
        catch (e) {
            console.log(e.toString());
            prob.close();
        }
        return success;
    }
    ,
    addURI: (id, uri) => {
        success = false;
        try {
            prodb.open();
            palantirDb.db.prepare("INSERT INTO BaseURI VALUES(?,?)").run(id, uri);
            prodb.close();
            success = true;
        }
        catch (e) {
            console.log(e.toString());
            prob.close();
        }
        return success;
    },
    getDrawing: (id) => {
        result.valid = false;
        try {
            prodb.open();
            let meta = palantirDb.db.prepare("SELECT * FROM Drawings WHERE id = ?").get(id).Meta;
            let uri = palantirDb.db.prepare("SELECT * FROM BaseURI WHERE id = ?").get(id).URI;
            let commands = palantirDb.db.prepare("SELECT * FROM Commands WHERE id = ?").get(id).Commands;
            prodb.close();
            result.valid = true;
            result.commands = commands;
            result.uri = uri;
            result.meta = meta;
        }
        catch (e) {
            console.log(e.toString());
            prob.close();
        }
        return result;
    }
}
module.exports = prodb;