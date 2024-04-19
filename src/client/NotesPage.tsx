import { RouteMatch } from './router.jsx';
import React, { useCallback, useState, useEffect, useRef, memo } from 'react';
import type * as t from '../common/types.js';
import * as cutil from '../common/util.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import { Editor, EditorContext } from './Editor.jsx';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';
import * as icons from './icons.js';
import { Notes } from './Notes.jsx';
import log from './logger.js';

type NotesPageProps = {};

export function NotesPage(props: NotesPageProps) {
  const app = appStore.use();
  const [newNote, setNewNote] = useState<t.Note>();
  // const [newNoteText, setNewNoteText] = useState('');
  // const [newNotePinned, setNewNotePinned] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [stickyEditor, setStickyEditor] = useState(false);
  const editorRef = useRef<EditorContext | null>(null);
  util.useStoreAndRestoreScrollY();

  function saveNewNote(changes: { text?: string | null; pinned?: number; not_deleted?: number }) {
    let savedNote = {
      ...(newNote ?? createNewNote()),
      ...changes,
      modification_date: new Date().toISOString(),
    };
    setNewNote(savedNote);
    actions.saveNote(savedNote);
  }

  function confirmNewNoteCb() {
    if (newNote?.text?.trim()) {
      actions.showMessage('Note added', { type: 'info' });
      editorRef.current!.focus();
    } else {
      setEditing(false);
    }
    setNewNote(undefined);
    actions.updateNotesIfDirty();
  }

  async function cancelNewNoteCb() {
    if (newNote) {
      // It's possible that before we confirmed or cancelled the new note,
      // it was changed from another session. In that case, we don't want
      // to delete the note.
      const noteInStorage = await storage.getNote(newNote.id);
      if (!noteInStorage || !cutil.isNoteNewerThan(noteInStorage, newNote)) {
        saveNewNote({ text: null, not_deleted: 0 });
      }
    }
    setNewNote(undefined);
    setEditing(false);
    actions.updateNotesIfDirty();
  }

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
      <PageAction icon={icons.bulletpointWhite} onClick={cycleListStyleCb} title="Cycle list style" />,

      <PageAction
        icon={newNote?.pinned ? icons.pinFilledWhite : icons.pinEmptyWhite}
        onClick={togglePinned}
        title={newNote?.pinned ? 'Unpin' : 'Pin'}
      />,
      <PageAction icon={icons.xWhite} onClick={cancelNewNoteCb} title="Cancel" />,
      <PageAction icon={icons.checkWhite} onClick={confirmNewNoteCb} title="Done" />,
    );
  } else if (app.search === undefined) {
    pageActions.push(
      <PageAction icon={icons.searchWhite} onClick={toggleSearchCb} title="Search" />,
      <PageAction
        icon={app.hidePinnedNotes ? icons.hidePinnedWhite : icons.showPinnedWhite}
        onClick={toggleHidePinnedNotes}
        title={app.hidePinnedNotes ? 'Show pinned notes' : 'Hide pinned notes'}
      />,
      <PageAction icon={icons.addWhite} onClick={startNewNoteCb} title="New note" />,
    );
  } else {
    pageActions.push(
      <input
        placeholder={app.showArchive ? 'Search archive ...' : 'Search ...'}
        className="search action"
        value={app.search}
        onChange={searchChangeCb}
        autoFocus
      />,
      <PageAction className="close-search" icon={icons.xWhite} onClick={toggleSearchCb} title="Close search" />,
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
        <div className="notes-page">
          <div
            className={`new-note-container ${stickyEditor ? 'sticky' : ''} ${
              stickyEditor && !editing ? 'invisible' : ''
            }`}
          >
            <Editor
              ref={editorRef}
              id="new-note-editor"
              className="text-input"
              placeholder="What's on you mind?"
              value={newNote?.text ?? ''}
              onChange={newNoteTextChanged}
              autoExpand
              onFocus={editorFocusCb}
              onBlur={editorBlurCb}
            />
          </div>
          {app.notes.length > 0 && <NotesFromApp />}
          {!app.notes.length && app.syncing && <h2 className="page-message">Loading...</h2>}
          {!app.notes.length && !app.syncing && <h2 className="page-message">No notes found</h2>}
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

const NotesFromApp = memo(function NotesFromApp() {
  const app = appStore.use();
  return <Notes notes={app.notes} />;
});

function createNewNote(): t.Note {
  return {
    id: uuid(),
    text: '',
    creation_date: new Date().toISOString(),
    modification_date: new Date().toISOString(),
    order: Date.now(),
    not_deleted: 1,
    not_archived: 1,
    pinned: 0,
  };
}

export async function notesPageLoader(match: RouteMatch) {
  // When transitioning to / or /archive, we only want to update the notes if necessary.
  appStore.update(app => {
    const showArchive = match.pathname === '/archive';
    if (showArchive !== app.showArchive) {
      app.showArchive = showArchive;
      app.notesUpdateRequestTimestamp = Date.now();
    }
  });

  // Not awaiting this causes glitches especially when going from / to /archive and back with scroll restoration.
  await actions.updateNotesIfDirty();
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
