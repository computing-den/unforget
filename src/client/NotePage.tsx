import { useRouter, RouteMatch } from './router.jsx';
import React, { useCallback, useState, useEffect, useRef } from 'react';
import type * as t from '../common/types.js';
import { isNoteNewerThan, formatDateTime } from '../common/util.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as actions from './appStoreActions.jsx';
import { Editor, EditorContext } from './Editor.jsx';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import _ from 'lodash';
import * as icons from './icons.js';
// import log from './logger.js';

export function NotePage() {
  const app = appStore.use();
  const { match, loaderData, state: historyState } = useRouter();
  const [note, setNote] = useState(loaderData!.read() as t.Note | undefined);
  const editorRef = useRef<EditorContext | null>(null);

  // Here's a shit show to fix safari hiding the fixed toolbar when we focus on the text editor.
  // Inspired by https://www.codemzy.com/blog/sticky-fixed-header-ios-keyboard-fix
  useEffect(() => {
    function setTop() {
      // console.log('setTop');
      // log(
      //   'window.pageYOffset',
      //   window.pageYOffset,
      //   'window.scrollY',
      //   window.scrollY,
      //   'window.innerHeight',
      //   window.innerHeight,
      //   'document.body.offsetHeight',
      //   document.body.offsetHeight,
      // );
      const h = document.getElementById('page-header-inner-wrapper')!;
      let top = Math.max(0, window.scrollY - 2); // -2 instead of 0, otherwise a little gap appears.
      if (window.innerHeight === document.body.offsetHeight) {
        top = 0;
      }
      h.style.paddingTop = `${top}px`;

      // Could also fix it by scrolling to top, but then the cursor might go behind the soft keyboard.
      // window.scrollTo(0, 0);

      req = requestAnimationFrame(setTop);
    }

    let req = requestAnimationFrame(setTop);
    return () => cancelAnimationFrame(req);
  }, []);

  // Check for changes in storage possibly replace it.
  useEffect(() => {
    async function callback() {
      const newNote = await storage.getNote(match!.params.noteId as string);
      if (newNote && isNoteNewerThan(newNote, note)) setNote(newNote);
    }

    window.addEventListener('notesInStorageChangedExternally', callback);
    return () => window.removeEventListener('notesInStorageChangedExternally', callback);
  }, [note, match!.params.noteId]);

  // Keyboard shortcuts.
  useEffect(() => {
    function callback(e: KeyboardEvent) {
      function handle(handler: () => any) {
        e.preventDefault();
        e.stopPropagation();
        handler();
      }
      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      if (e.key === 'Enter' && ctrlOrMeta) {
        handle(goHome);
      } else if (e.key === 'Escape') {
        if (ctrlOrMeta) {
          handle(toggleArchiveCb);
        } else {
          handle(goHome);
        }
      } else if (e.key === 'Delete' && ctrlOrMeta) {
        handle(deleteCb);
      } else if (e.key === '.' && ctrlOrMeta) {
        handle(cycleListStyleCb);
      } else if (e.key === 'p' && ctrlOrMeta) {
        handle(togglePinned);
      }
    }

    window.addEventListener('keydown', callback);
    return () => window.removeEventListener('keydown', callback);
  });

  const goHome = useCallback(() => {
    if (historyState.index > 0) {
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

  const togglePinned = useCallback(() => {
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

  // const insertMenu = createInsertMenu(() => editorRef.current!);

  const cycleListStyleCb = useCallback(() => {
    editorRef.current!.cycleListStyle();
  }, []);

  const pageActions = note && [
    <PageAction icon={icons.trashWhite} onClick={deleteCb} title="Delete (Ctrl+Delete or Cmd+Delete)" />,
    <PageAction
      icon={note.not_archived ? icons.archiveEmptyWhite : icons.archiveFilledWhite}
      onClick={toggleArchiveCb}
      title="Archive (Ctrl+Esc or Cmd+Esc)"
    />,
    <PageAction
      icon={note.pinned ? icons.pinFilledWhite : icons.pinEmptyWhite}
      onClick={togglePinned}
      title={note.pinned ? 'Unpin (Ctrl+p or Cmd+p)' : 'Pin (Ctrl+p or Cmd+p)'}
    />,
    <PageAction icon={icons.cycleListWhite} onClick={cycleListStyleCb} title="Cycle list style (Ctrl+. or Cmd+.)" />,
    <PageAction icon={icons.checkWhite} onClick={goHome} title="Done (Esc or Ctrl+Enter or Cmd+Enter)" />,
  ];

  return (
    <PageLayout>
      <PageHeader actions={pageActions} />
      <PageBody>
        <div className="page note-page">
          {!note && (app.syncing || app.updatingNotes) && <h2 className="page-message">...</h2>}
          {!note && !(app.syncing || app.updatingNotes) && <h2 className="page-message">Not found</h2>}
          {note && (
            <div className="note-container">
              <Editor
                ref={editorRef}
                id="note-editor"
                className="text-input"
                placeholder="What's on your mind?"
                value={note.text ?? ''}
                onChange={textChangeCb}
              />
              <div className="footer">
                <span>Created on {formatDateTime(new Date(note.creation_date))}</span>
                {note.creation_date !== note.modification_date && (
                  <span>Updated on {formatDateTime(new Date(note.modification_date))}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </PageBody>
    </PageLayout>
  );
}

export async function notePageLoader({ params }: RouteMatch): Promise<t.Note | undefined> {
  if (appStore.get().user) {
    return await storage.getNote(params.noteId as string);
  }
}
