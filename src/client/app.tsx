import React, { useCallback, useState, useEffect } from 'react';

type Note = {
  id: string;
  text: string;
};

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const [online, setOnline] = useState(navigator.onLine);

  const updateNotes = useCallback(async () => {
    try {
      const res = await fetch('/api/notes');
      setNotes(await res.json());
    } catch (error) {
      console.error(error);
      setErrorMsg((error as Error).message);
    }
  }, []);

  const add = useCallback(async () => {
    try {
      const id = String(Math.random()).substring(2);
      const newNotes = [{ id, text: `This is the ${notes.length}. note.` }];
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNotes),
      });
      updateNotes();
    } catch (error) {
      console.error(error);
      setErrorMsg((error as Error).message);
    }
  }, [notes]);

  useEffect(() => {
    window.addEventListener('offline', () => setOnline(false));
    window.addEventListener('online', () => setOnline(true));
  }, []);

  useEffect(() => {
    updateNotes();
  }, []);

  return (
    <>
      <img src="/barefront.svg" />
      <h1>Unforget!</h1>
      {errorMsg && <p>Error: {errorMsg}</p>}
      {notes.map(note => (
        <p>{note.text}</p>
      ))}
      <h2>status: {online ? 'online' : 'offline'}</h2>
      <button onClick={add}>Add</button>
    </>
  );
}
