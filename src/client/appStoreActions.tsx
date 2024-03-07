import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import _ from 'lodash';

export function initAppStore() {
  appStore.set({
    menuOpen: false,
    notes: [],
    online: navigator.onLine,
    queueCount: 0,
    syncing: false,
    user: util.getUserFromCookie(),
  });
}

export async function updateNotes() {
  try {
    const notes = await storage.getActiveNotes();
    appStore.update(app => {
      app.notes = notes;
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
  storage.clearAll();
  util.resetUserCookies();
  initAppStore();
}

export function gotError(error: Error) {
  console.error(error);
  appStore.update(app => {
    app.errorMsg = error.message;
  });
  if (error.message) util.postApi('/api/got-error', { message: error.message });
}
