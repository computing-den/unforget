import React, { useState } from 'react';
import type * as t from '../common/types.js';
import { createNewNote, assert } from '../common/util.js';
import * as actions from './appStoreActions.jsx';
import { PageLayout, PageHeader, PageBody } from './PageLayout.jsx';
import { Notes } from './Notes.jsx';
import _ from 'lodash';
import log from './logger.js';
import { unzip } from 'unzipit';
import { v4 as uuid } from 'uuid';
import importMd from './notes/import.md';

const initialImportNote = createNewNote(importMd);

const importers = {
  '#keep': importKeep,
  '#apple': importApple,
  '#standard': importStandard,
};

type ImportKeys = keyof typeof importers;

export function ImportPage() {
  // const app = appStore.use();

  // const [file, setFile] = useState<File>();
  const [importing, setImporting] = useState(false);
  const [importType, setImportType] = useState<ImportKeys>();
  const [note, setNote] = useState(initialImportNote);

  async function importCb(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const newFile = e.target.files?.[0];
      // setFile(newFile);
      if (!newFile) return;
      setImporting(true);
      assert(importType, 'Unknown import type');
      const notes = await importers[importType](newFile, note);

      if (notes.length) {
        await actions.saveNotes(notes, { message: `Imported ${notes.length} notes`, immediateSync: true });
      } else {
        actions.showMessage('No notes were found');
      }

      window.history.replaceState(null, '', '/');
    } catch (error) {
      actions.gotError(error as Error);
    } finally {
      setImporting(false);
    }
  }

  function hashLinkClicked(hash: string) {
    setImportType(hash as ImportKeys);
    (document.querySelector('input[type="file"]') as HTMLInputElement).click();
  }

  return (
    <PageLayout>
      <PageHeader title="/ import" />
      <PageBody>
        <div className="page">
          {!importing && <Notes notes={[note]} onHashLinkClick={hashLinkClicked} onNoteChange={setNote} />}
          {!importing && (
            <input type="file" name="file" accept="application/zip" onChange={importCb} style={{ display: 'none' }} />
          )}
          {importing && <h2 className="page-message">Please wait ...</h2>}
          {/*
          <div className="-content">
            <h1>Google Keep</h1>
            <p>
              Go to{' '}
              <a target="_blank" href="https://takeout.google.com/">
                Google Takeout
              </a>
              .
            </p>
            <p>Select only Keep's data for export.</p>
            <p>Export it as a zip file.</p>
            <p className="wait-for-download">It'll be ready for download in a few minutes.</p>
            <p className="on-device">Your data will stay on your device.</p>

            <button className="import primary" onClick={importCb}>
              Import notes from zip file
            </button>
            <input type="file" name="file" accept="application/zip" onChange={e => setFile(e.target.files?.[0])} />

        </div>
        */}
        </div>
      </PageBody>
    </PageLayout>
  );
}

async function importKeep(zipFile: File, note: t.Note): Promise<t.Note[]> {
  const optIncludeTags = hasOption(note.text!, 'include labels as tags');

  const { entries } = await unzip(zipFile);

  const regexp = /^Takeout\/Keep\/[^\/]+\.json$/;
  const jsonEntries = Object.values(entries).filter(entry => regexp.test(entry.name));

  const notes: t.Note[] = [];
  for (const entry of jsonEntries) {
    const entryText = await entry.text();
    const json = JSON.parse(entryText);
    let errorMessage: string | undefined;
    if ((errorMessage = validateGoogleKeepJson(json))) {
      log(entryText);
      throw new Error(`Found a note with unknown format: ${errorMessage}`);
    }
    if (json.isTrashed) continue;

    const segments = [
      json.title,
      json.textContent,
      (json.listContent || [])
        .map((item: any) => (item.isChecked ? `- [x] ${item.text || ''}` : `- [ ] ${item.text || ''}`))
        .join('\n'),
      optIncludeTags && json.labels?.map((x: any) => '#' + x.name).join(' '),
    ];
    const text = segments.filter(Boolean).join('\n\n');

    notes.push({
      id: uuid(),
      text,
      creation_date: new Date(Math.floor(json.createdTimestampUsec / 1000)).toISOString(),
      modification_date: new Date(Math.floor(json.userEditedTimestampUsec / 1000)).toISOString(),
      order: Math.floor(json.createdTimestampUsec / 1000),
      not_deleted: 1,
      not_archived: json.isArchived ? 0 : 1,
      pinned: json.isPinned ? 1 : 0,
    });
  }

  return notes;
}

function validateGoogleKeepJson(json: any): string | undefined {
  if (!('createdTimestampUsec' in json)) return 'Missing createdTimestampUsec';
  if (!('userEditedTimestampUsec' in json)) return 'Missing userEditedTimestampUsec';

  // NOTE: some notes have neither listContent nor textContent. So be more lenient.
  // if (!('isTrashed' in json)) return 'Missing isTrashed';
  // if (!('isPinned' in json)) return 'Missing isPinned';
  // if (!('isArchived' in json)) return 'Missing isArchived';
  // if (!('listContent' in json) && !('textContent' in json)) return 'Missing listContent and textContent';
  // if (!('title' in json) && !('title' in json)) return 'Missing title';
}

async function importApple(zipFile: File, note: t.Note): Promise<t.Note[]> {
  const optIncludeTags = hasOption(note.text!, 'include folder names as tags');

  const { entries } = await unzip(zipFile);
  const regexp = /^.*-(\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\dZ)\.txt$/;
  const notes: t.Note[] = [];

  for (const entry of Object.values(entries)) {
    const parts = entry.name.split('/');
    if (parts.includes('Recently Deleted')) continue;

    const match = parts.at(-1)?.match(regexp);
    if (!match) continue;

    const date = new Date(match[1]);

    let text = await entry.text();
    if (optIncludeTags) {
      const tags = parts
        .slice(1, -2)
        .map(x => '#' + x.replace(' ', '-'))
        .join(' ');
      text += '\n\n' + tags;
    }

    notes.push({
      id: uuid(),
      text,
      creation_date: date.toISOString(),
      modification_date: date.toISOString(),
      order: date.valueOf(),
      not_deleted: 1,
      not_archived: 1,
      pinned: 0,
    });
  }
  return notes;
}

async function importStandard(zipFile: File): Promise<t.Note[]> {
  const { entries } = await unzip(zipFile);
  const regexp = /^([^\/]+)\.txt$/;
  const notes: t.Note[] = [];
  const startMs = Date.now();

  for (const [i, entry] of Object.values(entries).entries()) {
    const match = entry.name.match(regexp);
    if (!match) continue;

    const entryText = await entry.text();
    const title = match[1];
    const text = title + '\n\n' + entryText;

    notes.push({
      id: uuid(),
      text,
      creation_date: new Date(startMs - i).toISOString(),
      modification_date: new Date(startMs - i).toISOString(),
      order: startMs - i,
      not_deleted: 1,
      not_archived: 1,
      pinned: 0,
    });
  }

  return notes;
}

function hasOption(text: string, label: string): boolean {
  const regexp = new RegExp('^\\s*- \\[(.)\\] ' + label + '$', 'm');
  const match = text.match(regexp);
  assert(match, `option "${label}" doesn't exist.`);
  return match[1] === 'x';
}
