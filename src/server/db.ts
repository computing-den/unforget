import Database from 'better-sqlite3';
import path from 'node:path';

let db: Database.Database;

export function initDB() {
  const dbPath = path.join('private/unforget.db');
  const dbLog = (...args: any[]) => {
    console.log('sqlite: ', ...args);
  };

  db = new Database(dbPath, { verbose: dbLog });
  db.pragma('journal_mode = WAL');

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS notes (
      id                    TEXT PRIMARY KEY,
      text                  TEXT NOT NULL,
      creation_date         TEXT NOT NULL,
      modification_date     TEXT NOt NULL,
      "order"               INTEGER NOT NULL
    )`,
  ).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_creation_date on notes (creation_date)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_order on notes ("order")`).run();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS users (
      username              TEXT PRIMARY KEY,
      password_hash         TEXT NOT NULL,
      token                 TEXT NOT NULL
    )`,
  ).run();
}

export function get(): Database.Database {
  return db;
}

//     const usernameExists = db.prepare(`SELECT 1 from users where username = ?`).pluck().get(username);
//     const dbUser = db.prepare(`SELECT * from users where username = ?`).get(username) as t.DBUser | undefined;

// db.prepare(
//       `
//         INSERT INTO users
//         (username, hash, email, token, join_timestamp, token_timestamp)
//         VALUES
//         (?, ?, ?, ?, ?, ?)`,
//     ).run(username, hash, email, token, now, now);
