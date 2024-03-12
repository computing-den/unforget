import { useNavigate, Link } from 'react-router-dom';
import React, { useCallback, useState, useEffect, useMemo, memo } from 'react';
import type * as t from '../common/types.js';
import * as cutil from '../common/util.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import Editor from './Editor.jsx';
import { PageLayout, PageHeader, PageBody, PageAction, MenuItem } from './PageLayout.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';

type NotesPageProps = {};

export function NotesPage(props: NotesPageProps) {
  const app = appStore.use();
  const [newNoteText, setNewNoteText] = useState('');
  const [newNotePinned, setNewNotePinned] = useState(false);
  // const [editing, setEditing] = useState(false);

  const addNoteCb = useCallback(
    () => addNote(newNoteText, newNotePinned).then(() => setNewNoteText('')),
    [newNoteText, newNotePinned],
  );

  const newNoteTextChanged = useCallback((text: string) => {
    setNewNoteText(text);
  }, []);

  // Update notes on mount.
  useEffect(() => {
    actions.updateNotesIfDirty();
  }, []);

  // const editorFocusCb = useCallback(() => {
  //   setEditing(true);
  // }, []);

  // const editorBlurCb = useCallback(() => {
  //   setEditing(false);
  // }, []);

  const togglePinned = useCallback(() => {
    setNewNotePinned(!newNotePinned);
  }, [newNotePinned]);

  const toggleHidePinnedNotes = useCallback(async () => {
    const value = !app.hidePinnedNotes;
    storage.setSetting(value, 'hidePinnedNotes');
    appStore.update(app => {
      app.hidePinnedNotes = value;
    });
    actions.updateNotes();
  }, [app.hidePinnedNotes]);

  const loadMore = useCallback(() => {
    appStore.update(app => {
      app.notePages++;
    });
    actions.updateNotes();
  }, []);

  const toggleSearchCb = useCallback(() => {
    appStore.update(app => {
      app.search = app.search === undefined ? '' : undefined;
    });
    actions.updateNotes();
  }, []);

  const searchChangeCb = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    appStore.update(app => {
      app.search = e.target.value;
    });
    actions.updateNotesDebounced();
  }, []);

  const pageActions: React.ReactNode[] = [];
  if (newNoteText) {
    pageActions.push(
      <PageAction
        icon={newNotePinned ? '/icons/pin-filled-white.svg' : '/icons/pin-empty-white.svg'}
        onClick={togglePinned}
      />,
      <PageAction icon="/icons/check-white.svg" onClick={addNoteCb} />,
    );
  } else if (app.search === undefined) {
    pageActions.push(
      <PageAction
        icon={app.hidePinnedNotes ? '/icons/hide-pinned-white.svg' : '/icons/show-pinned-white.svg'}
        onClick={toggleHidePinnedNotes}
      />,
      <PageAction icon="icons/search-white.svg" onClick={toggleSearchCb} />,
    );
  } else {
    pageActions.push(
      <input
        placeholder="Search ..."
        className="search action"
        value={app.search}
        onChange={searchChangeCb}
        autoFocus
      />,
      <PageAction className="close-search" icon="/icons/x-white.svg" onClick={toggleSearchCb} />,
    );
  }

  const toggleShowArchive = util.useCallbackCancelEvent(() => {
    const value = !app.showArchive;
    storage.setSetting(value, 'showArchive');
    appStore.update(app => {
      app.menuOpen = false;
      app.showArchive = !app.showArchive;
    });
    actions.updateNotes();
  }, [app.showArchive]);

  const menu: MenuItem[] = [
    app.showArchive
      ? { label: 'Notes', icon: '/icons/notes.svg', onClick: toggleShowArchive }
      : { label: 'Archive', icon: '/icons/archive-empty.svg', onClick: toggleShowArchive },
  ];

  return (
    <PageLayout>
      <PageHeader actions={pageActions} menu={menu} title={app.showArchive ? 'archive' : undefined} />
      <PageBody>
        <div className="notes-page">
          <div className="new-note-container">
            <Editor
              id="new-note-editor"
              className="text-input"
              placeholder="What's on you mind?"
              value={newNoteText}
              onChange={newNoteTextChanged}
              autoExpand
              // onFocus={editorFocusCb}
              // onBlur={editorBlurCb}
            />
          </div>
          <Notes />
          {!app.allNotePagesLoaded && (
            <button className="load-more button-row" onClick={loadMore}>
              Load more
            </button>
          )}
        </div>
      </PageBody>
    </PageLayout>
  );
}

const Notes = memo(function Notes() {
  const app = appStore.use();
  return (
    <div className="notes">
      {app.notes.map(note => (
        <Note key={note.id} note={note} />
      ))}
    </div>
  );
});

const Note = memo(function Note(props: { note: t.Note }) {
  const navigate = useNavigate();
  const [mouseDownPos, setMouseDownPos] = useState<[number, number] | undefined>();
  // const ps = (props.note.text || '').split(/\n+/).map((x, i) => <p key={i}>{x}</p>);

  const mouseDownCb = (e: React.MouseEvent) => {
    setMouseDownPos([e.clientX, e.clientY]);
  };
  const clickCb = (e: React.MouseEvent) => {
    if (!mouseDownPos) return;
    const diff = [Math.abs(e.clientX - mouseDownPos[0]), Math.abs(e.clientY - mouseDownPos[1])];
    const dist = Math.sqrt(diff[0] ** 2 + diff[1] ** 2);
    if (dist < 5) {
      navigate(`/n/${props.note.id}`, { state: { fromNotesPage: true } });
    }
  };
  let text = props.note.text;
  if (text && text.length > 1500) {
    text = text.substring(0, 1500) + '\n..........';
  }
  if (text && countLines(text) > 20) {
    text = text.split(/\r?\n/).slice(0, 20).join('\n') + '\n..........';
  }
  const titleBodyMatch = text?.match(/^([^\r\n]+)\r?\n\r?\n(.+)$/s);
  let title = titleBodyMatch?.[1];
  let body = titleBodyMatch?.[2] ?? text;

  return (
    <pre className="note" onMouseDown={mouseDownCb} onClick={clickCb}>
      {Boolean(props.note.pinned) && <img className="pin" src="/icons/pin-filled.svg" />}
      {title && <span className="title">{title}</span>}
      {title && '\n\n'}
      {body}
    </pre>
  );
});

async function addNote(text: string, pinned: boolean): Promise<void> {
  document.getElementById('new-note-editor')!.focus();
  if (!text) return;

  const newNote: t.Note = {
    id: uuid(),
    text,
    creation_date: new Date().toISOString(),
    modification_date: new Date().toISOString(),
    order: Date.now(),
    not_deleted: 1,
    not_archived: 1,
    pinned: pinned ? 1 : 0,
  };
  await actions.saveNote(newNote, { message: 'note added', immediateSync: true });
  await actions.updateNotes();
}

export async function notesPageLoader(): Promise<null> {
  // First load.
  if (appStore.get().notes.length === 0) {
    await actions.updateNotes();
  }
  return null;
}

function countLines(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') count++;
  return count;
}
