import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as actions from './appStoreActions.js';
import log from './logger.js';
import { generateEncryptionSalt, calcClientPasswordHash, makeEncryptionKey } from './crypto.js';
import { getUserTokenFromCookie, setUserCookies } from './cookies.js';
import { postToServiceWorker } from './clientToServiceWorkerApi.js';
import * as api from './api.js';
import { bytesToHexString, createNewNote } from '../common/util.jsx';
import _ from 'lodash';
import welcome1 from './notes/welcome1.md';

export async function initAppStore() {
  // let showArchive = false;
  // let hidePinnedNotes = false;
  // let user: t.ClientLocalUser | undefined;

  // if (readFromStorage) {
  const [showArchive, hidePinnedNotes, user] = await Promise.all([
    storage.getSetting('showArchive').then(Boolean),
    storage.getSetting('hidePinnedNotes').then(Boolean),
    storage.getUser(),
  ]);
  // }

  appStore.set({
    showArchive,
    hidePinnedNotes,
    notes: [],
    // notesUpdateRequestTimestamp: 0,
    // notesUpdateTimestamp: -1,
    notePages: 1,
    notePageSize: 50,
    allNotePagesLoaded: false,
    online: navigator.onLine,
    queueCount: 0,
    syncing: false,
    updatingNotes: false,
    user,
    requirePageRefresh: false,
  });

  await updateNotes();
}

export async function setUpDemo() {
  const encryption_salt = bytesToHexString(generateEncryptionSalt());
  await loggedIn({ username: 'demo', password: 'demo' }, { username: 'demo', token: 'demo', encryption_salt });

  const notes: t.Note[] = [createNewNote(welcome1)];
  for (const note of notes) await saveNote(note);
  await updateNotes();
}

export async function updateNotes() {
  try {
    const start = Date.now();
    log('updateNotes started');
    const { notePages, notePageSize, hidePinnedNotes, search, showArchive } = appStore.get();
    // const notesUpdateTimestamp = Date.now();
    appStore.update(app => {
      app.updatingNotes = true;
    });
    const { done, notes } = await storage.getNotes({
      limit: notePageSize * notePages,
      hidePinnedNotes,
      search,
      archive: showArchive,
    });
    appStore.update(app => {
      app.notes = notes;
      app.allNotePagesLoaded = done;
      // app.notesUpdateTimestamp = notesUpdateTimestamp;
    });
    log(`updateNotes done in ${Date.now() - start}ms`);
  } catch (error) {
    gotError(error as Error);
  } finally {
    appStore.update(app => {
      app.updatingNotes = false;
    });
  }
}

export function reduceNotePages(lastItemIndex: number) {
  log(`trying to reduce note pages lastItemIndex: ${lastItemIndex}`);
  const { notePages, notePageSize } = appStore.get();
  const newNotePages = Math.floor((lastItemIndex + 1 + (notePageSize - 1)) / notePageSize);
  if (newNotePages < notePages) {
    log(`reducing note pages from ${notePages} to ${newNotePages}`);
    appStore.update(app => {
      app.notes = app.notes.slice(0, newNotePages * notePageSize);
      app.notePages = newNotePages;
    });
  }
}

// export async function updateNotesIfDirty() {
//   const { notesUpdateTimestamp, notesUpdateRequestTimestamp } = appStore.get();
//   if (notesUpdateTimestamp < notesUpdateRequestTimestamp) {
//     await updateNotes();
//   }
// }

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

export async function login(credentials: t.UsernamePassword, opts?: { importDemoNotes?: boolean }) {
  try {
    const loginData: t.LoginData = {
      username: credentials.username,
      password_client_hash: await calcClientPasswordHash(credentials),
    };
    const loginResponse: t.LoginResponse = await api.post('/api/login', loginData);
    await loggedIn(credentials, loginResponse, opts);
  } catch (error) {
    gotError(error as Error);
  }
}

export async function signup(credentials: t.UsernamePassword, opts?: { importDemoNotes?: boolean }) {
  try {
    const signupData: t.SignupData = {
      username: credentials.username,
      password_client_hash: await calcClientPasswordHash(credentials),
      encryption_salt: bytesToHexString(generateEncryptionSalt()),
    };
    const loginResponse: t.LoginResponse = await api.post('/api/signup', signupData);

    // We want the client to pick the encryption salt to make sure it really is random and secure.
    if (loginResponse.encryption_salt !== signupData.encryption_salt) {
      await resetUser();
      throw new Error('Server might be compromised. The encryption parameters were tampered with.');
    }

    await loggedIn(credentials, loginResponse, opts);
  } catch (error) {
    gotError(error as Error);
  }
}

export async function logout() {
  try {
    const { user } = appStore.get();
    if (!user) return;

    // Calling a history API here may not work due to the timing.
    // It may still redirect to /login witht a from=XXX search param.
    // window.history.replaceState(null, '', '/');

    await resetUser();
    await storage.clearAll();
    await initAppStore();

    // Tell other tabs/windows that we just logged out.
    postToServiceWorker({ command: 'tellOthersToRefreshPage' });

    // Send token as param instead of relying on cookies because by the time the request is sent,
    // the cookie has already been cleared.
    api.post('/api/logout', null, { token: user.token }).catch(log.error);
  } catch (error) {
    gotError(error as Error);
  }
}

export async function clearStorage() {
  try {
    await storage.clearAll();
    await initAppStore();
  } catch (error) {
    gotError(error as Error);
  }
}

export function gotError(error: Error) {
  log.error(error);
  showMessage(error.message, { type: 'error' });
}

export function showMessage(text: string, opts?: { type?: 'info' | 'error' }) {
  const timestamp = Date.now();
  appStore.update(app => {
    app.message = { text, type: opts?.type || 'info', timestamp };
  });
  setTimeout(() => {
    if (appStore.get().message?.timestamp === timestamp) {
      appStore.update(app => {
        app.message = undefined;
      });
    }
  }, 5000);
}

export async function saveNote(note: t.Note, opts?: { message?: string; immediateSync?: boolean }) {
  await saveNotes([note], opts);
}

export async function saveNotes(notes: t.Note[], opts?: { message?: string; immediateSync?: boolean }) {
  try {
    await storage.saveNotes(notes);
    if (opts?.message) {
      showMessage(opts.message, { type: 'info' });
    }
    // appStore.update(app => {
    //   app.notesUpdateRequestTimestamp = Date.now();
    // });
    postToServiceWorker({ command: 'sync', debounced: !opts?.immediateSync });
    postToServiceWorker({ command: 'tellOthersNotesInStorageChanged' });
  } catch (error) {
    gotError(error as Error);
  }
}

// export async function clearNotes() {
//   await storage.clearNotes();
//   appStore.update(app => {
//     app.notes = [];
//     app.notesUpdateRequestTimestamp = Date.now();
//   });
// }

export async function saveNoteAndQuickUpdateNotes(note: t.Note) {
  try {
    await storage.saveNote(note);
    appStore.update(app => {
      const i = app.notes.findIndex(x => x.id === note.id);
      if (i !== -1) app.notes[i] = note;
    });
    postToServiceWorker({ command: 'sync' });
    postToServiceWorker({ command: 'tellOthersNotesInStorageChanged' });
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
    encryptionKey: await makeEncryptionKey(credentials.password, loginResponse.encryption_salt),
  };
}

/**
 * Mostly, useful during development if we manually delete one but not the other.
 * Just in case make sure that the token and the user in appStore are in sync.
 */
export async function makeSureConsistentUserAndCookie() {
  const tokenFromCookie = getUserTokenFromCookie();
  const { user } = appStore.get();
  const consistent = Boolean(user && tokenFromCookie && user.token === tokenFromCookie);
  if (!consistent) await actions.resetUser();
}

export async function resetUser() {
  setUserCookies('');
  await storage.clearUser();
  appStore.update(app => {
    app.user = undefined;
  });
}

async function loggedIn(
  credentials: t.UsernamePassword,
  loginResponse: t.LoginResponse,
  opts?: { importDemoNotes?: boolean },
) {
  const user = await makeClientLocalUserFromServer(credentials, loginResponse);
  if (!opts?.importDemoNotes) {
    await clearStorage();
  }
  setUserCookies(loginResponse.token); // Needed for the demo user.
  await storage.setUser(user);
  appStore.update(app => {
    app.user = user;
  });
  postToServiceWorker({ command: 'sync' });
  postToServiceWorker({ command: 'tellOthersToRefreshPage' });
}

export async function checkAppUpdate() {
  try {
    if (!appStore.get().online) return;

    const updateInterval = process.env.NODE_ENV === 'development' ? 10 * 1000 : 24 * 3600 * 1000;
    const lastCheck = await storage.getSetting<string>('lastAppUpdateCheck');
    if (!lastCheck || new Date(lastCheck).valueOf() < Date.now() - updateInterval) {
      await checkAppUpdateHelper();
    }
  } catch (error) {
    gotError(error as Error);
  }
}

export async function forceCheckAppUpdate() {
  try {
    await checkAppUpdateHelper();
  } catch (error) {
    gotError(error as Error);
  }
}

async function checkAppUpdateHelper() {
  postToServiceWorker({ command: 'update' });
  await storage.setSetting(new Date().toISOString(), 'lastAppUpdateCheck');
}

export async function requireAppUpdate() {
  appStore.update(app => {
    app.message = undefined;
    app.requirePageRefresh = true;
  });
}

export async function updateApp() {
  try {
    await storage.setSetting(true, 'updatingApp');
    window.location.reload();
  } catch (error) {
    gotError(error as Error);
  }
}

export async function notifyIfAppUpdated() {
  try {
    const updatingApp = await storage.getSetting('updatingApp');
    if (updatingApp) {
      showMessage('App updated (details in the about page)');
      await storage.setSetting(false, 'updatingApp');
    }
  } catch (error) {
    gotError(error as Error);
  }
}
