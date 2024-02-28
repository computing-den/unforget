import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { Note, ServerConfig, DBUser } from '../common/types.js';
import * as db from './db.js';
import cookieParser from 'cookie-parser';

const PUBLIC = path.join(process.cwd(), 'public');
const DIST_PUBLIC = path.join(process.cwd(), 'dist/public');
const CONFIG_FILE = path.join(process.cwd(), 'private/config.json');

const serverConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as ServerConfig;

db.initDB();

const app = express();
app.use(express.json());

app.use('/', express.static(PUBLIC));
app.use('/', express.static(DIST_PUBLIC));

app.use(cookieParser());

app.use((req, res, next) => {
  const token = req.cookies.unforget_token as string | undefined;
  if (token) {
    const dbUser = db.get().prepare(`SELECT * from users where token = ?`).get(token) as DBUser | undefined;
    res.locals = { dbUser };
  }
  next();
});

app.post('/api/login', async (req, res, next) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    const hash = await hashPassword(username, password);
    const user = db
      .get()
      .prepare(`SELECT * FROM users WHERE password_hash = :hash AND username = :username`)
      .get({ hash, username }) as DBUser | undefined;

    if (user) {
      res.cookie('unforget_token', user.token, { maxAge: 10 * 365 * 24 * 3600 * 1000 });
      res.send({ token: user.token });
    } else {
      res.status(401).send({ message: 'Wrong username or password.' });
    }
  } catch (error) {
    next(error);
  }
});

app.post('/api/signup', async (req, res, next) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    const user = db.get().prepare(`SELECT * FROM users WHERE username = ?`).get(username) as DBUser | undefined;

    if (user) {
      res.status(401).send({ message: 'Username already exists.' });
    } else {
      const newUser: DBUser = {
        username,
        password_hash: await hashPassword(username, password),
        token: createToken(),
      };
      db.get()
        .prepare(`INSERT INTO users (username, password_hash, token) VALUES (:username, :password_hash, :token)`)
        .run(newUser);
      res.cookie('unforget_token', newUser.token, { maxAge: 10 * 365 * 24 * 3600 * 1000 });
      res.send({ token: newUser.token });
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/notes', authenticate, (req, res) => {
  console.log('GET /api/notes');
  const notes = db.get().prepare(`SELECT * FROM notes`).all();
  res.set('Cache-Control', 'no-cache').send(notes);
});

app.post('/api/sync', authenticate, (req, res) => {
  console.log('POST /api/notes', req.body);
  const notesFromClient = req.body.notes as Note[];

  const insert = db.get().prepare(`
    INSERT INTO notes (id, text, creation_date, modification_date, "order")
    VALUES (:id, :text, :creation_date, :modification_date, :order)
  `);
  db.get().transaction(() => {
    for (const note of notesFromClient) insert.run(note);
  })();

  res.send({ notes: [] });
});

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
  res.status(404).send('Page not found.');
});

app.use(((error, req, res, next) => {
  console.error(error);
  res.status(500).send(error.message);
}) as express.ErrorRequestHandler);

app.listen(serverConfig.port, () => {
  console.log(`Listening on port ${serverConfig.port}`);
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

async function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!res.locals.dbUser) {
    next(new Error('Forbidden'));
  } else {
    next();
  }
}

interface MyLocals {
  dbUser?: DBUser;
}

declare module 'express' {
  export interface Response {
    locals: MyLocals;
  }
}
