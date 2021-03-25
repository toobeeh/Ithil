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
            let meta = prodb.db.prepare("SELECT * FROM Drawings WHERE id = ?").get(id).meta;
            let uri = prodb.db.prepare("SELECT * FROM BaseURI WHERE id = ?").get(id).uri;
            let commands = prodb.db.prepare("SELECT * FROM Commands WHERE id = ?").get(id).commands;
            result.commands = JSON.parse(commands);
            result.uri = uri;
            result.meta = JSON.parse(meta);
            prodb.close();
            result.valid = true;
        }
        catch (e) {
            console.log(e.toString());
            prodb.close();
        }
        return result;
    },
    getUserMeta: (login, limit = -1, query = {}) => {
        let result = {};
        result.valid = false;
        try {
            prodb.open();
            let where = "";
            if (query.own === true) where += " AND json_extract(meta,'$.own') ";
            if (query.name) where += " AND json_extract(meta,'$.name') like '%" + query.name + "%'";
            if (query.author) where += " AND json_extract(meta,'$.author') like '%" + query.author + "%'";
            if (query.date) where += " AND json_extract(meta,'$.date') like '%" + query.date + "%'";
            let rows = prodb.db.prepare("SELECT * FROM Drawings WHERE login = ? " + where + " ORDER BY id DESC").all(login);
            result.drawings = [];
            rows.forEach(row => {
                if (limit > 0 && result.drawings.length > limit) return;
                result.drawings.push({ id: row.id, meta: JSON.parse(row.meta) });
            });
            prodb.close();
            result.valid = true;
        }
        catch (e) {
            console.log(e.toString());
            prodb.close();
        }
        return result;
    },
    removeEntries: (login, logindate) => {
        let result = {};
        result.valid = false;
        try {
            prodb.open();
            // get drawings 
            console.log("deletin for " + login + " " + logindate);
            let rows = prodb.db.prepare("SELECT * FROM Drawings WHERE login = ? AND id < ?").all(login, logindate);
            console.log([...rows].length);
            rows.forEach(row => {
                prodb.db.prepare("DELETE FROM Drawings WHERE id = ?").run(row.id);
                prodb.db.prepare("DELETE FROM BaseURI WHERE id = ?").run(row.id);
                prodb.db.prepare("DELETE FROM Commands WHERE id = ?").run(row.id);
            });
            prodb.close();
            result.valid = true;
        }
        catch (e) {
            console.log(e.toString());
            prodb.close();
        }
        return result;
    },
    removeDrawing: (id, login) => {
        let result = {};
        result.valid = false;
        try {
            prodb.open();
            if(prodb.db.prepare("SELECT * FROM Drawings WHERE ID = ?").get(id).login != login) throw new Error("Unauthorized delete request");
            prodb.db.prepare("DELETE FROM Drawings WHERE ID = ?").run(id);
            prodb.db.prepare("DELETE FROM BaseURI WHERE ID = ?").run(id);
            prodb.db.prepare("DELETE FROM Commands WHERE ID = ?").run(id);
            prodb.close();
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