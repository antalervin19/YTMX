import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDirectory = path.resolve("data");

if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
}

const db = new Database(path.join(dataDirectory, "ytmx.db"));

db.pragma("journal_mode = WAL");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        google_id TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        avatar TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS registration_sessions (
        id TEXT PRIMARY KEY,
        google_id TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        avatar TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    );
`);

export default db;