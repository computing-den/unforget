import util from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import type * as t from '../common/types.js';
import { v4 as uuid } from 'uuid';

convertFromGoogleKeep(process.argv[2], process.argv[3]);

function convertFromGoogleKeep(googleKeepPath: string | undefined, outputPath: string | undefined) {
  if (!googleKeepPath || !outputPath) {
    console.error('Usage: npm run convert path/to/google/keep/takout/data path/to/output.json');
    process.exit(-1);
  }

  const filenames = fs.readdirSync(googleKeepPath, { encoding: 'utf8' }).filter(x => x.endsWith('.json'));
  const notes: t.Note[] = [];
  for (const filename of filenames) {
    console.log(`Reading "${filename}" ...`);
    const content = JSON.parse(fs.readFileSync(path.join(googleKeepPath, filename), 'utf8'));

    let text: string | null = null;
    if (!content.isTrashed) {
      text = content.textContent || '';
      text += (content.listContent || [])
        .map((item: any) => (item.isChecked ? `- [x] ${item.text || ''}\n` : `- [ ] ${item.text || ''}`))
        .join('\n');
    }

    const note: t.Note = {
      id: uuid(),
      text,
      creation_date: new Date(Math.floor(content.createdTimestampUsec / 1000)).toISOString(),
      modification_date: new Date(Math.floor(content.userEditedTimestampUsec / 1000)).toISOString(),
      order: Math.floor(content.createdTimestampUsec / 1000),
      deleted: 0,
      archived: content.isArchived ? 1 : 0,
      pinned: content.isPinned ? 1 : 0,
    };
    notes.push(note);
  }

  notes.sort((a, b) => {
    if (a.creation_date > b.creation_date) return -1;
    if (a.creation_date < b.creation_date) return 1;
    return 0;
  });

  fs.writeFileSync(outputPath, JSON.stringify(notes, null, 2), 'utf8');

  console.log(`Converted ${notes.length} notes and wrote to ${outputPath}`);
}
