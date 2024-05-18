import React, { useState } from 'react';
import type * as t from '../common/types.js';
import { createNewNote } from '../common/util.js';
import * as actions from './appStoreActions.jsx';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import { Notes } from './Notes.jsx';
import _ from 'lodash';
import log from './logger.js';
import { unzip } from 'unzipit';
import { v4 as uuid } from 'uuid';
import importMd from './notes/import.md';

const importNote = createNewNote(importMd);

export function ImportPage() {
  // const app = appStore.use();

  // const [file, setFile] = useState<File>();
  const [importing, setImporting] = useState(false);

  async function importCb(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const newFile = e.target.files?.[0];
      // setFile(newFile);
      if (!newFile) return;

      setImporting(true);
      await importFromZipFile(newFile);
      window.history.replaceState(null, '', '/');
    } catch (error) {
      actions.gotError(error as Error);
    } finally {
      setImporting(false);
    }
  }

  function triggerFileInput() {
    (document.querySelector('input[type="file"]') as HTMLInputElement).click();
  }

  // const notes: t.Note[] = [
  //   {
  //     id: 'google-keep',
  //     text: importGoogleKeepNoteText,
  //     creation_date: '2024-04-17T15:32:18.337Z',
  //     modification_date: '2024-04-17T15:32:18.337Z',
  //     not_deleted: 1,
  //     not_archived: 1,
  //     pinned: 0,
  //     order: 1,
  //   },
  // ];

  function hashLinkClicked(hash: string) {
    triggerFileInput();
  }

  return (
    <PageLayout>
      <PageHeader title="/ import" />
      <PageBody>
        <div className="page">
          {!importing && <Notes notes={[importNote]} readonly onHashLinkClick={hashLinkClicked} />}
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

async function importFromZipFile(zipFile: File) {
  const { entries } = await unzip(zipFile);

  const regexp = /^Takeout\/Keep\/[^\/]+\.json$/;
  const jsonEntries = Object.values(entries).filter(entry => regexp.test(entry.name));

  const notes: t.Note[] = [];
  for (const entry of jsonEntries) {
    const entryText = await entry.text();
    const json = JSON.parse(entryText);
    let errorMessage: string | undefined;
    if ((errorMessage = validateGoogleKeepJson(json))) {
      log.error('Found a note with unknown format: ', errorMessage, entryText);
      throw new Error(`Found a note with unknown format: ${errorMessage}`);
    }
    if (json.isTrashed) continue;

    const segments = [
      json.title,
      json.textContent,
      (json.listContent || [])
        .map((item: any) => (item.isChecked ? `- [x] ${item.text || ''}` : `- [ ] ${item.text || ''}`))
        .join('\n'),
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

  if (notes.length) {
    await actions.saveNotes(notes, { message: `Imported ${notes.length} notes`, immediateSync: true });
  } else {
    actions.showMessage('No notes were found');
  }
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
