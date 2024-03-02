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
      username              TEXT NOT NULL,
      text                  TEXT,
      creation_date         TEXT NOT NULL,
      modification_date     TEXT NOt NULL,
      "order"               INTEGER NOT NULL,
      deleted               INTEGER NOT NULL,
      archived              INTEGER NOT NULL
    )`,
  ).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_username on notes (username)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_creation_date on notes (creation_date)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_modification_date on notes (modification_date)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_deleted on notes (deleted)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_order on notes ("order")`).run();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS users (
      username              TEXT PRIMARY KEY,
      password_hash         TEXT NOT NULL
    )`,
  ).run();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS clients (
      token                 TEXT PRIMARY KEY,
      username              TEXT NOT NULL,
      sync_number           INTEGER NOT NULL,
      last_activity_date    TEXT NOT NULL
    )`,
  ).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_clients_username on clients (username)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_clients_last_activity_date on clients (last_activity_date)`).run();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS notes_queue (
      token                 TEXT NOT NULL,
      id                    TEXT NOT NULL,
      modification_date     TEXT NOT NULL,
      PRIMARY KEY (token, id)
    )`,
  ).run();
}

export function get(): Database.Database {
  return db;
}
