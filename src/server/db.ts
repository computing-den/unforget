import type * as t from '../common/types.js';
import * as cutil from '../common/util.js';
import Database, { Statement } from 'better-sqlite3';
import path from 'node:path';
import _ from 'lodash';

let db: Database.Database;

export function initDB() {
  const dbPath = path.join('private/unforget.db');
  const dbLog = (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('sqlite: ', ...args);
    }
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
      not_deleted           INTEGER NOT NULL DEFAULT 1,
      not_archived          INTEGER NOT NULL DEFAULT 1,
      pinned                INTEGER NOT NULL DEFAULT 0
    )`,
  ).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_username on notes (username)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_creation_date on notes (creation_date)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_modification_date on notes (modification_date)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_order on notes ("order")`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_not_deleted on notes (not_deleted)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_not_archived on notes (not_archived)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_pinned on notes (pinned)`).run();

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

export function getSyncNumber(user: t.LocalUser) {
  return db.prepare(`SELECT sync_number FROM clients where token = ?`).pluck().get(user.token) as number;
}

export function getQueuedNotes(user: t.LocalUser): t.Note[] {
  const dbNotes = db
    .prepare(`SELECT * FROM notes WHERE id IN (SELECT id FROM notes_queue WHERE token = ?)`)
    .all(user.token) as t.DBNote[];
  return dbNotes.map(dbNoteToNote);
}

export function getQueuedNoteHeads(user: t.LocalUser): t.NoteHead[] {
  return db.prepare(`SELECT id, modification_date FROM notes_queue WHERE token = ?`).all(user.token) as t.NoteHead[];
}

export function getNotes(user: t.LocalUser): t.Note[] {
  const dbNotes = db.prepare(`SELECT * FROM notes WHERE username = ?`).all(user.username) as t.DBNote[];
  return dbNotes.map(dbNoteToNote);
}

export function dbNoteToNote(dbNote: t.DBNote): t.Note {
  return _.omit(dbNote, 'username');
}

export function logout(user: t.LocalUser) {
  const deleteFromQueue = db.prepare<[{ token: string }]>(`DELETE FROM notes_queue WHERE token = :token`);
  const deleteFromClient = db.prepare<[{ token: string }]>(`DELETE FROM clients WHERE token = :token`);

  db.transaction(() => {
    deleteFromQueue.run(user);
    deleteFromClient.run(user);
  })();
}

export function mergeSyncData(user: t.LocalUser, reqSyncData: t.SyncData, resSyncData: t.SyncData) {
  const getDbNote = db.prepare<[{ username: string; id: string }]>(
    `SELECT * FROM notes WHERE username = :username AND id = :id`,
  );
  const putDbNote = preparePutNote();
  const deleteFromQueue = db.prepare<[{ token: string; id: string }]>(
    `DELETE FROM notes_queue WHERE token = :token AND id = :id`,
  );
  const updateSyncNumber = db.prepare<[{ token: string; sync_number: number }]>(
    `UPDATE clients SET sync_number = :sync_number WHERE token = :token`,
  );
  const getClients = db.prepare<[t.LocalUser]>(
    `SELECT username, token FROM clients WHERE username = :username AND token != :token`,
  );
  const insertIntoQueue = prepareInsertIntoQueue();

  db.transaction(() => {
    // Replace local notes with received notes if necessary.
    for (const receivedNote of reqSyncData.notes) {
      const localNote = getDbNote.get({ username: user.username, id: receivedNote.id }) as t.DBNote | undefined;
      if (cutil.isNoteNewerThan(receivedNote, localNote)) {
        const dbNote: t.DBNote = { ...receivedNote, username: user.username };
        putDbNote.run(dbNote);
      }
    }

    // Clear local note queue.
    const queuedNoteHeads = getQueuedNoteHeads(user);
    const sentNotesById = _.keyBy(resSyncData.notes, 'id');
    for (const queued of queuedNoteHeads) {
      const sent = sentNotesById[queued.id] as t.Note | undefined;
      if (sent && queued.modification_date <= sent.modification_date) {
        deleteFromQueue.run({ token: user.token, id: queued.id });
      }
    }

    // Add received notes to notes_queue for other clients of the same user.
    const otherClients = getClients.all(user) as t.LocalUser[];
    for (const receivedNote of reqSyncData.notes) {
      for (const client of otherClients) {
        const dbNoteHead: t.DBNoteHead = {
          id: receivedNote.id,
          modification_date: receivedNote.modification_date,
          token: client.token,
        };
        insertIntoQueue.run(dbNoteHead);
      }
    }

    // Update sync number.
    const newSyncNumber = Math.max(reqSyncData.syncNumber, resSyncData.syncNumber) + 1;
    updateSyncNumber.run({ token: user.token, sync_number: newSyncNumber });
  })();
}

export function importNotes(username: string, notes: t.Note[]) {
  const getDbNote = db.prepare<[{ username: string; id: string }]>(
    `SELECT * FROM notes WHERE username = :username AND id = :id`,
  );
  const putDbNote = preparePutNote();
  const getClients = db.prepare<[string]>(`SELECT username, token FROM clients WHERE username = ?`);
  const insertIntoQueue = prepareInsertIntoQueue();

  db.transaction(() => {
    // Replace local notes with notes if necessary.
    for (const note of notes) {
      const localNote = getDbNote.get({ username, id: note.id }) as t.DBNote | undefined;
      if (cutil.isNoteNewerThan(note, localNote)) {
        const dbNote: t.DBNote = { ...note, username };
        console.log(dbNote);
        putDbNote.run(dbNote);
      }
    }

    // Add notes to notes_queue for all clients of the user.
    const clients = getClients.all(username) as t.LocalUser[];
    for (const note of notes) {
      for (const client of clients) {
        const dbNoteHead: t.DBNoteHead = {
          id: note.id,
          modification_date: note.modification_date,
          token: client.token,
        };
        insertIntoQueue.run(dbNoteHead);
      }
    }
  })();
}

function prepareInsertIntoQueue(): Statement<[t.DBNoteHead]> {
  return db.prepare(`
    INSERT INTO notes_queue (token, id, modification_date)
    VALUES (:token, :id, :modification_date)
    ON CONFLICT (token, id) DO UPDATE SET
      modification_date = excluded.modification_date
    WHERE excluded.modification_date > notes_queue.modification_date
  `);
}

function preparePutNote(): Statement<[t.DBNote]> {
  return db.prepare(`
    INSERT OR REPLACE INTO notes
      (id, username, text, creation_date, modification_date, "order", not_deleted, not_archived, pinned)
    VALUES
      (:id, :username, :text, :creation_date, :modification_date, :order, :not_deleted, :not_archived, :pinned)
  `);
}
