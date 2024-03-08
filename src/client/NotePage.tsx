import React, { useCallback, useState, useEffect, useRef } from 'react';
import { produce } from 'immer';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import Editor from './Editor.jsx';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';
import { LoaderFunctionArgs, useLoaderData, useNavigate, useLocation } from 'react-router-dom';

export function NotePage() {
  const app = appStore.use();
  const origNote = useLoaderData() as t.Note | undefined;
  const [text, setText] = useState(origNote?.text ?? '');
  const navigate = useNavigate();
  const location = useLocation();
  // const app = appStore.use();

  const goHome = useCallback(() => {
    if (location.state?.fromNotesPage) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [location, navigate]);

  const textChangeCb = useCallback((text: string) => setText(text), []);
  const saveCb = useCallback(() => {
    actions.saveNote({ ...origNote!, modification_date: new Date().toISOString(), text }, 'saved');
  }, [text, origNote]);
  const archiveCb = useCallback(() => {
    actions
      .saveNote({ ...origNote!, modification_date: new Date().toISOString(), archived: 1 }, 'archived')
      .then(goHome);
  }, [goHome, origNote]);
  const deleteCb = useCallback(() => {
    actions
      .saveNote({ ...origNote!, modification_date: new Date().toISOString(), text: null, deleted: 1 }, 'deleted')
      .then(goHome);
  }, [goHome, origNote]);

  const pageActions = origNote && [
    <PageAction label="Delete" onClick={deleteCb} />,
    <PageAction label="Archive" onClick={archiveCb} />,
    <PageAction label="Save" onClick={saveCb} bold />,
  ];

  return (
    <PageLayout>
      <PageHeader actions={pageActions} />
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
