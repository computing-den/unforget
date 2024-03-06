import 'dotenv/config';

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type * as t from '../common/types.js';
import * as cutil from '../common/util.js';
import * as db from './db.js';
import cookieParser from 'cookie-parser';
import _ from 'lodash';

const PUBLIC = path.join(process.cwd(), 'public');
const DIST_PUBLIC = path.join(process.cwd(), 'dist/public');

// interface MyLocals {
//   user?: LocalUser;
// }

declare global {
  namespace Express {
    interface Locals {
      user?: t.LocalUser;
    }
  }
}

// declare module 'express' {
//   export interface Response {
//     locals: MyLocals;
//   }
// }

db.initDB();

const app = express();
app.use(express.json());

app.use('/', express.static(PUBLIC));
app.use('/', express.static(DIST_PUBLIC));

app.use(cookieParser());

app.use((req, res, next) => {
  const token = req.cookies.unforget_token as string | undefined;
  if (token) {
    const user = db.get().prepare(`SELECT username, token FROM clients where token = ?`).get(token) as
      | t.LocalUser
      | undefined;
    res.locals = { user };
    if (user) {
      db.get()
        .prepare(
          `UPDATE clients SET last_activity_date = :last_activity_date WHERE username = :username AND token = :token`,
        )
        .run({ ...user, last_activity_date: new Date().toISOString() });
    }
  }
  next();
});

app.post('/api/login', async (req, res, next) => {
  try {
    const { username, password } = req.body as t.Credentials;
    const hash = await hashPassword(username, password);
    const user = db
      .get()
      .prepare(`SELECT * FROM users WHERE password_hash = :hash AND username = :username`)
      .get({ hash, username }) as t.DBUser | undefined;

    if (user) {
      loginAndRespond(user, res);
    } else {
      res.status(401).send({ message: 'Wrong username or password.' });
    }
  } catch (error) {
    next(error);
  }
});

app.post('/api/signup', async (req, res, next) => {
  try {
    const { username, password } = req.body as t.Credentials;
    const user = db.get().prepare(`SELECT * FROM users WHERE username = ?`).get(username) as t.DBUser | undefined;

    if (user) {
      res.status(401).send({ message: 'Username already exists.' });
    } else {
      const newUser: t.DBUser = { username, password_hash: await hashPassword(username, password) };
      db.get().prepare(`INSERT INTO users (username, password_hash) VALUES (:username, :password_hash)`).run(newUser);
      loginAndRespond(newUser, res);
    }
  } catch (error) {
    next(error);
  }
});

function loginAndRespond(user: t.DBUser, res: express.Response) {
  const token = createToken();
  const dbClient: t.DBClient = {
    username: user.username,
    token,
    sync_number: 0,
    last_activity_date: new Date().toISOString(),
  };
  db.get()
    .prepare(
      `
      INSERT INTO clients (username, token, sync_number, last_activity_date)
      VALUES (:username, :token, :sync_number, :last_activity_date)
      `,
    )
    .run(dbClient);
  res.cookie('unforget_token', token, { maxAge: 10 * 365 * 24 * 3600 * 1000 });
  res.send({ username: user.username, token });
}

app.get('/api/notes', authenticate, (req, res) => {
  console.log('GET /api/notes');
  const user = res.locals.user!;
  const notes = getNotes(user);
  res.set('Cache-Control', 'no-cache').send(notes);
});

app.post('/api/got-error', authenticate, (req, res) => {
  const { msg } = req.body as { msg: string };
  console.error(`Client got error: ${msg}`);
});

app.post('/api/partial-sync', authenticate, (req, res) => {
  console.log('POST /api/partial-sync', req.body);
  const user = res.locals.user!;
  const partialSyncReq: t.PartialSyncReq = req.body;
  const syncNumber = getSyncNumber(user);

  // Require full sync if syncNumber is 0 or syncNumber is out of sync
  if (syncNumber === 0 || syncNumber !== partialSyncReq.syncNumber) {
    const fullSyncRes: t.PartialSyncRes = { type: 'require_full_sync' };
    res.send(fullSyncRes);
    return;
  }

  const notes = getQueuedNotes(user);
  const partialSyncRes: t.PartialSyncRes = { type: 'ok', notes, syncNumber };

  res.send(partialSyncRes);

  mergeSyncData(user, partialSyncReq, partialSyncRes);
});

app.post('/api/full-sync', authenticate, (req, res) => {
  console.log('POST /api/full-sync', req.body);
  const user = res.locals.user!;
  const fullSyncReq: t.FullSyncReq = req.body;
  const syncNumber = getSyncNumber(user);

  const notes = getNotes(user);
  const fullSyncRes: t.FullSyncRes = { notes, syncNumber };

  res.send(fullSyncRes);

  mergeSyncData(user, fullSyncReq, fullSyncRes);
});

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>unforget</title>
    <link rel="stylesheet" href="/style.css">
    <link rel="manifest" href="/manifest.json" />
	  <script src="/index.js"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`);
});

app.use((req, res, next) => {
  console.error(`Page not found: ${req.url}`);
  res.status(404).send(`Page not found: ${req.url}`);
});

app.use(((error, req, res, next) => {
  console.error(error);
  res.status(500).send(error.message);
}) as express.ErrorRequestHandler);

app.listen(Number(process.env.PORT), () => {
  console.log(`Listening on port ${process.env.PORT}`);
});

async function hashPassword(username: string, password: string) {
  // Add salt based on the username.
  const salted = username + password + String(username.length * 131 + 530982758);
  return computeSHA1(new TextEncoder().encode(salted));
}

export async function computeSHA1(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function createToken(): string {
  return Array.from(crypto.randomBytes(64))
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}

function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!res.locals.user) {
    next(new Error('Forbidden'));
  } else {
    next();
  }
}

function getSyncNumber(user: t.LocalUser) {
  return db.get().prepare(`SELECT sync_number FROM clients where token = ?`).pluck().get(user.token) as number;
}

function getQueuedNotes(user: t.LocalUser): t.Note[] {
  const dbNotes = db
    .get()
    .prepare(`SELECT * FROM notes WHERE id IN (SELECT id FROM notes_queue WHERE token = ?)`)
    .all(user.token) as t.DBNote[];
  return dbNotes.map(dbNoteToNote);
}

function getQueuedNoteHeads(user: t.LocalUser): t.NoteHead[] {
  return db
    .get()
    .prepare(`SELECT id, modification_date FROM notes_queue WHERE token = ?`)
    .all(user.token) as t.NoteHead[];
}

function getNotes(user: t.LocalUser): t.Note[] {
  const dbNotes = db.get().prepare(`SELECT * FROM notes WHERE username = ?`).all(user.username) as t.DBNote[];
  return dbNotes.map(dbNoteToNote);
}

function dbNoteToNote(dbNote: t.DBNote): t.Note {
  return _.omit(dbNote, 'username');
}

function mergeSyncData(user: t.LocalUser, reqSyncData: t.SyncData, resSyncData: t.SyncData) {
  const getDbNote = db
    .get()
    .prepare<[{ username: string; id: string }]>(`SELECT * FROM notes WHERE username = :username AND id = :id`);
  const putDbNote = db.get().prepare<[t.DBNote]>(`
    INSERT OR REPLACE INTO notes
      (id, username, text, creation_date, modification_date, "order", deleted, archived)
    VALUES
      (:id, :username, :text, :creation_date, :modification_date, :order, :deleted, :archived)
  `);
  const deleteFromQueue = db
    .get()
    .prepare<[{ token: string; id: string }]>(`DELETE FROM notes_queue WHERE token = :token AND id = :id`);
  const updateSyncNumber = db
    .get()
    .prepare<[{ token: string; sync_number: number }]>(
      `UPDATE clients SET sync_number = :sync_number WHERE token = :token`,
    );
  const getClients = db
    .get()
    .prepare<[t.LocalUser]>(`SELECT username, token FROM clients WHERE username = :username AND token != :token`);
  const insertIntoQueue = db.get().prepare<[t.DBNoteHead]>(`
    INSERT INTO notes_queue (token, id, modification_date)
    VALUES (:token, :id, :modification_date)
    ON CONFLICT (token, id) DO UPDATE SET
      modification_date = excluded.modification_date
    WHERE excluded.modification_date > notes_queue.modification_date
  `);

  db.get().transaction(() => {
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
