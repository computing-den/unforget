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
import { PageLayout, PageHeader, PageBody, PageAction, type PageHeaderSecondRowProps } from './PageLayout.jsx';
import _ from 'lodash';
import * as icons from './icons.js';
import { Notes } from './Notes.jsx';
import * as b from './cross-context-broadcast.js';
import { addSyncEventListener, removeSyncEventListener, type SyncEvent } from './sync.js';
// import log from './logger.js';

type NotesPageProps = {};

export function NotesPage(_props: NotesPageProps) {
  const app = appStore.use();
  const [newNote, setNewNote] = useState<t.Note>();
  // const [newNoteText, setNewNoteText] = useState('');
  // const [newNotePinned, setNewNotePinned] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [stickyEditor, setStickyEditor] = useState(false);
  const editorRef = useRef<EditorContext | null>(null);
  useStoreAndRestoreScrollY();

  // Check for changes in storage initiated externally or internally and update the notes.
  useEffect(() => {
    function handleBroadcastMessage(message: t.BroadcastChannelMessage) {
      if (message.type === 'notesInStorageChanged') {
        actions.updateNotes();
      }
    }

    function handleSyncEvent(e: SyncEvent) {
      if (e.type === 'mergedNotes') {
        actions.updateNotes();
      }
    }

    b.addListener(handleBroadcastMessage); // External changes.
    addSyncEventListener(handleSyncEvent); // Internal changes.
    return () => {
      removeSyncEventListener(handleSyncEvent);
      b.removeListener(handleBroadcastMessage);
    };
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
      } else if (e.key === 'Escape' && !ctrlOrMeta) {
        if (editorOpen) {
          handle(confirmNewNoteCb);
        } else if (app.noteSelection) {
          handle(toggleNoteSelectionMode);
        }
      } else if (e.key === 'Delete' && e.shiftKey && ctrlOrMeta) {
        handle(cancelNewNoteCb);
      } else if (e.key === '.' && ctrlOrMeta) {
        handle(cycleListStyleCb);
      } else if (e.key === 'p' && ctrlOrMeta) {
        handle(togglePinned);
      } else if (e.key === 'ArrowUp' && e.shiftKey && ctrlOrMeta) {
        handle(actions.moveNoteSelectionToTop);
      } else if (e.key === 'ArrowDown' && e.shiftKey && ctrlOrMeta) {
        handle(actions.moveNoteSelectionToBottom);
      } else if (e.key === 'ArrowUp' && ctrlOrMeta) {
        handle(actions.moveNoteSelectionUp);
      } else if (e.key === 'ArrowDown' && ctrlOrMeta) {
        handle(actions.moveNoteSelectionDown);
      }

      // Ignore the following shortcuts if input or textarea is focused
      // or if ctrl or meta key is pressed
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')) return;
      if (ctrlOrMeta) return;

      if (e.key === '/') {
        if (app.search) {
          handle(() => document.getElementById('search-input')?.focus());
        } else {
          handle(toggleNoteSearchCb);
        }
      } else if (e.key === 'p') {
        handle(toggleHidePinnedNotes);
      } else if (e.key === 'n') {
        if (editorOpen) {
          handle(() => editorRef.current?.textareaRef.current?.focus());
        } else {
          handle(startNewNoteCb);
        }
      } else if (e.key === 's') {
        handle(toggleNoteSelectionMode);
      } else if (e.key === 'A' && app.showArchive) {
        handle(unarchiveNoteSelection);
      } else if (e.key === 'a' && !app.showArchive) {
        handle(archiveNoteSelection);
      }
    }

    window.addEventListener('keydown', callback);
    return () => window.removeEventListener('keydown', callback);
  });

  function archiveNoteSelection() {
    const count = app.noteSelection?.length ?? 0;
    if (count > 0 && confirm(`Are you sure you want to archive ${count} note(s)?`)) {
      actions.archiveNoteSelection();
    }
  }

  function unarchiveNoteSelection() {
    const count = app.noteSelection?.length ?? 0;
    if (count > 0 && confirm(`Are you sure you want to unarchive ${count} note(s)?`)) {
      actions.unarchiveNoteSelection();
    }
  }

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
    if (!newNote || confirm('Are you sure you want to delete this note?')) {
      deleteNewNote();
      setNewNote(undefined);
      setEditorOpen(false);
      actions.updateNotes();
      (document.activeElement as HTMLElement | undefined)?.blur();
    }
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
    setEditorOpen(true);
    setEditorFocused(true);
  }

  function editorBlurCb() {
    setEditorFocused(false);
  }

  // Cancel new note if editor is empty and has lost focus.
  useEffect(() => {
    let timeout: any;
    if (editorOpen && !editorFocused && !newNote?.text) {
      timeout = setTimeout(() => cancelNewNoteCb(), 300);
    }
    return () => clearTimeout(timeout);
  }, [editorOpen, newNote, editorFocused, cancelNewNoteCb]);

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

  function toggleNoteSearchCb() {
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
      toggleNoteSearchCb();
    }
  }

  function cycleListStyleCb() {
    editorRef.current!.cycleListStyle();
  }

  function startNewNoteCb() {
    setEditorOpen(true);
    editorRef.current!.focus();
  }

  function toggleNoteSelectionMode() {
    appStore.update(app => {
      app.noteSelection = app.noteSelection ? undefined : [];
    });
  }

  const pageActions: React.ReactNode[] = [];
  if (editorOpen) {
    pageActions.push(
      <PageAction
        icon={icons.trashWhite}
        onClick={cancelNewNoteCb}
        title="Delete (Ctrl+Shift+Delete or Cmd+Shift+Delete)"
      />,
      <PageAction
        icon={newNote?.pinned ? icons.pinFilledWhite : icons.pinEmptyWhite}
        onClick={togglePinned}
        title={newNote?.pinned ? 'Unpin (Ctrl+p or Cmd+p)' : 'Pin (Ctrl+p or Cmd+p)'}
      />,
      <PageAction icon={icons.cycleListWhite} onClick={cycleListStyleCb} title="Cycle list style (Ctrl+. or Cmd+.)" />,
      <PageAction icon={icons.checkWhite} onClick={confirmNewNoteCb} title="Done (Esc or Ctrl+Enter or Cmd+Enter)" />,
    );
  } else if (app.search === undefined) {
    if (app.noteSelection) {
      pageActions.push(
        <PageAction
          icon={icons.circleDeselectWhite}
          onClick={toggleNoteSelectionMode}
          title={'Clear selection (s or Esc)'}
        />,
      );
    } else {
      pageActions.push(
        <PageAction icon={icons.circleSelectWhite} onClick={toggleNoteSelectionMode} title={'Select (s)'} />,
      );
    }
    pageActions.push(
      <PageAction icon={icons.searchWhite} onClick={toggleNoteSearchCb} title="Search (/)" />,
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
      <PageAction
        className="close-search"
        icon={icons.xWhite}
        onClick={toggleNoteSearchCb}
        title="Close search (Esc)"
      />,
    );
  }

  let secondRow: PageHeaderSecondRowProps | undefined;
  if (app.noteSelection) {
    // const allPinned = app.notes.every(note => note.pinned);
    const allArchived = app.notes.every(note => !note.not_archived);

    secondRow = {
      title:
        app.noteSelection.length === 0
          ? 'Select notes'
          : app.noteSelection.length === 1
            ? '1 selected'
            : `${app.noteSelection.length} selected`,
      actions: [
        allArchived ? (
          <PageAction
            icon={icons.archiveFilledWhite}
            onClick={unarchiveNoteSelection}
            title="Unarchive selection (Shift+a)"
          />
        ) : (
          <PageAction icon={icons.archiveEmptyWhite} onClick={archiveNoteSelection} title="Archive selection (a)" />
        ),
        <PageAction
          icon={icons.chevronDownDoubleWhite}
          onClick={actions.moveNoteSelectionToBottom}
          title="Move selection to the bottom (Ctrl+Shift+Down or Cmd+Shift+Down)"
        />,
        <PageAction
          icon={icons.chevronUpDoubleWhite}
          onClick={actions.moveNoteSelectionToTop}
          title="Move selection to the top (Ctrl+Shift+Up or Cmd+Shift+Up)"
        />,
        <PageAction
          icon={icons.chevronDownWhite}
          onClick={actions.moveNoteSelectionDown}
          title="Move selection down (Ctrl+Down or Cmd+Down)"
        />,
        <PageAction
          icon={icons.chevronUpWhite}
          onClick={actions.moveNoteSelectionUp}
          title="Move selection up (Ctrl+Up or Cmd+Up)"
        />,
      ],
    };
  }

  return (
    <PageLayout>
      <PageHeader
        actions={pageActions}
        title={app.showArchive ? '/ archive' : undefined}
        hasSticky={stickyEditor && editorOpen}
        hasSearch={app.search !== undefined}
        secondRow={secondRow}
      />
      <PageBody>
        <div className="page notes-page">
          <div
            className={`new-note-container ${stickyEditor ? 'sticky' : ''} ${
              stickyEditor && !editorOpen ? 'invisible' : ''
            } ${secondRow ? 'below-second-row' : ''}`}
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
      onToggleNoteSelection={actions.toggleNoteSelection}
      noteSelection={app.noteSelection}
      hideContentAfterBreak
      selectable
    />
  );
});

function goToNote(note: t.Note) {
  history.pushState(null, '', `/n/${note.id}`);
}

export async function notesPageLoader(match: RouteMatch) {
  // Update app.showArchive and noteSelection when transitioning between / and /archive.
  appStore.update(app => {
    const showArchive = match.pathname === '/archive';
    if (showArchive !== app.showArchive) {
      app.showArchive = showArchive;
      app.noteSelection = undefined;
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
