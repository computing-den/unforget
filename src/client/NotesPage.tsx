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
              className={`text-input ${editing && newNoteText ? 'tall' : ''}`}
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
  // const ps = (props.note.text || '').split(/\n+/).map((x, i) => <p key={i}>{x}</p>);

  const clickCb = () => navigate(`/n/${props.note.id}`, { state: { fromNotesPage: true } });

  return (
    <pre className="note" onClick={clickCb}>
      {props.note.text}
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
    };
    await storage.saveNote(newNote);
    actions.updateNotes();
    storage.sync();
  } catch (error) {
    actions.gotError(error as Error);
  }
}

export default NotesPage;
