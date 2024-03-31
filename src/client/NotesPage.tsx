import { useRouter } from './router.jsx';
import React, { useCallback, useState, useEffect, useRef, memo } from 'react';
import type * as t from '../common/types.js';
import * as cutil from '../common/util.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import { Editor, EditorContext } from './Editor.jsx';
import { MenuItem } from './Menu.jsx';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';

type NotesPageProps = {};

export function NotesPage(props: NotesPageProps) {
  const app = appStore.use();
  const [newNoteText, setNewNoteText] = useState('');
  const [newNotePinned, setNewNotePinned] = useState(false);
  const [editing, setEditing] = useState(false);
  const editorRef = useRef<EditorContext | null>(null);

  const addNoteCb = useCallback(() => {
    if (newNoteText) {
      addNote(newNoteText, newNotePinned).then(() => setNewNoteText(''));
    } else {
      setNewNoteText('');
    }
    setEditing(false);
  }, [newNoteText, newNotePinned]);

  const cancelNewNoteCb = useCallback(() => {
    setNewNoteText('');
    setEditing(false);
  }, []);

  const newNoteTextChanged = useCallback((text: string) => {
    setNewNoteText(text);
  }, []);

  // Update notes on mount.
  useEffect(() => {
    actions.updateNotesIfDirty();
  }, []);

  const editorFocusCb = useCallback(() => {
    setEditing(true);
  }, []);

  const editorBlurCb = useCallback(() => {
    // setEditing(false);
  }, []);

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

  const cycleListStyleCb = useCallback(() => {
    editorRef.current!.cycleListStyle();
  }, []);

  // const insertMenu = createInsertMenu(() => editorRef.current!);

  const pageActions: React.ReactNode[] = [];
  if (editing) {
    pageActions.push(
      <PageAction icon="/icons/bulletpoint-white.svg" onClick={cycleListStyleCb} />,

      <PageAction
        icon={newNotePinned ? '/icons/pin-filled-white.svg' : '/icons/pin-empty-white.svg'}
        onClick={togglePinned}
      />,
      <PageAction icon="/icons/x-white.svg" onClick={cancelNewNoteCb} />,
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
        placeholder={app.showArchive ? 'Search archive ...' : 'Search ...'}
        className="search action"
        value={app.search}
        onChange={searchChangeCb}
        autoFocus
      />,
      <PageAction className="close-search" icon="/icons/x-white.svg" onClick={toggleSearchCb} />,
    );
  }

  const toggleShowArchive = useCallback(() => {
    const value = !app.showArchive;
    storage.setSetting(value, 'showArchive');
    appStore.update(app => {
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
      <PageHeader
        actions={pageActions}
        menu={menu}
        title={app.showArchive && app.search === undefined ? '/ archive' : undefined}
      />
      <PageBody>
        <div className="notes-page">
          <div className="new-note-container">
            <Editor
              ref={editorRef}
              id="new-note-editor"
              className="text-input"
              placeholder="What's on you mind?"
              value={newNoteText}
              onChange={newNoteTextChanged}
              autoExpand
              onFocus={editorFocusCb}
              onBlur={editorBlurCb}
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
  let text = props.note.text;
  // if (text && text.length > 1500) {
  //   text = text.substring(0, 1500) + '\n..........';
  // }
  const lineLimit = 30;
  if (text && countLines(text) > lineLimit) {
    text = text.split(/\r?\n/).slice(0, lineLimit).join('\n') + '\n..........';
  }
  // const titleBodyMatch = text?.match(/^([^\r\n]+)\r?\n\r?\n(.+)$/s);
  // let title = titleBodyMatch?.[1];
  // let body = titleBodyMatch?.[2] ?? text ?? '';
  const lines = cutil.parseLines(text ?? '');
  const hasTitle = lines.length > 2 && !lines[0].bullet && lines[1].wholeLine === '';

  function clickCb(e: React.MouseEvent) {
    history.pushState({ fromNotesPage: true }, '', `/n/${props.note.id}`);
  }

  const { onClick, onMouseDown } = util.useClickWithoutDrag(clickCb);

  function inputClickCb(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as HTMLInputElement;
    const lineIndex = Number(target.dataset.lineIndex);
    const line = lines[lineIndex];
    const newLineText = cutil.toggleLineCheckbox(line);
    const newText = cutil.insertText(props.note.text!, newLineText, line.start, line.end);
    const newNote: t.Note = { ...props.note, text: newText, modification_date: new Date().toISOString() };
    actions.saveNoteAndQuickUpdateNotes(newNote);
  }

  function renderLine(line: t.ParsedLine, i: number): React.ReactNode {
    let res = [];

    if (hasTitle && i === 0) {
      // Render title.
      res.push(<span className="title">{lines[0].wholeLine}</span>);
    } else if (!hasTitle || i >= 2) {
      // Render body line.

      if (i > 0) res.push('\n');

      if (!line.bullet) {
        res.push(line.wholeLine);
      } else {
        res.push(' '.repeat(line.padding * 2));
        if (line.checkbox) {
          res.push(
            <input
              type="checkbox"
              key={`input-${props.note.id}-${i}`}
              onClick={inputClickCb}
              data-line-index={i}
              checked={line.checked}
            />,
          );
          res.push(' ');
        } else {
          res.push('• ');
        }
        res.push(line.body);
      }
    }

    return res;
  }

  // const bodyLines = hasTitle ? lines.slice(2) : lines;

  return (
    <pre className="note" onMouseDown={onMouseDown} onClick={onClick}>
      {Boolean(props.note.pinned) && <img className="pin" src="/icons/pin-filled.svg" />}
      {lines.map(renderLine)}
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

export async function notesPageLoader() {
  // await new Promise(resolve => setTimeout(resolve, 3000));
  // First load.
  // if (appStore.get().notes.length === 0) {
  //   await actions.updateNotes();
  // }
}

function countLines(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') count++;
  return count;
}
