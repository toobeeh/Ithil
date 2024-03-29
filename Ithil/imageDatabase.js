const { expose } = require("threads/worker");
class ImageDatabase {
    constructor(login) {
        const fs = require('fs');
        const Database = require("better-sqlite3");
        const path = "/home/pi/Webroot/rippro/userdb/udb" + login + ".db";
        this.path = path;
        // create db if not existent
        if (!fs.existsSync(path)) {
            let userdb = new Database(path);
            userdb.prepare('CREATE TABLE Commands("id" STRING, "commands" STRING);').run();
            userdb.prepare('CREATE TABLE BaseURI("id" STRING, "uri" STRING);').run();
            userdb.prepare('CREATE TABLE Drawings ("login" STRING, "id" STRING, "meta" STRING);').run();
            userdb.close();
        }
        // db object
        let db = undefined;
        // open the db 
        const open = () => {
            db = new Database(path);
            db.pragma('journal_mode = WAL');
        }
        const close = () => {
            if (db) db.close();
            db = null;
        }
        this.addDrawing = (login, id, meta) => {
            let success = false;
            try {
                open();
                db.prepare("INSERT INTO Drawings VALUES(?,?,?)").run(login, id, JSON.stringify(meta));
                close();
                success = true;
            }
            catch (e) {
                console.log(e.toString());
                close();
            }
            return success;
        }
        this.addDrawCommands = (id, commands) => {
            let success = false;
            try {
                open();
                db.prepare("INSERT INTO Commands VALUES(?,?)").run(id, JSON.stringify(commands));
                close();
                success = true;
            }
            catch (e) {
                console.log(e.toString());
                close();
            }
            return success;
        }
        this.addURI = (id, uri) => {
            let success = false;
            try {
                open();
                db.prepare("INSERT INTO BaseURI VALUES(?,?)").run(id, uri);
                close();
                success = true;
            }
            catch (e) {
                console.log(e.toString());
                close();
            }
            return success;
        }
        this.getDrawing = (id) => {
            let result = {};
            result.valid = false;
            try {
                open();
                let meta = db.prepare("SELECT * FROM Drawings WHERE id = ?").get(id).meta;
                let uri = db.prepare("SELECT * FROM BaseURI WHERE id = ?").get(id).uri;
                let commands = db.prepare("SELECT * FROM Commands WHERE id = ?").get(id).commands;
                result.commands = JSON.parse(commands);
                result.uri = uri;
                result.meta = JSON.parse(meta);
                close();
                result.valid = true;
            }
            catch (e) {
                console.log(e.toString());
                close();
            }
            return result;
        }
        this.getUserMeta = (login, limit = -1, query = {}) => {
            let result = {};
            result.valid = false;
            try {
                open();
                let where = "";
                if (query.own === true) where += " AND json_extract(meta,'$.own') ";
                if (query.name) where += " AND json_extract(meta,'$.name') like '%" + query.name + "%'";
                if (query.author) where += " AND json_extract(meta,'$.author') like '%" + query.author + "%'";
                if (query.date) where += " AND json_extract(meta,'$.date') like '%" + query.date + "%'";
                let rows = db.prepare("SELECT * FROM Drawings WHERE login = ? " + where + " ORDER BY id DESC" + (limit > 0 ? " LIMIT " + limit : "")).all(login);
                result.drawings = [];
                rows.forEach(row => {
                    if (limit > 0 && result.drawings.length > limit) return;
                    result.drawings.push({ id: row.id, meta: JSON.parse(row.meta) });
                });
                close();
                result.valid = true;
            }
            catch (e) {
                console.log(e.toString());
                close();
            }
            return result;
        }
        this.removeEntries = (login, logindate) => {
            let result = {};
            result.valid = false;
            try {
                open(); // delete drawings
                //console.log((new Date()).toLocaleTimeString() + " start delete " + path);
                db.prepare("DELETE FROM BaseURI WHERE id IN (SELECT id FROM Drawings WHERE login = ? AND id < ?)").run(login, logindate);
                db.prepare("DELETE FROM Commands WHERE id IN (SELECT id FROM Drawings WHERE login = ? AND id < ?)").run(login, logindate);
                db.prepare("DELETE FROM Drawings WHERE login = ? AND id < ?").run(login, logindate);
                //console.log((new Date()).toLocaleTimeString() + " end delete ");
                close();
                result.valid = true;
            }
            catch (e) {
                console.log(e.toString());
                close();
            }
            return result;
        }
        this.removeDrawing = (login, id) => {
            let result = {};
            result.valid = false;
            try {
                open();
                if (db.prepare("SELECT * FROM Drawings WHERE ID = ?").get(id).login != login) throw new Error("Unauthorized delete request");
                db.prepare("DELETE FROM Drawings WHERE ID = ?").run(id);
                db.prepare("DELETE FROM BaseURI WHERE ID = ?").run(id);
                db.prepare("DELETE FROM Commands WHERE ID = ?").run(id);
                close();
                result.valid = true;
            }
            catch (e) {
                console.log(e.toString());
                close();
            }
            return result;
        }
    }
}
let _database = null;
const database = (login) => {
    if (!_database) _database = new ImageDatabase(login);
    return _database;
}
const exposeInterface = {
    addDrawing(login, id, meta) {
        return database(login).addDrawing(login, id, meta);
    },
    addDrawCommands(login, id, commands) {
        return database(login).addDrawCommands(id, commands);
    },
    addURI(login, id, uri) {
        return database(login).addURI(id, uri);
    },
    getDrawing(login, id) {
        return database(login).getDrawing(id);
    },
    getUserMeta(login, limit = -1, query = {}) {
        return database(login).getUserMeta(login, limit, query);
    },
    removeEntries(login, logindate) {
        return database(login).removeEntries(login, logindate);
    },
    removeDrawing(login, id) {
        return database(login).removeDrawing(login, id);
    }
}
expose(exposeInterface);