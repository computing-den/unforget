import 'dotenv/config';

import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import type * as t from '../common/types.js';
import * as db from './db.js';
import { ServerError, bytesToHexString, CACHE_VERSION } from '../common/util.js';
import cookieParser from 'cookie-parser';
import _ from 'lodash';
import fs from 'node:fs';

const PUBLIC = path.join(process.cwd(), 'public');
const DIST_PUBLIC = path.join(process.cwd(), 'dist/public');

// const icons = _.filter(fs.readdirSync(path.join(PUBLIC, 'icons')), name => name.endsWith('.svg'));

declare global {
  namespace Express {
    interface Locals {
      client?: t.ServerUserClient;
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
app.use(express.json({ limit: '50MB' }));

app.use('/', express.static(PUBLIC));
app.use('/', express.static(DIST_PUBLIC));

app.use(cookieParser());

app.use((req, res, next) => {
  const token = req.cookies.unforget_token as string | undefined;
  let client: t.ServerUserClient | undefined;
  if (token) {
    client = db.get().prepare(`SELECT username, token FROM clients WHERE token = ?`).get(token) as
      | t.ServerUserClient
      | undefined;
    if (client) {
      db.get()
        .prepare(
          `UPDATE clients SET last_activity_date = :last_activity_date WHERE username = :username AND token = :token`,
        )
        .run({ ...client, last_activity_date: new Date().toISOString() });
    }
  }
  res.locals = { client };
  log(res, `${req.method} ${req.url} X-Cache-Version: ${req.header('X-Cache-Version') || 'unknown'}`);

  next();
});

app.use('/api', (req, res, next) => {
  if (req.query.apiProtocol === '2') {
    next();
  } else {
    next(new ServerError('App requires update', 400, 'app_requires_update'));
  }
});

app.post('/api/login', async (req, res, next) => {
  try {
    let loginData = req.body as t.LoginData;
    if (process.env.NODE_ENV === 'development') {
      log(res, '/api/login', req.body);
    }
    loginData = { ...loginData, username: loginData.username.toLowerCase() };
    const user = db.get().prepare(`SELECT * FROM users WHERE username = ?`).get(loginData.username) as
      | t.DBUser
      | undefined;

    if (user) {
      const password_double_hash = await calcDoublePasswordHash(loginData.password_client_hash, user.password_salt);
      if (password_double_hash === user.password_double_hash) {
        loginAndRespond(user, res);
        return;
      }
    }

    throw new ServerError('Wrong username or password.', 401);
  } catch (error) {
    next(error);
  }
});

app.post('/api/signup', async (req, res, next) => {
  try {
    let signupData = req.body as t.SignupData;
    signupData = { ...signupData, username: signupData.username.toLowerCase() };
    if (typeof signupData.username !== 'string' || signupData.username.length < 3) {
      throw new ServerError('username must be at least 3 characters', 400);
    }
    if (/[\/\\<>&'"]/.test(signupData.username)) {
      throw new ServerError('invalid characters in username', 400);
    }

    const user = db.get().prepare(`SELECT * FROM users WHERE username = ?`).get(signupData.username) as
      | t.DBUser
      | undefined;
    if (user) throw new ServerError('Username already exists.', 400);

    const password_salt = generateRandomCryptoString();
    const password_double_hash = await calcDoublePasswordHash(signupData.password_client_hash, password_salt);
    const newUser: t.DBUser = {
      username: signupData.username,
      password_double_hash,
      password_salt,
      encryption_salt: signupData.encryption_salt,
    };
    db.get()
      .prepare(
        `
        INSERT INTO users (username, password_double_hash, password_salt, encryption_salt)
        VALUES (:username, :password_double_hash, :password_salt, :encryption_salt)`,
      )
      .run(newUser);
    loginAndRespond(newUser, res);
  } catch (error) {
    next(error);
  }
});

function loginAndRespond(user: t.DBUser, res: express.Response) {
  const token = generateRandomCryptoString();
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
  const maxAge = 10 * 365 * 24 * 3600 * 1000;
  res.cookie('unforget_token', token, { maxAge, path: '/' });
  // res.cookie('unforget_username', user.username, { maxAge, path: '/' });
  const loginResponse: t.LoginResponse = { username: user.username, token, encryption_salt: user.encryption_salt };
  res.send(loginResponse);
}

app.get('/api/notes', authenticate, (req, res) => {
  const client = res.locals.client!;
  const notes = db.getNotes(client);
  res.set('Cache-Control', 'no-cache').send(notes);
});

app.post('/api/got-error', (req, res) => {
  const { message } = req.body as { message: string };
  logError(res, 'client error ' + message);
});

app.post('/api/log', (req, res) => {
  const { message } = req.body as { message: string };
  log(res, 'client log ' + message);
});

app.post('/api/partial-sync', authenticate, (req, res) => {
  if (process.env.NODE_ENV === 'development') {
    log(res, req.body);
  }
  const client = res.locals.client!;
  const partialSyncReq: t.PartialSyncReq = req.body;
  const syncNumber = db.getSyncNumber(client);

  // Require full sync if syncNumber is 0 or syncNumber is out of sync
  if (syncNumber === 0 || syncNumber !== partialSyncReq.syncNumber) {
    const fullSyncRes: t.PartialSyncRes = { type: 'require_full_sync' };
    res.send(fullSyncRes);
    return;
  }

  const notes = db.getQueuedNotes(client);
  const partialSyncRes: t.PartialSyncRes = { type: 'ok', notes, syncNumber };

  res.send(partialSyncRes);

  db.mergeSyncData(client, partialSyncReq, partialSyncRes);
});

app.post('/api/full-sync', authenticate, (req, res) => {
  const client = res.locals.client!;
  const fullSyncReq: t.FullSyncReq = req.body;
  const syncNumber = db.getSyncNumber(client);

  if (process.env.NODE_ENV === 'development') {
    // const fullSyncReq: t.FullSyncReq = req.body;
    log(res, `showing 2 notes of ${fullSyncReq.notes.length}`);
    log(res, { ...fullSyncReq, notes: fullSyncReq.notes.slice(0, 2) });
    log(res, 'sync number from db: ', syncNumber);
  }

  const notes = db.getNotes(client);
  const fullSyncRes: t.FullSyncRes = { notes, syncNumber };

  res.send(fullSyncRes);

  db.mergeSyncData(client, fullSyncReq, fullSyncRes);
});

app.post('/api/add-notes', authenticate, (req, res) => {
  if (process.env.NODE_ENV === 'development') {
    log(res, req.body);
  }
  const client = res.locals.client!;
  const fullSyncReq: t.FullSyncReq = req.body;
  const syncNumber = db.getSyncNumber(client);

  const fullSyncRes: t.FullSyncRes = { notes: [], syncNumber };

  res.send(fullSyncRes);

  db.mergeSyncData(client, fullSyncReq, fullSyncRes);
});

app.post('/api/logout', (req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(req.body);
  }

  const token = res.locals.client?.token ?? (req.body?.token as string | undefined);
  if (!token) return next(new Error('Missing token'));
  db.logout(token);
  res.send({ ok: true });
});

app.get(['/', '/archive', '/n/:noteId', '/login'], (req, res) => {
  // const preload = _.map(icons, icon => `<link rel="preload" href="/icons/${icon}" as="image">`).join('\n');
  // const preload = '';
  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>unforget</title>
    <link rel="stylesheet" href="/style.css">
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" href="/icon-256x256.png" type="image/png" />
	  <script src="/index.js"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`);
});

app.use((req, res, next) => {
  logError(res, `Page not found: ${req.url}`);
  next(new ServerError(`Page not found: ${req.url}`, 404));
});

app.use(((error, req, res, next) => {
  logError(res, error);
  const code = error instanceof ServerError ? error.code : 500;
  const type = error instanceof ServerError ? error.type : 'generic';
  const errorResponse: t.ServerErrorResponse = { message: error.message, type };
  res.status(code).send(errorResponse);
}) as express.ErrorRequestHandler);

app.listen(Number(process.env.PORT), () => {
  console.log(`Listening on port ${process.env.PORT}`);
});

async function calcDoublePasswordHash(password_client_hash: string, password_salt: string) {
  const salted = password_salt + password_client_hash;
  return computeSHA256(new TextEncoder().encode(salted));
}

async function computeSHA256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bytesToHexString(new Uint8Array(hashBuffer));
}

function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!res.locals.client) {
    next(new ServerError('Unauthorized', 401));
  } else {
    next();
  }
}

function generateRandomCryptoString(): string {
  return Array.from(crypto.randomBytes(64))
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}

function log(res: express.Response, ...args: any[]) {
  console.log(`${getClientStr(res)}:`, ...args);
}

function logError(res: express.Response, ...args: any[]) {
  console.error(`${getClientStr(res)}:`, ...args);
}

function getClientStr(res: express.Response): string {
  if (process.env.NODE_ENV === 'development') return '';

  const client = res.locals?.client;
  return `${client ? `${client.username} (${client.token.slice(0, 5)})` : 'anonymous'}`;
}
