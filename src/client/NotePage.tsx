import React, { useCallback, useState, useEffect, useRef } from 'react';
import { produce } from 'immer';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import { Editor, EditorContext } from './Editor.jsx';
import { MenuItem } from './Menu.jsx';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';
import { LoaderFunctionArgs, useLoaderData, useNavigate, useLocation } from 'react-router-dom';

export function NotePage() {
  const app = appStore.use();
  const [note, setNote] = useState(useLoaderData() as t.Note | undefined);
  const navigate = useNavigate();
  const location = useLocation();
  const editorRef = useRef<EditorContext | null>(null);

  util.useScrollToTop();

  const goHome = useCallback(() => {
    if (location.state?.fromNotesPage) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [location, navigate]);

  const textChangeCb = useCallback(
    (text: string) => {
      const newNote = { ...note!, text };
      setNote(newNote);
      actions.saveNote(newNote);
    },
    [note],
  );

  const toggleArchiveCb = useCallback(() => {
    const newNote: t.Note = {
      ...note!,
      modification_date: new Date().toISOString(),
      not_archived: note!.not_archived ? 0 : 1,
    };
    actions
      .saveNote(newNote, { message: newNote.not_archived ? 'unarchived' : 'archived', immediateSync: true })
      .then(() => {
        setNote(newNote);
        if (!newNote.not_archived) goHome();
      });
  }, [goHome, note]);

  const deleteCb = useCallback(() => {
    if (confirm('Are you sure you want to delete this note?')) {
      actions
        .saveNote(
          { ...note!, modification_date: new Date().toISOString(), text: null, not_deleted: 0 },
          { message: 'deleted', immediateSync: true },
        )
        .then(goHome);
    }
  }, [goHome, note]);

  const pinCb = useCallback(() => {
    const newNote = { ...note!, modification_date: new Date().toISOString(), pinned: note!.pinned ? 0 : 1 };
    actions
      .saveNote(newNote, { message: note!.pinned ? 'unpinned' : 'pinned', immediateSync: true })
      .then(() => setNote(newNote));
  }, [note]);

  // Save note on beforeunload event.
  useEffect(() => {
    function callback(e: BeforeUnloadEvent) {
      if (storage.isSavingNote()) e.preventDefault();
    }
    window.addEventListener('beforeunload', callback);
    return () => window.removeEventListener('beforeunload', callback);
  }, []);

  // Go home on Escape key.
  useEffect(() => {
    function callback(e: KeyboardEvent) {
      if (e.key === 'Escape') goHome();
    }
    window.addEventListener('keydown', callback);
    return () => window.removeEventListener('keydown', callback);
  }, []);

  // const insertMenu = createInsertMenu(() => editorRef.current!);

  const cycleListStyleCb = useCallback(() => {
    editorRef.current!.cycleListStyle();
  }, []);

  const pageActions = note && [
    <PageAction icon="/icons/bulletpoint-white.svg" onClick={cycleListStyleCb} />,
    <PageAction icon="/icons/trash-white.svg" onClick={deleteCb} />,
    <PageAction
      icon={note.not_archived ? '/icons/archive-empty-white.svg' : '/icons/archive-filled-white.svg'}
      onClick={toggleArchiveCb}
    />,
    <PageAction icon={note.pinned ? '/icons/pin-filled-white.svg' : '/icons/pin-empty-white.svg'} onClick={pinCb} />,
    <PageAction icon="/icons/check-white.svg" onClick={goHome} />,
  ];

  // const menu: MenuItem[] = [{ label: 'Delete note', icon: '/icons/trash-white.svg', onClick: deleteCb }];

  return (
    <PageLayout>
      <PageHeader actions={pageActions} />
      <PageBody>
        <div className="note-page">
          {!note && app.syncing && <h2 className="page-message">Loading...</h2>}
          {!note && !app.syncing && <h2 className="page-message">Not found</h2>}
          {note && (
            <div className="note-container">
              <Editor
                ref={editorRef}
                id="note-editor"
                className="text-input"
                placeholder="What's on you mind?"
                value={note.text ?? ''}
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
