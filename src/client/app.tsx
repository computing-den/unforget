import React, { useCallback, useState, useEffect } from 'react';
import type { Note } from '../common/types.js';
import * as storage from './storage.js';
import _ from 'lodash';

type PageProps = { online: boolean };

export default function App() {
  const [token, setToken] = useState(getToken());
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    window.addEventListener('offline', () => setOnline(false));
    window.addEventListener('online', () => setOnline(true));
  }, []);

  const loggedIn = useCallback((token: string) => setToken(token), []);

  if (token) {
    return <NotesPage online={online} token={token} />;
  } else {
    return <LoginPage online={online} onLoggedIn={loggedIn} />;
  }
}

type NotesPageProps = PageProps & { token: string };

function NotesPage(props: NotesPageProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [dirty, setDirty] = useState(false);

  const syncImmediately = useAsyncCallback(
    async () => {
      const newNotes = await storage.sync();
      if (newNotes.length > 0) await updateNotes();
    },
    setErrorMsg,
    [],
  );

  // const sync = useCallback(async () => {
  //   setTimeout
  // }, []);

  const updateNotes = useAsyncCallback(async () => setNotes(await storage.getAllNotes()), setErrorMsg, []);

  const add = useAsyncCallback(
    async () => {
      document.getElementById('new-note-textarea')!.focus();
      if (!newNoteText) return;

      const id = String(Math.random()).substring(2);
      const newNote: Note = {
        id,
        text: newNoteText,
        creation_date: new Date().toISOString(),
        modification_date: new Date().toISOString(),
        order: Date.now(),
      };
      await storage.addNote(newNote);
      setNewNoteText('');
      await syncImmediately(); // TODO do it in the background.
      await updateNotes();
    },
    setErrorMsg,
    [newNoteText, notes],
  );

  const newNoteTextChanged = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewNoteText(e.target.value);
  }, []);

  useEffect(() => {
    (async () => {
      await updateNotes();
      await syncImmediately();
    })();
  }, []);

  return (
    <Template className="notes-page" errorMsg={errorMsg} online={props.online} dirty={dirty}>
      <div className="new-note-container">
        <textarea
          id="new-note-textarea"
          className="text-input"
          placeholder="Write your note ..."
          value={newNoteText}
          onChange={newNoteTextChanged}
          rows={5}
          autoFocus
        />
        <button onClick={add}>Add</button>
      </div>
      <div className="notes">
        {notes.map(note => (
          <div className="note">{note.text}</div>
        ))}
      </div>
    </Template>
  );
}

type LoginPageProps = PageProps & { onLoggedIn: (token: string) => any };

function LoginPage(props: LoginPageProps) {
  const [errorMsg, setErrorMsg] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const usernameChanged = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value), []);
  const passwordChanged = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value), []);

  const login = useAsyncCallback(
    async () => {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw await createFetchResponseError(res);
      props.onLoggedIn((await res.json()).token);
    },
    setErrorMsg,
    [username, password],
  );
  const signup = useAsyncCallback(
    async () => {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw await createFetchResponseError(res);
      props.onLoggedIn((await res.json()).token);
    },
    setErrorMsg,
    [username, password],
  );

  return (
    <Template className="login-page" errorMsg={errorMsg} online={props.online}>
      <div className="form-element">
        <label htmlFor="username">Username</label>
        <input
          className="text-input"
          type="text"
          name="username"
          required
          minLength={4}
          maxLength={50}
          onChange={usernameChanged}
        />
      </div>
      <div className="form-element">
        <label htmlFor="password">Password</label>
        <input
          className="text-input"
          type="password"
          name="password"
          required
          minLength={8}
          maxLength={100}
          onChange={passwordChanged}
        />
      </div>
      <div className="buttons">
        <button className="login" onClick={login}>
          Log in
        </button>
        <button className="signup" onClick={signup}>
          Sign up
        </button>
      </div>
    </Template>
  );
}

type TemplateProps = {
  errorMsg?: string;
  online: boolean;
  dirty?: boolean;
  children: React.ReactNode;
  className?: string;
};

function Template(props: TemplateProps) {
  return (
    <div className={props.className}>
      <div className="header">
        <img src="/barefront.svg" />
        <h1>Unforget!</h1>
      </div>
      <div className="body">{props.children}</div>
      <div className="app-status">
        status: {props.online ? 'online' : 'offline'}
        {props.dirty === undefined ? '' : props.dirty ? ' - dirty' : ' - synced'}
      </div>
      <div className="app-error">{props.errorMsg && <p>Error: {props.errorMsg}</p>}</div>
    </div>
  );
}

function getCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith(name + '='))
    ?.split('=')[1];
}

function getToken(): string | undefined {
  return getCookie('unforget_token');
}

async function createFetchResponseError(res: Response): Promise<Error> {
  if (
    res.headers
      .get('Content-Type')
      ?.split(/\s*;\s*/g)
      .includes('application/json')
  ) {
    return new Error((await res.json()).message);
  } else {
    return new Error(await res.text());
  }
}

function useAsyncCallback(
  fn: () => Promise<void>,
  setErrorMsg: (errorMsg: string) => void,
  deps: any[],
): () => Promise<void> {
  return useCallback(async () => {
    try {
      await fn();
    } catch (error) {
      console.error(error);
      setErrorMsg((error as Error)?.message || 'unknown error');
    }
  }, deps);
}
