import React, { useCallback, useState, useEffect } from 'react';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import PageTemplate from './PageTemplate.jsx';
import Editor from './Editor.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';

type NotesPageProps = {};

function NotesPage(props: NotesPageProps) {
  const [newNoteText, setNewNoteText] = useState('');

  // Update notes on mount.
  useEffect(() => {
    actions.updateNotes();
  }, []);

  const addNoteCb = useCallback(() => addNote(newNoteText).then(() => setNewNoteText('')), [newNoteText]);

  const newNoteTextChanged = useCallback((text: string) => {
    setNewNoteText(text);
  }, []);

  // Sync storage on mount and every N seconds.
  util.useInterval(() => storage.sync(), 5000);

  // Update queue count every N seconds.
  util.useInterval(() => actions.updateQueueCount(), 3000);

  return (
    <PageTemplate className="notes-page">
      <div className="new-note-container">
        <Editor
          id="new-note-editor"
          className="text-input"
          placeholder="What's on you mind?"
          value={newNoteText}
          onChange={newNoteTextChanged}
          autoFocus
        />
        <button onClick={addNoteCb}>Add</button>
      </div>
      <Notes />
    </PageTemplate>
  );
}

function Notes() {
  const app = appStore.use();
  return (
    <div className="notes">
      {app.notes.map(note => (
        <Note key={note.id} note={note} />
      ))}
    </div>
  );
}

function Note(props: { note: t.Note }) {
  const clickCb = useCallback((e: React.MouseEvent) => {
    // TODO
    // props.openNote(props.note)
  }, []);

  const ps = (props.note.text || '').split(/\n+/).map((x, i) => <p key={i}>{x}</p>);

  return (
    <div className="note" onClick={clickCb}>
      {ps}
    </div>
  );
}

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
    await storage.addNote(newNote);
    actions.updateNotes();
    storage.sync();
  } catch (error) {
    actions.gotError(error as Error);
  }
}

export default NotesPage;
