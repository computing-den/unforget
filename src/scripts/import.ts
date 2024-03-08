import util from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import type * as t from '../common/types.js';
import * as db from '../server/db.js';
import { v4 as uuid } from 'uuid';

importNotes(process.argv[2], process.argv[3]);

function importNotes(username: string | undefined, jsonPath: string | undefined) {
  if (!username || !jsonPath) {
    console.error('Usage: npm run import username path/to/notes.json');
    process.exit(-1);
  }

  db.initDB();

  const notes = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  db.importNotes(username, notes);
  console.log(`Imported ${notes.length} for ${username}`);
}
