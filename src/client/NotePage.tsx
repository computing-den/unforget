import { useRouter, RouteMatch } from './router.jsx';
import React, { useCallback, useState, useEffect, useRef } from 'react';
import type * as t from '../common/types.js';
import { isNoteNewerThan } from '../common/util.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as actions from './appStoreActions.jsx';
import { Editor, EditorContext } from './Editor.jsx';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import _ from 'lodash';
import * as icons from './icons.js';

export function NotePage() {
  const app = appStore.use();

  const { match, loaderData, state: historyState } = useRouter();
  console.log('NotePage: params', match!.params);

  const [note, setNote] = useState(loaderData!.read() as t.Note | undefined);

  // Check for changes from the server and possibly replace it.
  useEffect(() => {
    async function callback(args: storage.SyncListenerArgs) {
      if (args.done && args.mergeCount > 0) {
        const newNote = await storage.getNote(match!.params.noteId as string);
        if (newNote && isNoteNewerThan(newNote, note)) {
          setNote(newNote);
        }
      }
    }

    storage.addSyncListener(callback);
    return () => storage.removeSyncListener(callback);
  }, [note]);

  const editorRef = useRef<EditorContext | null>(null);

  const goHome = useCallback(() => {
    if ((historyState?.index ?? 0) > 0) {
      history.back();
    } else {
      history.pushState(null, '', '/');
    }
  }, []);

  const textChangeCb = useCallback(
    (text: string) => {
      const newNote: t.Note = { ...note!, text, modification_date: new Date().toISOString() };
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
      .saveNote(newNote, { message: newNote.not_archived ? 'Unarchived' : 'Archived', immediateSync: true })
      .then(() => {
        setNote(newNote);
        if (!newNote.not_archived) goHome();
      });
  }, [goHome, note]);

  const deleteCb = useCallback(() => {
    if (confirm('Are you sure you want to delete this note?')) {
      const newNote: t.Note = { ...note!, modification_date: new Date().toISOString(), text: null, not_deleted: 0 };
      actions.saveNote(newNote, { message: 'Deleted', immediateSync: true }).then(() => {
        setNote(newNote);
        goHome();
      });
    }
  }, [goHome, note]);

  const pinCb = useCallback(() => {
    const newNote = { ...note!, modification_date: new Date().toISOString(), pinned: note!.pinned ? 0 : 1 };
    actions
      .saveNote(newNote, { message: note!.pinned ? 'Unpinned' : 'Pinned', immediateSync: true })
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
    <PageAction icon={icons.bulletpointWhite} onClick={cycleListStyleCb} title="Cycle list style" />,
    <PageAction icon={icons.trashWhite} onClick={deleteCb} title="Delete" />,
    <PageAction
      icon={note.not_archived ? icons.archiveEmptyWhite : icons.archiveFilledWhite}
      onClick={toggleArchiveCb}
      title="Archive"
    />,
    <PageAction
      icon={note.pinned ? icons.pinFilledWhite : icons.pinEmptyWhite}
      onClick={pinCb}
      title={note.pinned ? 'Unpin' : 'Pin'}
    />,
    <PageAction icon={icons.checkWhite} onClick={goHome} title="Done" />,
  ];

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
                // autoFocus
              />
            </div>
          )}
        </div>
      </PageBody>
    </PageLayout>
  );
}

export async function notePageLoader({ params }: RouteMatch): Promise<t.Note | undefined> {
  return await storage.getNote(params.noteId as string);
}
