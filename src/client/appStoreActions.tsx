import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import { bytesToHexString } from '../common/util.jsx';
import _ from 'lodash';

export async function initAppStore() {
  let [showArchive, hidePinnedNotes, user] = await Promise.all([
    storage.getSetting('showArchive').then(Boolean),
    storage.getSetting('hidePinnedNotes').then(Boolean),
    storage.getSetting<t.ClientLocalUser>('user'),
  ]);

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
    requirePageRefresh: false,
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
      password_client_hash: await util.calcClientPasswordHash(credentials),
    };
    const loginResponse: t.LoginResponse = await util.postApi('/api/login', loginData);
    await loggedIn(credentials, loginResponse);
  } catch (error) {
    gotError(error as Error);
  }
}

export async function signup(credentials: t.UsernamePassword) {
  try {
    const signupData: t.SignupData = {
      username: credentials.username,
      password_client_hash: await util.calcClientPasswordHash(credentials),
      encryption_salt: bytesToHexString(util.generateEncryptionSalt()),
    };
    const loginResponse: t.LoginResponse = await util.postApi('/api/signup', signupData);

    // We want the client to pick the encryption salt to make sure it really is random and secure.
    if (loginResponse.encryption_salt !== signupData.encryption_salt) {
      util.resetUserCookies();
      throw new Error('Server might be compromised. The encryption parameters were tampered with.');
    }

    await loggedIn(credentials, loginResponse);
  } catch (error) {
    gotError(error as Error);
  }
}

export async function logout() {
  try {
    const { user } = appStore.get();
    if (!user) return;

    await storage.clearAll();
    util.resetUserCookies();
    initAppStore();

    // Send user instead of using cookies because by the time the request is sent, the cookie has already been cleared.
    util.postApi('/api/logout', { token: user.token }).catch(console.error);
  } catch (error) {
    gotError(error as Error);
  }
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

async function makeClientLocalUserFromServer(
  credentials: t.UsernamePassword,
  loginResponse: t.LoginResponse,
): Promise<t.ClientLocalUser> {
  return {
    username: loginResponse.username,
    token: loginResponse.token,
    encryptionKey: await util.makeEncryptionKey(credentials.password, loginResponse.encryption_salt),
  };
}

async function loggedIn(credentials: t.UsernamePassword, loginResponse: t.LoginResponse) {
  const user = await makeClientLocalUserFromServer(credentials, loginResponse);
  await storage.setSetting(user, 'user');
  appStore.update(app => {
    app.user = user;
  });
  storage.sync();
}

export async function checkAppUpdate() {
  try {
    if (!appStore.get().online) return;

    const updateInterval = process.env.NODE_ENV === 'development' ? 5 * 1000 : 24 * 3600 * 1000;
    const lastCheck = await storage.getSetting<string>('lastAppUpdateCheck');
    if (!lastCheck || new Date(lastCheck).valueOf() < Date.now() - updateInterval) {
      util.postMessageToServiceWorker({ command: 'update' });
      await storage.setSetting(new Date().toISOString(), 'lastAppUpdateCheck');
    }
  } catch (error) {
    console.error(error);
  }
}
