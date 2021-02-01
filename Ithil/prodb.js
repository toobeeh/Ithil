const prodb = {
    Database: require("better-sqlite3"),
    path: "/home/pi/Webroot/rippro/rippro.db",
    db: null,
    open: () => {
        prodb.db = new prodb.Database(prodb.path);
        prodb.db.pragma('journal_mode = WAL');
    },
    close: () => {
        prodb.db.close();
        prodb.db = null;
    },
    addDrawing: (login, id, meta) => {
        success = false;
        try {
            prodb.open();
            prodb.db.prepare("INSERT INTO Drawings VALUES(?,?,?)").run(login, id, JSON.stringify(meta));
            prodb.close();
            success = true;
        }
        catch (e) {
            console.log(e.toString());
            prodb.close();
        }
        return success;
    },
    addDrawCommands: (id, commands) => {
        success = false;
        try {
            prodb.open();
            prodb.db.prepare("INSERT INTO Commands VALUES(?,?)").run(id, JSON.stringify(commands));
            prodb.close();
            success = true;
        }
        catch (e) {
            console.log(e.toString());
            prodb.close();
        }
        return success;
    }
    ,
    addURI: (id, uri) => {
        success = false;
        try {
            prodb.open();
            prodb.db.prepare("INSERT INTO BaseURI VALUES(?,?)").run(id, uri);
            prodb.close();
            success = true;
        }
        catch (e) {
            console.log(e.toString());
            prodb.close();
        }
        return success;
    },
    getDrawing: (id) => {
        let result = {};
        result.valid = false;
        try {
            prodb.open();
            let meta = prodb.db.prepare("SELECT * FROM Drawings WHERE id = ?").get(id).Meta;
            let uri = prodb.db.prepare("SELECT * FROM BaseURI WHERE id = ?").get(id).URI;
            let commands = prodb.db.prepare("SELECT * FROM Commands WHERE id = ?").get(id).Commands;
            prodb.close();
            result.valid = true;
            result.commands = JSON.parse(commands);
            result.uri = uri;
            result.meta = JSON.parse(meta);
        }
        catch (e) {
            console.log(e.toString());
            prodb.close();
        }
        return result;
    },
    getUserMeta: (login, limit = -1) => {
        let result = {};
        result.valid = false;
        try {
            prodb.open();
            let rows = prodb.db.prepare("SELECT * FROM Drawings WHERE Login = ? ORDER BY ID DESC").all(login);
            prodb.close();
            result.drawings = [];
            rows.forEach(row => {
                if (limit > 0 && result.drawings.length > limit) return;
                result.drawings.push({ id: row.ID, meta: JSON.parse(row.Meta) });
            })
            result.valid = true;
        }
        catch (e) {
            console.log(e.toString());
            prodb.close();
        }
        return result;
    }
}
module.exports = prodb;