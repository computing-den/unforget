import type * as t from '../common/types.js';
import * as cutil from '../common/util.jsx';
import * as util from './util.jsx';
import * as appStore from './appStore.jsx';
import { v4 as uuid } from 'uuid';
import _ from 'lodash';

let _db: IDBDatabase | undefined;

export const DB_NAME = 'unforget';
export const NOTES_STORE = 'notes';
export const NOTES_STORE_ORDER_INDEX = 'orderIndex';
export const NOTES_QUEUE_STORE = 'notesQueue';
export const SETTINGS_STORE = 'settings';

export type SyncListenerArgs = { done: false } | { done: true; error?: Error; mergeCount: number };

export type SyncListener = (args: SyncListenerArgs) => any;

type SaveNoteQueueItem = { note: t.Note; resolve: () => void; reject: (error: Error) => any };

const syncListeners: SyncListener[] = [];
export let syncing = false;
let shouldSyncAgain = false;
let fullSyncRequired = false;
let saveNoteQueue: SaveNoteQueueItem[] = [];
let saveNoteQueueActive: boolean = false;

export async function getStorage(): Promise<IDBDatabase> {
  _db ??= await new Promise<IDBDatabase>((resolve, reject) => {
    console.log('setting up storage');
    const dbOpenReq = indexedDB.open(DB_NAME, 53);

    dbOpenReq.onerror = () => {
      reject(dbOpenReq.error);
    };

    dbOpenReq.onupgradeneeded = e => {
      if (e.oldVersion < 52) {
        // By comparing e.oldVersion with e.newVersion, we can perform only the actions needed for the upgrade.
        const notesStore = dbOpenReq.result.createObjectStore(NOTES_STORE, { keyPath: 'id' });
        notesStore.createIndex(NOTES_STORE_ORDER_INDEX, ['order']);
        dbOpenReq.result.createObjectStore(NOTES_QUEUE_STORE, { keyPath: 'id' });
        dbOpenReq.result.createObjectStore(SETTINGS_STORE);
      }
      if (e.oldVersion < 53) {
        const notesStore = dbOpenReq.transaction!.objectStore(NOTES_STORE);
        notesStore.deleteIndex(NOTES_STORE_ORDER_INDEX);
        notesStore.createIndex(NOTES_STORE_ORDER_INDEX, ['not_archived', 'not_deleted', 'pinned', 'order']);
      }
    };

    dbOpenReq.onsuccess = () => {
      resolve(dbOpenReq.result);
    };
  });

  return _db;
}

export async function transaction<T>(
  storeNames: string | Iterable<string>,
  mode: IDBTransactionMode,
  callback: (tx: IDBTransaction) => T,
): Promise<T> {
  const db = await getStorage();
  return new Promise<T>(async (resolve, reject) => {
    let tx: IDBTransaction | undefined;
    try {
      tx = db.transaction(storeNames, mode);
      let res: T;
      tx.oncomplete = () => {
        // console.log('transaction succeeded');
        resolve(res);
      };
      tx.onerror = () => {
        console.log('transaction error', tx!.error);
        reject(tx!.error);
      };
      res = await callback(tx);
    } catch (error) {
      try {
        tx?.abort();
      } catch (error2) {
        console.error('transaction abort() failed', error2);
      } finally {
        reject(error);
      }
    }
  });
}

export async function saveNote(note: t.Note) {
  return new Promise<void>((resolve, reject) => {
    saveNoteQueue.unshift({ note, resolve, reject });
    if (!saveNoteQueueActive) saveNextNoteInQueue();
  });
}

async function saveNextNoteInQueue() {
  const item = saveNoteQueue.pop();
  saveNoteQueueActive = Boolean(item);
  if (!item) return;

  try {
    await saveNoteQueueItem(item);
    console.log('saved note ', item.note.text);
    item.resolve();
  } catch (error) {
    item.reject(error as Error);
  } finally {
    saveNextNoteInQueue();
  }
}

async function saveNoteQueueItem(item: SaveNoteQueueItem) {
  await transaction([NOTES_STORE, NOTES_QUEUE_STORE], 'readwrite', tx => {
    tx.objectStore(NOTES_STORE).put(item.note);
    const noteHead: t.NoteHead = { id: item.note.id, modification_date: item.note.modification_date };
    tx.objectStore(NOTES_QUEUE_STORE).put(noteHead);
  });
}

export function isSavingNote(): boolean {
  return saveNoteQueueActive;
}

// export async function getAllNotes(): Promise<t.Note[]> {
//   const req = await transaction(
//     NOTES_STORE,
//     'readonly',
//     tx => tx.objectStore(NOTES_STORE).index(NOTES_STORE_ORDER_INDEX).getAll() as IDBRequest<t.Note[]>,
//   );
//   return req.result;
// }

export async function getNotes(opts?: {
  limit?: number;
  archive?: boolean;
  hidePinnedNotes?: boolean;
  search?: string;
}): Promise<{ done: boolean; notes: t.Note[] }> {
  const notes: t.Note[] = [];
  const limit = opts?.limit;
  let done = false;

  let regexps: RegExp[] | undefined;
  if (opts?.search) {
    const words = opts.search.split(/\s+/g).map(cutil.escapeRegExp);
    regexps = words.map(word => new RegExp(word, 'i'));
  }

  await transaction([NOTES_STORE], 'readonly', async tx => {
    return new Promise<void>((resolve, reject) => {
      const orderIndex = tx.objectStore(NOTES_STORE).index(NOTES_STORE_ORDER_INDEX);
      const orderCursorReq = orderIndex.openCursor(null, 'prev');
      orderCursorReq.onerror = () => {
        reject(orderCursorReq.error);
      };
      orderCursorReq.onsuccess = () => {
        const start = Date.now();
        const cursor = orderCursorReq.result;
        if (!cursor) {
          done = true;
          resolve();
        } else if (limit !== undefined && notes.length >= limit) {
          resolve();
        } else {
          const note = cursor.value as t.Note;
          if (!note.not_archived && !opts?.archive) {
            // If archived notes were not requested and we hit an archive note, we're done.
            done = true;
            resolve();
          } else if (note.not_archived && opts?.archive) {
            cursor.continue();
          } else if (note.pinned && opts?.hidePinnedNotes) {
            cursor.continue();
          } else if (regexps && !regexps.every(regexp => regexp.test(note.text ?? ''))) {
            console.log(`matched regexps in ${Date.now() - start}ms`);
            cursor.continue();
          } else {
            notes.push(note);
            cursor.continue();
          }
        }
      };
    });
  });

  return { notes, done };
}

export async function getNote(id: string): Promise<t.Note | undefined> {
  const req = await transaction(
    NOTES_STORE,
    'readonly',
    tx => tx.objectStore(NOTES_STORE).get(id) as IDBRequest<t.Note | undefined>,
  );
  return req.result;
}

export async function getPartialSyncData(): Promise<t.SyncData> {
  const user = appStore.get().user;
  if (!user) throw new Error('Sign in to sync.');

  const res = await transaction([NOTES_STORE, NOTES_QUEUE_STORE, SETTINGS_STORE], 'readonly', async tx => {
    const items = await waitForDBRequest(tx.objectStore(NOTES_QUEUE_STORE).getAll() as IDBRequest<t.NoteHead[]>);
    const notesReqs = items.map(item => tx.objectStore(NOTES_STORE).get(item.id) as IDBRequest<t.Note>);
    const syncNumberReq = tx.objectStore(SETTINGS_STORE).get('syncNumber') as IDBRequest<number | undefined>;
    return { notesReqs, syncNumberReq };
  });
  const notes = await util.encryptNotes(
    res.notesReqs.map(req => req.result),
    user.encryptionKey,
  );
  return { notes, syncNumber: res.syncNumberReq.result ?? 0 };
}

export async function getFullSyncData(): Promise<t.SyncData> {
  const user = appStore.get().user;
  if (!user) throw new Error('Sign in to sync.');

  const res = await transaction([NOTES_STORE, SETTINGS_STORE], 'readonly', async tx => {
    const notesReqs = tx.objectStore(NOTES_STORE).getAll() as IDBRequest<t.Note[]>;
    const syncNumberReq = tx.objectStore(SETTINGS_STORE).get('syncNumber') as IDBRequest<number | undefined>;
    return { notesReqs, syncNumberReq };
  });
  const notes = await util.encryptNotes(res.notesReqs.result, user.encryptionKey);
  return { notes, syncNumber: res.syncNumberReq.result ?? 0 };
}

export async function getSyncNumber(): Promise<number> {
  const res = await transaction([SETTINGS_STORE], 'readonly', async tx => {
    return tx.objectStore(SETTINGS_STORE).get('syncNumber') as IDBRequest<number | undefined>;
  });
  return res.result ?? 0;
}

export async function sync() {
  // Skip if user not logged in.
  if (!appStore.get().user) return;

  if (syncing) {
    console.log('sync deferred: already running.');

    shouldSyncAgain = true;
    return;
  }

  console.log('sync started.');
  shouldSyncAgain = false;
  syncing = true;

  callSyncListeners({ done: false });

  let error: Error | undefined;
  let mergeCount = 0;
  const start = Date.now();
  try {
    // Do a full sync when syncNumber is 0 (first sync).
    if (!fullSyncRequired && (await getSyncNumber()) === 0) {
      fullSyncRequired = true;
    }

    // Partial sync. Server will either send partial sync data or request a full sync.
    if (!fullSyncRequired) {
      const partialSyncReq: t.PartialSyncReq = await getPartialSyncData();
      const partialSyncRes: t.PartialSyncRes = await util.postApi('/api/partial-sync', partialSyncReq);
      // Server already checks if sync numbers are the same. But just to be sure we do it here too.
      if (partialSyncRes.type === 'ok' && partialSyncReq.syncNumber === partialSyncRes.syncNumber) {
        mergeCount = await mergeSyncData(partialSyncReq, partialSyncRes);
      } else {
        fullSyncRequired = true;
      }
    }

    // Full sync.
    if (fullSyncRequired) {
      const fullSyncReq: t.FullSyncReq = await getFullSyncData();
      const fullSyncRes: t.FullSyncRes = await util.postApi('/api/full-sync', fullSyncReq);
      mergeCount = await mergeSyncData(fullSyncReq, fullSyncRes);
      fullSyncRequired = false;
    }
  } catch (err) {
    console.error(err);
    error = err as Error;
  }

  const message = `sync ended${error ? ' with error' : ''} in ${Date.now() - start}ms`;
  console.log(message);
  if (mergeCount > 0) util.postApi('/api/log', { message });

  syncing = false;
  callSyncListeners({ done: true, error, mergeCount });

  if (shouldSyncAgain) setTimeout(sync, 1000);
}

export async function fullSync() {
  fullSyncRequired = true;
  return sync();
}

export const syncDebounced = _.debounce(sync, 500, { leading: false, trailing: true, maxWait: 3000 });

export async function clearAll() {
  const db = await getStorage();
  const storeNames = Array.from(db.objectStoreNames);
  await transaction(storeNames, 'readwrite', tx => {
    for (const name of storeNames) tx.objectStore(name).clear();
  });
}

export function addSyncListener(listener: SyncListener) {
  syncListeners.push(listener);
}

export function removeSyncListener(listener: SyncListener) {
  const index = syncListeners.indexOf(listener);
  if (index != -1) syncListeners.splice(index, 1);
}

async function waitForDBRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onerror = () => {
      reject(req.error);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
  });
}

function callSyncListeners(args: SyncListenerArgs) {
  for (const listener of syncListeners) {
    try {
      listener(args);
    } catch (error2) {
      console.error(error2);
    }
  }
}

async function mergeSyncData(reqSyncData: t.SyncData, resSyncData: t.SyncData): Promise<number> {
  const user = appStore.get().user;
  if (!user) throw new Error('Sign in to sync.');

  // Doing this one-by-one inside the transaction can cause the transaction to finish prematurely. I don't know why.
  const receivedNotes = await util.decryptNotes(resSyncData.notes, user.encryptionKey);

  return transaction([NOTES_STORE, NOTES_QUEUE_STORE, SETTINGS_STORE], 'readwrite', async tx => {
    let mergeCount = 0;
    const notesStore = tx.objectStore(NOTES_STORE);

    // Replace local notes with received notes if necessary.
    for (const receivedNote of receivedNotes) {
      const localNote = await waitForDBRequest(notesStore.get(receivedNote.id) as IDBRequest<t.Note | undefined>);
      if (cutil.isNoteNewerThan(receivedNote, localNote)) {
        notesStore.put(receivedNote);
        mergeCount++;
      }
    }

    // Clear local note queue.
    const queueStore = tx.objectStore(NOTES_QUEUE_STORE);
    const queuedNoteHeads = await waitForDBRequest(queueStore.getAll() as IDBRequest<t.NoteHead[]>);
    const sentNotesById = _.keyBy(reqSyncData.notes, 'id');
    for (const queued of queuedNoteHeads) {
      const sent = sentNotesById[queued.id] as t.EncryptedNote | undefined;
      // Scenario 1.
      // We send Note A.
      // User modifies A -> A'.
      // Then during merge, we see that A' (in queue) is newer than A (sent).
      // We must NOT delete A'

      // Scenario 2.
      // We send Note A.
      // Then during merge, we see that A' (in queue) is the same as A (sent).
      // We MUST delete A'.

      // Scenario 3.
      // We send some notes but A doesn't exist.
      // User creates A'
      // During merge we have A' (in queue), but there's no A (nothing sent).
      // We must NOT delete A'

      // In other words, if the sent note is the same (or newer but that shoudn't happen) as the queued one, remove from queue.

      if (sent && queued.modification_date <= sent.modification_date) {
        queueStore.delete(queued.id);
      }
    }

    // Update sync number.
    const newSyncNumber = Math.max(reqSyncData.syncNumber, resSyncData.syncNumber) + 1;
    tx.objectStore(SETTINGS_STORE).put(newSyncNumber, 'syncNumber');

    return mergeCount;
  });
}

export async function countQueuedNotes(): Promise<number> {
  const res = await transaction([NOTES_QUEUE_STORE], 'readonly', tx => tx.objectStore(NOTES_QUEUE_STORE).count());
  return res.result;
}

// TODO it doesn't take into account shouldSyncAgain
// export async function waitTillSyncEnd(ms: number) {
//   await Promise.race([
//     new Promise<void>(resolve => {
//       function cb() {
//         if (!syncing) {
//           removeSyncListener(cb);
//           resolve();
//         }
//       }
//       addSyncListener(cb);
//     }),
//     new Promise(resolve => setTimeout(resolve, ms)),
//   ]);
// }

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const res = await transaction([SETTINGS_STORE], 'readonly', async tx => {
    return tx.objectStore(SETTINGS_STORE).get(key) as IDBRequest<any | undefined>;
  });
  return res.result;
}

export async function setSetting(value: any, key: string) {
  await transaction([SETTINGS_STORE], 'readwrite', async tx => {
    tx.objectStore(SETTINGS_STORE).put(value, key);
  });
}
