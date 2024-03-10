import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import _ from 'lodash';

export async function initAppStore() {
  appStore.set({
    hidePinnedNotes: await storage.getHidePinnedNotes(),
    menuOpen: false,
    notes: [],
    notePages: 1,
    notePageSize: 100,
    allNotePagesLoaded: false,
    online: navigator.onLine,
    queueCount: 0,
    syncing: false,
    user: util.getUserFromCookie(),
  });
}

export async function updateNotes() {
  try {
    const { notePages, notePageSize, hidePinnedNotes } = appStore.get();
    const { done, notes } = await storage.getNotes({ limit: notePageSize * notePages, hidePinnedNotes });
    appStore.update(app => {
      app.notes = notes;
      app.allNotePagesLoaded = done;
    });
  } catch (error) {
    gotError(error as Error);
  }
}

export async function updateQueueCount() {
  try {
    const queueCount = await storage.countQueuedNotes();
    appStore.update(app => {
      app.queueCount = queueCount;
    });
  } catch (error) {
    gotError(error as Error);
  }
}

export async function login(credentials: t.Credentials) {
  try {
    const user: t.LocalUser = await util.postApi('/api/login', credentials);
    appStore.update(app => {
      app.user = user;
    });
    storage.sync();
  } catch (error) {
    gotError(error as Error);
  }
}

export async function signup(credentials: t.Credentials) {
  try {
    const user: t.LocalUser = await util.postApi('/api/signup', credentials);
    appStore.update(app => {
      app.user = user;
    });
    storage.sync();
  } catch (error) {
    gotError(error as Error);
  }
}

export function logout() {
  const { user } = appStore.get();
  if (!user) return;

  // Send user instead of using cookies because by the time the request is sent, the cookie has already been cleared.
  util.postApi('/api/logout', user);
  storage.clearAll();
  util.resetUserCookies();
  initAppStore();
}

export function gotError(error: Error) {
  console.error(error);
  showMessage(error.message, { type: 'error', hideAfterTimeout: true });
  if (error.message) util.postApi('/api/got-error', { message: error.message });
}

export function showMessage(text: string, opts?: { type?: 'info' | 'error'; hideAfterTimeout?: boolean }) {
  const timestamp = Date.now();
  appStore.update(app => {
    app.message = { text, type: opts?.type || 'info', timestamp };
  });
  if (opts?.hideAfterTimeout) {
    setTimeout(() => {
      if (appStore.get().message?.timestamp === timestamp) {
        appStore.update(app => {
          app.message = undefined;
        });
      }
    }, 2000);
  }
}

export async function saveNote(note: t.Note, messageText?: string) {
  try {
    await storage.saveNote(note);
    if (messageText) showMessage(messageText, { type: 'info', hideAfterTimeout: true });
    updateNotes();
    storage.sync();
  } catch (error) {
    gotError(error as Error);
  }
}
