import type * as t from '../common/types.js';
import * as cutil from '../common/util.js';
import Database, { Statement } from 'better-sqlite3';
import path from 'node:path';
import _ from 'lodash';

let db: Database.Database;

export function initDB() {
  const dbPath = path.join('private/unforget.db');
  const dbLog = (...args: any[]) => {
    // if (process.env.NODE_ENV === 'development') {
    //   console.log('sqlite: ', ...args);
    // }
  };

  db = new Database(dbPath, { verbose: dbLog });
  db.pragma('journal_mode = WAL');

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS notes (
      id                    TEXT PRIMARY KEY,
      username              TEXT NOT NULL,
      modification_date     TEXT NOT NULL,
      iv                    TEXT NOT NULL,
      encrypted_base64      TEXT
    )`,
  ).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_username on notes (username)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS index_notes_modification_date on notes (modification_date)`).run();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS users (
      username              TEXT PRIMARY KEY,
      password_double_hash  TEXT NOT NULL,
      password_salt         TEXT NOT NULL,
      encryption_salt       TEXT NOT NULL
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

export function getSyncNumber(client: t.ServerUserClient) {
  return db.prepare(`SELECT sync_number FROM clients where token = ?`).pluck().get(client.token) as number;
}

export function getQueuedNotes(client: t.ServerUserClient): t.EncryptedNote[] {
  const dbNotes = db
    .prepare(`SELECT * FROM notes WHERE id IN (SELECT id FROM notes_queue WHERE token = ?)`)
    .all(client.token) as t.DBEncryptedNote[];
  return dbNotes.map(dbNoteToNote);
}

export function getQueuedNoteHeads(client: t.ServerUserClient): t.NoteHead[] {
  return db.prepare(`SELECT id, modification_date FROM notes_queue WHERE token = ?`).all(client.token) as t.NoteHead[];
}

export function getNotes(client: t.ServerUserClient): t.EncryptedNote[] {
  const dbNotes = db.prepare(`SELECT * FROM notes WHERE username = ?`).all(client.username) as t.DBEncryptedNote[];
  return dbNotes.map(dbNoteToNote);
}

export function getNoteHeads(client: t.ServerUserClient): t.NoteHead[] {
  return db.prepare(`SELECT id, modification_date FROM notes WHERE username = ?`).all(client.username) as t.NoteHead[];
}

export function dbNoteToNote(dbNote: t.DBEncryptedNote): t.EncryptedNote {
  return _.omit(dbNote, 'username');
}

export function logout(token: string) {
  const deleteFromQueue = db.prepare<[string]>(`DELETE FROM notes_queue WHERE token = ?`);
  const deleteFromClient = db.prepare<[string]>(`DELETE FROM clients WHERE token = ?`);

  db.transaction(() => {
    deleteFromQueue.run(token);
    deleteFromClient.run(token);
  })();
}

export function mergeSyncData(client: t.ServerUserClient, reqSyncData: t.SyncData, resSyncData: t.SyncData) {
  // const isDebugNote = (note: t.EncryptedNote) => note.text?.includes('password protected notes');
  // console.log('XXX mergeSyncData, debug received note: ', reqSyncData.notes.find(isDebugNote));

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
  const getClients = db.prepare<[t.ServerUserClient]>(
    `SELECT username, token FROM clients WHERE username = :username AND token != :token`,
  );
  const insertIntoQueue = prepareInsertIntoQueue();

  db.transaction(() => {
    // Replace local notes with received notes if necessary.
    for (const receivedNote of reqSyncData.notes) {
      const localNote = getDbNote.get({ username: client.username, id: receivedNote.id }) as
        | t.DBEncryptedNote
        | undefined;
      // if (localNote && isDebugNote(localNote)) console.log('XXX2 localNote: ', localNote);

      if (cutil.isNoteNewerThan(receivedNote, localNote)) {
        // if (localNote && isDebugNote(localNote)) console.log('XXX3 receivedNote is newer than localNote');
        const dbNote: t.DBEncryptedNote = { ...receivedNote, username: client.username };
        putDbNote.run(dbNote);
      }
    }

    // Clear local note queue.
    const queuedNoteHeads = getQueuedNoteHeads(client);
    const sentNotesById = _.keyBy(resSyncData.notes, 'id');
    for (const queued of queuedNoteHeads) {
      const sent = sentNotesById[queued.id] as t.EncryptedNote | undefined;
      if (sent && queued.modification_date <= sent.modification_date) {
        deleteFromQueue.run({ token: client.token, id: queued.id });
      }
    }

    // Add received notes to notes_queue for other clients of the same user.
    const otherClients = getClients.all(client) as t.ServerUserClient[];
    for (const receivedNote of reqSyncData.notes) {
      for (const otherClient of otherClients) {
        const dbNoteHead: t.DBNoteHead = {
          id: receivedNote.id,
          modification_date: receivedNote.modification_date,
          token: otherClient.token,
        };
        insertIntoQueue.run(dbNoteHead);
      }
    }

    // Update sync number.
    const newSyncNumber = Math.max(reqSyncData.syncNumber, resSyncData.syncNumber) + 1;
    updateSyncNumber.run({ token: client.token, sync_number: newSyncNumber });
  })();
}

export function mergeSyncHeadsData(
  client: t.ServerUserClient,
  reqSyncHeadsData: t.SyncHeadsData,
  resSyncHeadsData: t.SyncHeadsData,
) {
  // const isDebugNote = (note: t.EncryptedNote) => note.text?.includes('password protected notes');
  // console.log('XXX mergeSyncData, debug received note: ', reqSyncData.notes.find(isDebugNote));

  const deleteFromQueue = db.prepare<[{ token: string; id: string }]>(
    `DELETE FROM notes_queue WHERE token = :token AND id = :id`,
  );
  const updateSyncNumber = db.prepare<[{ token: string; sync_number: number }]>(
    `UPDATE clients SET sync_number = :sync_number WHERE token = :token`,
  );
  const insertIntoQueue = prepareInsertIntoQueue();

  db.transaction(() => {
    const sentNoteHeads = resSyncHeadsData.noteHeads;
    const receivedNoteHeadsById = _.keyBy(reqSyncHeadsData.noteHeads, 'id');
    let addedToQueueCount = 0;
    let removedFromQueueCount = 0;

    const latestQueueItems = getQueuedNoteHeads(client);
    const latestQueueItemsById = _.keyBy(latestQueueItems, 'id');

    // Put the sent note head in queue if necessary to be sent in full later, or delete it from queue.
    for (const sentNoteHead of sentNoteHeads) {
      const receivedNoteHead = receivedNoteHeadsById[sentNoteHead.id];
      if (cutil.isNoteNewerThan(sentNoteHead, receivedNoteHead)) {
        insertIntoQueue.run({
          id: sentNoteHead.id,
          modification_date: sentNoteHead.modification_date,
          token: client.token,
        });
        addedToQueueCount++;
      } else if (latestQueueItemsById[sentNoteHead.id]) {
        deleteFromQueue.run({ token: client.token, id: sentNoteHead.id });
        removedFromQueueCount++;
      }
    }

    // Update sync number.
    const newSyncNumber = Math.max(reqSyncHeadsData.syncNumber, resSyncHeadsData.syncNumber) + 1;
    updateSyncNumber.run({ token: client.token, sync_number: newSyncNumber });

    if (process.env.NODE_ENV === 'development') {
      console.log(`mergeSyncHeadsData added ${addedToQueueCount} to queue and removed ${removedFromQueueCount}`);
    }
  })();
}

export function importNotes(username: string, notes: t.EncryptedNote[]) {
  const getDbNote = db.prepare<[{ username: string; id: string }]>(
    `SELECT * FROM notes WHERE username = :username AND id = :id`,
  );
  const putDbNote = preparePutNote();
  const getClients = db.prepare<[string]>(`SELECT username, token FROM clients WHERE username = ?`);
  const insertIntoQueue = prepareInsertIntoQueue();

  db.transaction(() => {
    // Replace local notes with notes if necessary.
    for (const note of notes) {
      const localNote = getDbNote.get({ username, id: note.id }) as t.DBEncryptedNote | undefined;
      if (cutil.isNoteNewerThan(note, localNote)) {
        const dbNote: t.DBEncryptedNote = { ...note, username };
        console.log(dbNote);
        putDbNote.run(dbNote);
      }
    }

    // Add notes to notes_queue for all clients of the user.
    const clients = getClients.all(username) as t.ServerUserClient[];
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

function preparePutNote(): Statement<[t.DBEncryptedNote]> {
  return db.prepare(`
    INSERT OR REPLACE INTO notes
      (id, username, modification_date, encrypted_base64, iv)
    VALUES
      (:id, :username, :modification_date, :encrypted_base64, :iv)
  `);
}
