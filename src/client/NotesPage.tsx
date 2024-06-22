import { RouteMatch } from './router.jsx';
import React, { useState, useEffect, useRef, memo } from 'react';
import { useStoreAndRestoreScrollY } from './hooks.js';
import type * as t from '../common/types.js';
import * as cutil from '../common/util.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as actions from './appStoreActions.jsx';
import log from './logger.js';
import { Editor, EditorContext } from './Editor.jsx';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import _ from 'lodash';
import * as icons from './icons.js';
import { Notes } from './Notes.jsx';
// import log from './logger.js';

type NotesPageProps = {};

export function NotesPage(_props: NotesPageProps) {
  const app = appStore.use();
  const [newNote, setNewNote] = useState<t.Note>();
  // const [newNoteText, setNewNoteText] = useState('');
  // const [newNotePinned, setNewNotePinned] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [stickyEditor, setStickyEditor] = useState(false);
  const editorRef = useRef<EditorContext | null>(null);
  useStoreAndRestoreScrollY();

  // Check for changes in storage and update the notes.
  useEffect(() => {
    // log('NotesPage received notesInStorageChangedExternally');
    window.addEventListener('notesInStorageChangedExternally', actions.updateNotes);
    return () => window.removeEventListener('notesInStorageChangedExternally', actions.updateNotes);
  }, []);

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
        handle(confirmNewNoteCb);
      } else if (e.key === 'Escape') {
        handle(confirmNewNoteCb);
      } else if (e.key === 'Delete' && ctrlOrMeta) {
        handle(cancelNewNoteCb);
      } else if (e.key === '.' && ctrlOrMeta) {
        handle(cycleListStyleCb);
      } else if (e.key === 'p' && ctrlOrMeta) {
        handle(togglePinned);
      }

      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')) return;

      if (e.key === '/') {
        if (app.search) {
          handle(() => document.getElementById('search-input')?.focus());
        } else {
          handle(toggleSearchCb);
        }
      } else if (e.key === 'p') {
        handle(toggleHidePinnedNotes);
      } else if (e.key === 'n') {
        if (editing) {
          handle(() => editorRef.current?.textareaRef.current?.focus());
        } else {
          handle(startNewNoteCb);
        }
      }
    }

    window.addEventListener('keydown', callback);
    return () => window.removeEventListener('keydown', callback);
  });

  function saveNewNote(changes: { text?: string | null; pinned?: number; not_deleted?: number }) {
    let savedNote = {
      ...(newNote ?? cutil.createNewNote('')),
      ...changes,
      modification_date: new Date().toISOString(),
    };
    setNewNote(savedNote);
    actions.saveNote(savedNote);
  }

  function deleteNewNote() {
    if (newNote) {
      appStore.update(app => {
        app.notes = app.notes.filter(n => n.id !== newNote.id);
      });
      saveNewNote({ text: null, not_deleted: 0 });
    }
  }

  function confirmNewNoteCb() {
    if (!newNote?.text?.trim()) {
      cancelNewNoteCb();
      return;
    }
    actions.showMessage('Note added', { type: 'info' });
    editorRef.current!.focus();
    setNewNote(undefined);
    actions.updateNotes();
  }

  async function cancelNewNoteCb() {
    if (newNote) {
      // It's possible that before we confirmed or cancelled the new note,
      // it was changed from another session. In that case, we don't want
      // to delete the note.
      const noteInStorage = await storage.getNote(newNote.id);
      if (!noteInStorage || !cutil.isNoteNewerThan(noteInStorage, newNote)) {
        deleteNewNote();
      }
    }
    setNewNote(undefined);
    setEditing(false);
    actions.updateNotes();
    (document.activeElement as HTMLElement | undefined)?.blur();
  }

  // async function askUserToCancelNewNoteCb() {
  //   if (!newNote?.text?.trim() || confirm('Are you sure you want to delete the new note?')) {
  //     cancelNewNoteCb();
  //   }
  // }

  function newNoteTextChanged(text: string) {
    saveNewNote({ text });
  }

  // Set editor's stickiness on mount and on scroll.
  useEffect(() => {
    function scrolled() {
      setStickyEditor(window.scrollY > 64);
      reduceNotePagesDebounced();
    }

    scrolled();
    window.addEventListener('scroll', scrolled);
    return () => window.removeEventListener('scroll', scrolled);
  }, []);

  function editorFocusCb() {
    setEditing(true);
    setEditorFocused(true);
  }

  function editorBlurCb() {
    setEditorFocused(false);
  }

  // Cancel new note if editor is empty and has lost focus.
  useEffect(() => {
    let timeout: any;
    if (editing && !editorFocused && !newNote?.text) {
      timeout = setTimeout(() => cancelNewNoteCb(), 300);
    }
    return () => clearTimeout(timeout);
  }, [editing, newNote, editorFocused, cancelNewNoteCb]);

  function togglePinned() {
    editorRef.current!.focus();
    saveNewNote({ pinned: newNote?.pinned ? 0 : 1 });
  }

  function toggleHidePinnedNotes() {
    const value = !app.hidePinnedNotes;
    storage.setSetting(value, 'hidePinnedNotes');
    appStore.update(app => {
      app.hidePinnedNotes = value;
    });
    actions.updateNotes();
    actions.showMessage(value ? 'Hiding pinned notes' : 'Showing pinned notes');
  }

  function loadMore() {
    appStore.update(app => {
      app.notePages++;
    });
    actions.updateNotes();
  }

  function toggleSearchCb() {
    appStore.update(app => {
      app.search = app.search === undefined ? '' : undefined;
    });
    actions.updateNotes();
  }

  function searchChangeCb(e: React.ChangeEvent<HTMLInputElement>) {
    appStore.update(app => {
      app.search = e.target.value;
    });
    actions.updateNotesDebounced();
  }

  function searchKeyDownCb(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      toggleSearchCb();
    }
  }

  function cycleListStyleCb() {
    editorRef.current!.cycleListStyle();
  }

  function startNewNoteCb() {
    setEditing(true);
    editorRef.current!.focus();
  }

  const pageActions: React.ReactNode[] = [];
  if (editing) {
    pageActions.push(
      <PageAction icon={icons.trashWhite} onClick={cancelNewNoteCb} title="Delete (Ctrl+Delete or Cmd+Delete)" />,
      <PageAction
        icon={newNote?.pinned ? icons.pinFilledWhite : icons.pinEmptyWhite}
        onClick={togglePinned}
        title={newNote?.pinned ? 'Unpin (Ctrl+p or Cmd+p)' : 'Pin (Ctrl+p or Cmd+p)'}
      />,
      <PageAction icon={icons.cycleListWhite} onClick={cycleListStyleCb} title="Cycle list style (Ctrl+. or Cmd+.)" />,
      <PageAction icon={icons.checkWhite} onClick={confirmNewNoteCb} title="Done (Esc or Ctrl+Enter or Cmd+Enter)" />,
    );
  } else if (app.search === undefined) {
    pageActions.push(
      <PageAction icon={icons.searchWhite} onClick={toggleSearchCb} title="Search (/)" />,
      <PageAction
        icon={app.hidePinnedNotes ? icons.hidePinnedWhite2 : icons.showPinnedWhite}
        onClick={toggleHidePinnedNotes}
        title={app.hidePinnedNotes ? 'Show pinned notes (p)' : 'Hide pinned notes (p)'}
      />,
      <PageAction icon={icons.addWhite} onClick={startNewNoteCb} title="New note (n)" />,
    );
  } else {
    pageActions.push(
      <input
        id="search-input"
        placeholder={app.showArchive ? 'Search archive ...' : 'Search ...'}
        className="search action"
        value={app.search}
        onChange={searchChangeCb}
        onKeyDown={searchKeyDownCb}
        autoFocus
      />,
      <PageAction
        icon={app.hidePinnedNotes ? icons.hidePinnedWhite2 : icons.showPinnedWhite}
        onClick={toggleHidePinnedNotes}
        title={app.hidePinnedNotes ? 'Show pinned notes (p)' : 'Hide pinned notes (p)'}
      />,
      <PageAction className="close-search" icon={icons.xWhite} onClick={toggleSearchCb} title="Close search (Esc)" />,
    );
  }

  return (
    <PageLayout>
      <PageHeader
        actions={pageActions}
        title={app.showArchive ? '/ archive' : undefined}
        hasSticky={stickyEditor && editing}
        hasSearch={app.search !== undefined}
      />
      <PageBody>
        <div className="page notes-page">
          <div
            className={`new-note-container ${stickyEditor ? 'sticky' : ''} ${
              stickyEditor && !editing ? 'invisible' : ''
            }`}
          >
            <Editor
              ref={editorRef}
              id="new-note-editor"
              className="text-input"
              placeholder="What's on your mind?"
              value={newNote?.text ?? ''}
              onChange={newNoteTextChanged}
              autoExpand
              onFocus={editorFocusCb}
              onBlur={editorBlurCb}
            />
          </div>
          {app.notes.length > 0 && <NotesFromApp hiddenNoteId={newNote?.id} />}
          {!app.notes.length && (app.syncing || app.updatingNotes) && <h2 className="page-message">...</h2>}
          {/*!app.notes.length && !(app.syncing || app.updatingNotes) && <h2 className="page-message">No notes found</h2>*/}
          {!app.allNotePagesLoaded && (
            <button className="load-more primary button-row" onClick={loadMore}>
              Load more
            </button>
          )}
        </div>
      </PageBody>
    </PageLayout>
  );
}

const NotesFromApp = memo(function NotesFromApp(props: { hiddenNoteId?: string }) {
  const app = appStore.use();
  return (
    <Notes
      notes={app.notes}
      hiddenNoteId={props.hiddenNoteId}
      onNoteChange={actions.saveNoteAndQuickUpdateNotes}
      onNoteClick={goToNote}
      hideContentAfterBreak
    />
  );
});

function goToNote(note: t.Note) {
  history.pushState(null, '', `/n/${note.id}`);
}

export async function notesPageLoader(match: RouteMatch) {
  // Update app.showArchive when transitioning between / and /archive.
  appStore.update(app => {
    const showArchive = match.pathname === '/archive';
    if (showArchive !== app.showArchive) {
      app.showArchive = showArchive;
      // app.notesUpdateRequestTimestamp = Date.now();
    }
  });

  if (appStore.get().user) {
    log('notesPageLoader calling updateNotes');
    // Not awaiting this causes glitches especially when going from / to /archive and back with scroll restoration.
    await actions.updateNotes();
  }
}

function reduceNotePagesImmediately() {
  const notes = document.querySelectorAll('.note');
  for (const [i, note] of notes.entries()) {
    const rect = note.getBoundingClientRect();
    if (rect.top > window.innerHeight * 2 + window.scrollY) {
      actions.reduceNotePages(i);
      break;
    }
  }
}

const reduceNotePagesDebounced = _.debounce(reduceNotePagesImmediately, 1000);
