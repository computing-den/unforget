import { useNavigate, Link } from 'react-router-dom';
import React, { useCallback, useState, useEffect, memo } from 'react';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import Editor from './Editor.jsx';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';

type NotesPageProps = {};

function NotesPage(props: NotesPageProps) {
  const [newNoteText, setNewNoteText] = useState('');
  const [editing, setEditing] = useState(false);

  const addNoteCb = useCallback(() => addNote(newNoteText).then(() => setNewNoteText('')), [newNoteText]);

  const newNoteTextChanged = useCallback((text: string) => {
    setNewNoteText(text);
  }, []);

  const editorFocusCb = useCallback(() => {
    setEditing(true);
  }, []);

  const editorBlurCb = useCallback(() => {
    setEditing(false);
  }, []);

  return (
    <PageLayout>
      <PageHeader actions={[newNoteText && <PageAction label="Save" onClick={addNoteCb} bold />]} />
      <PageBody>
        <div className="notes-page">
          <div className="new-note-container">
            <Editor
              id="new-note-editor"
              className={`text-input ${editing || newNoteText ? 'tall' : ''}`}
              placeholder="What's on you mind?"
              value={newNoteText}
              onChange={newNoteTextChanged}
              onFocus={editorFocusCb}
              onBlur={editorBlurCb}
            />
          </div>
          <Notes />
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

  return (
    <pre className="note" onMouseDown={mouseDownCb} onClick={clickCb}>
      {text}
    </pre>
  );
});

async function addNote(text: string): Promise<void> {
  try {
    document.getElementById('new-note-editor')!.focus();
    if (!text) return;

    const newNote: t.Note = {
      id: uuid(),
      text,
      creation_date: new Date().toISOString(),
      modification_date: new Date().toISOString(),
      order: Date.now(),
      deleted: 0,
      archived: 0,
      pinned: 0,
    };
    await storage.saveNote(newNote);
    actions.updateNotes();
    storage.sync();
  } catch (error) {
    actions.gotError(error as Error);
  }
}

export default NotesPage;
