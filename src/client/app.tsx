import React, { useCallback, useState, useEffect } from 'react';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as util from './util.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';

type PageProps = {};

export default function App() {
  const [token, setToken] = useState(getToken());

  if (token) {
    return <NotesPage token={token} setToken={setToken} />;
  } else {
    return <LoginPage setToken={setToken} />;
  }
}

type NotesPageProps = PageProps & { token: string; setToken: (token?: string) => any };

function NotesPage(props: NotesPageProps) {
  const [notes, setNotes] = useState<t.Note[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);

  const updateNotes = useAsyncCallback(async () => setNotes(await storage.getActiveNotes()), setErrorMsg, []);

  const add = useAsyncCallback(
    async () => {
      document.getElementById('new-note-textarea')!.focus();
      if (!newNoteText) return;

      const newNote: t.Note = {
        id: uuid(),
        text: newNoteText,
        creation_date: new Date().toISOString(),
        modification_date: new Date().toISOString(),
        order: Date.now(),
        deleted: 0,
        archived: 0,
      };
      await storage.addNote(newNote);
      updateNotes();
      storage.sync();
      setNewNoteText('');
    },
    setErrorMsg,
    [newNoteText, notes],
  );

  const newNoteTextChanged = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewNoteText(e.target.value);
  }, []);

  // Update notes on mount.
  useEffect(() => {
    updateNotes();
  }, []);

  // Sync storage on mount and every N seconds.
  useEffect(() => {
    storage.sync();
    const interval = setInterval(() => storage.sync(), 5000);
    return () => clearInterval(interval);
  }, []);

  // Update queue count on mount.
  useEffect(() => {
    (async () => {
      setQueueCount(await storage.countQueuedNotes());
    })();
  }, []);

  // Update queue count every N seconds.
  useEffect(() => {
    const interval = setInterval(async () => setQueueCount(await storage.countQueuedNotes()), 3000);
    return () => clearInterval(interval);
  }, []);

  // Listen to storage's sync events and update notes.
  useEffect(() => {
    function syncListener(args: storage.SyncListenerArgs) {
      console.log('syncListener: ', args);
      // Only update error message if syncing has ended because listener is also called
      // when a new sync starts.
      setSyncing(!args.done);
      if (args.done) {
        setErrorMsg(args.error?.message ?? '');
        updateNotes();
      }
    }
    storage.addSyncListener(syncListener);
    return () => storage.removeSyncListener(syncListener);
  }, []);

  useEffect(() => {
    function wentOffline() {
      setOnline(false);
    }
    function wentOnline() {
      setOnline(true);
      storage.sync();
    }
    window.addEventListener('offline', wentOffline);
    window.addEventListener('online', wentOnline);
    return () => {
      window.removeEventListener('offline', wentOffline);
      window.removeEventListener('online', wentOnline);
    };
  }, []);

  return (
    <Template
      className="notes-page"
      errorMsg={errorMsg}
      online={online}
      syncing={syncing}
      queueCount={queueCount}
      token={props.token}
      setToken={props.setToken}
    >
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
          <div className="note" key={note.id}>
            {note.text}
          </div>
        ))}
      </div>
    </Template>
  );
}

type LoginPageProps = PageProps & { setToken: (token: string) => any };

function LoginPage(props: LoginPageProps) {
  const [errorMsg, setErrorMsg] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const usernameChanged = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value), []);
  const passwordChanged = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value), []);

  const login = useAsyncCallback(
    async () => {
      const credentials: t.Credentials = { username, password };
      const user: t.LocalUser = await util.postApi('/api/login', credentials);
      props.setToken(user.token);
    },
    setErrorMsg,
    [username, password],
  );
  const signup = useAsyncCallback(
    async () => {
      const credentials: t.Credentials = { username, password };
      const user: t.LocalUser = await util.postApi('/api/signup', credentials);
      props.setToken(user.token);
    },
    setErrorMsg,
    [username, password],
  );

  return (
    <Template className="login-page" errorMsg={errorMsg}>
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
  token?: string;
  errorMsg?: string;
  online?: boolean;
  syncing?: boolean;
  queueCount?: number;
  children: React.ReactNode;
  className?: string;
  setToken?: (token?: string) => any;
};

function Template(props: TemplateProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(!menuOpen);
    },
    [menuOpen],
  );
  const logout = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    storage.clearAll();
    document.cookie = 'unforget_token=';
    props.setToken?.();
  }, []);

  const sync = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    storage.sync();
  }, []);

  return (
    <div className={props.className}>
      <div className="header">
        <div className="content">
          <div className="title">
            <div className="logo">
              <img src="/barefront.svg" />
            </div>
            <h1>Unforget</h1>
            <div className="status">
              {props.online !== undefined && (props.online ? 'online' : 'offline')}
              {/*props.syncing && ' syncing'*/}
              {props.queueCount !== undefined && props.queueCount > 0 && ` (${props.queueCount})`}
            </div>
          </div>
          <div className="menu-button-container">
            <div className="menu-button">
              <a href="#" onClick={openMenu}>
                <img src="/icons/menu.svg" />
              </a>
              {menuOpen && (
                <div className="menu">
                  <ul>
                    <li>
                      <a href="#" onClick={logout}>
                        Log out
                      </a>
                    </li>
                    <li>
                      <a href="#" onClick={sync}>
                        Sync
                      </a>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
        {props.errorMsg && (
          <div className="app-error">
            <p>Error: {props.errorMsg}</p>
          </div>
        )}
      </div>
      <div className="body">{props.children}</div>
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
