import { useRouter, RouteMatch } from './router.jsx';
import React, { useCallback, useState, useEffect, useRef } from 'react';
import type * as t from '../common/types.js';
// import { isNoteNewerThan } from '../common/util.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as actions from './appStoreActions.jsx';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import { Notes, Note } from './Notes.jsx';
import _ from 'lodash';
import * as icons from './icons.js';
import log from './logger.js';
import { unzip } from 'unzipit';
import { v4 as uuid } from 'uuid';

export function ImportPage() {
  // const app = appStore.use();

  const [file, setFile] = useState<File>();
  const [importing, setImporting] = useState(false);

  async function importCb(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const newFile = e.target.files?.[0];
      setFile(newFile);
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

  const pageActions: React.ReactNode[] = [
    // <PageAction icon={icons.bulletpointWhite} onClick={cycleListStyleCb} title="Cycle list style" />,
  ];

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

  return (
    <PageLayout>
      <PageHeader actions={pageActions} title="import" />
      <PageBody>
        <div className="import-page">
          {!importing && (
            <div className="notes">
              <pre className="note">
                <b>Import from Google Keep</b>
                <br />
                <br />
                1. Go to Google Takout
                <br />
                2. Select only Keep's data for export
                <br />
                {'    '}
                <i>It'll be ready for download in a few minutes</i>
                <br />
                3.{' '}
                <button className="import primary" onClick={triggerFileInput}>
                  Import notes from the zip file
                </button>
                <br />
                <br />
                Note: The Unforget servers only see your encrypted data.
              </pre>
            </div>
          )}
          {!importing && <input type="file" name="file" accept="application/zip" onChange={importCb} />}
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

  await actions.saveNotes(notes, { message: `Imported ${notes.length} notes`, immediateSync: true });
}

function validateGoogleKeepJson(json: any): string | undefined {
  if (!('createdTimestampUsec' in json)) return 'Missing createdTimestampUsec';
  if (!('userEditedTimestampUsec' in json)) return 'Missing userEditedTimestampUsec';

  // if (!('isTrashed' in json)) return 'Missing isTrashed';
  // if (!('isPinned' in json)) return 'Missing isPinned';
  // if (!('isArchived' in json)) return 'Missing isArchived';
  // if (!('listContent' in json) && !('textContent' in json)) return 'Missing listContent and textContent';
  // if (!('title' in json) && !('title' in json)) return 'Missing title';
}

// // read an entry as an ArrayBuffer
// const arrayBuffer = await entries['path/to/file'].arrayBuffer();

// // read an entry as a blob and tag it with mime type 'image/png'
// const blob = await entries['path/to/otherFile'].blob('image/png');

//   const filenames = fs.readdirSync(googleKeepPath, { encoding: 'utf8' }).filter(x => x.endsWith('.json'));
//   const notes: t.Note[] = [];
//   for (const filename of filenames) {
//     console.log(`Reading "${filename}" ...`);
//     const content = JSON.parse(fs.readFileSync(path.join(googleKeepPath, filename), 'utf8'));
//     if (content.isTrashed) continue;

//     let text: string | null = null;
//     const segments = [
//       content.title,
//       content.textContent,
//       (content.listContent || [])
//         .map((item: any) => (item.isChecked ? `- [x] ${item.text || ''}` : `- [ ] ${item.text || ''}`))
//         .join('\n'),
//     ];
//     text = segments.filter(Boolean).join('\n\n');

//     const note: t.Note = {
//       id: uuid(),
//       text,
//       creation_date: new Date(Math.floor(content.createdTimestampUsec / 1000)).toISOString(),
//       modification_date: new Date(Math.floor(content.userEditedTimestampUsec / 1000)).toISOString(),
//       order: Math.floor(content.createdTimestampUsec / 1000),
//       not_deleted: 1,
//       not_archived: content.isArchived ? 0 : 1,
//       pinned: content.isPinned ? 1 : 0,
//     };
//     notes.push(note);
//   }

//   notes.sort((a, b) => {
//     if (a.creation_date > b.creation_date) return -1;
//     if (a.creation_date < b.creation_date) return 1;
//     return 0;
//   });

//   fs.writeFileSync(outputPath, JSON.stringify(notes, null, 2), 'utf8');

//   console.log(`Converted ${notes.length} notes and wrote to ${outputPath}`);
// }
