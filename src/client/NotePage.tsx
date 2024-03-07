import React, { useCallback, useState, useEffect, useRef } from 'react';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import Editor from './Editor.jsx';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';
import { LoaderFunctionArgs, useLoaderData } from 'react-router-dom';

export function NotePage() {
  const app = appStore.use();
  const origNote = useLoaderData() as t.Note | undefined;
  const [text, setText] = useState(origNote?.text ?? '');
  // const app = appStore.use();

  const textChangeCb = useCallback((text: string) => setText(text), []);
  const saveCb = useCallback(() => {
    if (origNote) saveNote(origNote, text);
  }, [text, origNote]);

  return (
    <PageLayout>
      <PageHeader actions={[<PageAction label="Save" onClick={saveCb} />]} />
      <PageBody>
        <div className="note-page">
          {!origNote && app.syncing && <h2 className="page-message">Loading...</h2>}
          {!origNote && !app.syncing && <h2 className="page-message">Not found</h2>}
          {origNote && (
            <div className="note-container">
              <Editor
                id="note-editor"
                className="text-input"
                placeholder="What's on you mind?"
                value={text}
                onChange={textChangeCb}
              />
            </div>
          )}
        </div>
      </PageBody>
    </PageLayout>
  );
}

export async function notePageLoader({ params }: LoaderFunctionArgs): Promise<t.Note | null> {
  if (storage.syncing) await storage.waitTillSyncEnd(5000);
  return (await storage.getNote(params.noteId as string)) ?? null;
}

async function saveNote(note: t.Note, text: string) {
  try {
    note = {
      ...note,
      text,
      modification_date: new Date().toISOString(),
    };
    await storage.saveNote(note);
    appStore.update(app => {
      app.infoMsg = 'saved';
    });
    setTimeout(() => {
      appStore.update(app => {
        app.infoMsg = '';
      });
    }, 2000);

    actions.updateNotes();
    storage.sync();
  } catch (error) {
    actions.gotError(error as Error);
  }
}
