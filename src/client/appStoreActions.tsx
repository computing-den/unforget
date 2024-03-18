import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as cutil from '../common/util.jsx';
import _ from 'lodash';

export async function initAppStore() {
  let [showArchive, hidePinnedNotes, user] = await Promise.all([
    storage.getSetting('showArchive').then(Boolean),
    storage.getSetting('hidePinnedNotes').then(Boolean),
    storage.getSetting<t.LocalUser>('user'),
  ]);

  // Just in case make sure that the token and user from storage are in sync.
  // Mostly, useful during development if we manually delete one but not the other.
  const tokenFromCookie = util.getUserTokenFromCookie();
  if (!tokenFromCookie || !user || user.token !== tokenFromCookie) {
    user = undefined;
    storage.clearAll();
    util.resetUserCookies();
  }

  appStore.set({
    showArchive,
    hidePinnedNotes,
    notes: [],
    notesLastModificationTimestamp: 0,
    notesLastUpdateTimestamp: -1,
    notePages: 1,
    notePageSize: 50,
    allNotePagesLoaded: false,
    online: navigator.onLine,
    queueCount: 0,
    syncing: false,
    user,
  });
}

export async function updateNotes() {
  try {
    const start = Date.now();
    console.log('updateNotes started');
    const { notePages, notePageSize, hidePinnedNotes, search, showArchive } = appStore.get();
    const { done, notes } = await storage.getNotes({
      limit: notePageSize * notePages,
      hidePinnedNotes,
      search,
      archive: showArchive,
    });
    appStore.update(app => {
      app.notes = notes;
      app.allNotePagesLoaded = done;
      app.notesLastUpdateTimestamp = Date.now();
    });
    console.log(`updateNotes done in ${Date.now() - start}ms`);
  } catch (error) {
    gotError(error as Error);
  }
}

export async function updateNotesIfDirty() {
  const { notesLastUpdateTimestamp, notesLastModificationTimestamp } = appStore.get();
  if (notesLastUpdateTimestamp < notesLastModificationTimestamp) {
    await updateNotes();
  }
}

export const updateNotesDebounced = _.debounce(updateNotes, 300, { leading: false, trailing: true, maxWait: 1000 });

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

export async function login(credentials: t.UsernamePassword) {
  try {
    const loginData: t.LoginData = {
      username: credentials.username,
      passwordClientHash: await util.calcClientPasswordHash(credentials),
    };
    const user: t.LocalUser = await util.postApi('/api/login', loginData);
    await storage.setSetting(user, 'user');
    appStore.update(app => {
      app.user = user;
    });
    storage.sync();
  } catch (error) {
    gotError(error as Error);
  }
}

export async function signup(credentials: t.UsernamePassword) {
  try {
    const signupData: t.SignupData = {
      username: credentials.username,
      passwordClientHash: await util.calcClientPasswordHash(credentials),
      encryptionSalt: cutil.binToHexString(util.generateEncryptionSalt()),
    };
    const user: t.LocalUser = await util.postApi('/api/signup', signupData);

    // We want the client to pick the encryption salt to make sure it really is random and secure.
    if (user.encryptionSalt !== signupData.encryptionSalt) {
      util.resetUserCookies();
      throw new Error('Server might be compromised. The encryption parameters were tampered with.');
    }

    await storage.setSetting(user, 'user');

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
    }, 5000);
  }
}

export async function saveNote(note: t.Note, opts?: { message?: string; immediateSync?: boolean }) {
  try {
    await storage.saveNote(note);
    if (opts?.message) {
      showMessage(opts.message, { type: 'info', hideAfterTimeout: true });
    }
    appStore.update(app => {
      app.notesLastModificationTimestamp = Date.now();
    });
    if (opts?.immediateSync) {
      storage.sync();
    } else {
      storage.syncDebounced();
    }
  } catch (error) {
    gotError(error as Error);
  }
}

export async function saveNoteAndQuickUpdateNotes(note: t.Note) {
  try {
    await storage.saveNote(note);
    appStore.update(app => {
      const i = app.notes.findIndex(x => x.id === note.id);
      if (i !== -1) app.notes[i] = note;
    });
    storage.sync();
  } catch (error) {
    gotError(error as Error);
  }
}
