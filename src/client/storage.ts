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

const syncListeners: SyncListener[] = [];
export let syncing = false;
let shouldSyncAgain = false;
let fullSyncRequired = false;

export async function getStorage(): Promise<IDBDatabase> {
  console.log('setting up storage');
  _db ??= await new Promise<IDBDatabase>((resolve, reject) => {
    const dbOpenReq = indexedDB.open(DB_NAME, 52);

    dbOpenReq.onerror = () => {
      reject(dbOpenReq.error);
    };

    dbOpenReq.onupgradeneeded = e => {
      // By comparing e.oldVersion with e.newVersion, we can perform only the actions needed for the upgrade.
      const notesStore = dbOpenReq.result.createObjectStore(NOTES_STORE, { keyPath: 'id' });
      notesStore.createIndex(NOTES_STORE_ORDER_INDEX, 'order');
      dbOpenReq.result.createObjectStore(NOTES_QUEUE_STORE, { keyPath: 'id' });
      dbOpenReq.result.createObjectStore(SETTINGS_STORE);
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
  return new Promise(async (resolve, reject) => {
    let tx: IDBTransaction | undefined;
    try {
      tx = db.transaction(storeNames, mode);
      let res: T;
      tx.oncomplete = () => {
        console.log('transaction succeeded');
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
  await transaction([NOTES_STORE, NOTES_QUEUE_STORE], 'readwrite', tx => {
    tx.objectStore(NOTES_STORE).put(note);
    const noteHead: t.NoteHead = { id: note.id, modification_date: note.modification_date };
    tx.objectStore(NOTES_QUEUE_STORE).put(noteHead);
  });
}

export async function getAllNotes(): Promise<t.Note[]> {
  const req = await transaction(
    NOTES_STORE,
    'readonly',
    tx => tx.objectStore(NOTES_STORE).index(NOTES_STORE_ORDER_INDEX).getAll() as IDBRequest<t.Note[]>,
  );
  return req.result;
}

export async function getNote(id: string): Promise<t.Note | undefined> {
  const req = await transaction(
    NOTES_STORE,
    'readonly',
    tx => tx.objectStore(NOTES_STORE).get(id) as IDBRequest<t.Note | undefined>,
  );
  return req.result;
}

export async function getActiveNotes(): Promise<t.Note[]> {
  const notes = await getAllNotes();
  return notes.filter(note => !note.deleted && !note.archived).reverse();
}

export async function getPartialSyncData(): Promise<t.SyncData> {
  const res = await transaction([NOTES_STORE, NOTES_QUEUE_STORE, SETTINGS_STORE], 'readonly', async tx => {
    const items = await waitForDBRequest(tx.objectStore(NOTES_QUEUE_STORE).getAll() as IDBRequest<t.NoteHead[]>);
    const notesReqs = items.map(item => tx.objectStore(NOTES_STORE).get(item.id) as IDBRequest<t.Note>);
    const syncNumberReq = tx.objectStore(SETTINGS_STORE).get('syncNumber') as IDBRequest<number | undefined>;
    return { notesReqs, syncNumberReq };
  });
  return { notes: res.notesReqs.map(req => req.result), syncNumber: res.syncNumberReq.result ?? 0 };
}

export async function getFullSyncData(): Promise<t.SyncData> {
  const res = await transaction([NOTES_STORE, SETTINGS_STORE], 'readonly', async tx => {
    const notesReqs = tx.objectStore(NOTES_STORE).getAll() as IDBRequest<t.Note[]>;
    const syncNumberReq = tx.objectStore(SETTINGS_STORE).get('syncNumber') as IDBRequest<number | undefined>;
    return { notesReqs, syncNumberReq };
  });
  return { notes: res.notesReqs.result, syncNumber: res.syncNumberReq.result ?? 0 };
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

  let error: Error | undefined;
  let mergeCount = 0;
  try {
    if (syncing) {
      console.log('sync deferred: already running.');

      shouldSyncAgain = true;
      return;
    }

    shouldSyncAgain = false;
    syncing = true;

    console.log('sync started.');
    callSyncListeners({ done: false });

    // ===================
    // Actual sync logic
    // ===================

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
    console.error(error);
    error = err as Error;
  } finally {
    console.log('sync ended.');
    syncing = false;
    if (shouldSyncAgain) {
      setTimeout(sync, 1000);
    } else {
      callSyncListeners({ done: true, error, mergeCount });
    }
  }
}

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
  return transaction([NOTES_STORE, NOTES_QUEUE_STORE, SETTINGS_STORE], 'readwrite', async tx => {
    let mergeCount = 0;
    const notesStore = tx.objectStore(NOTES_STORE);

    // Replace local notes with received notes if necessary.
    for (const receivedNote of resSyncData.notes) {
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
      const sent = sentNotesById[queued.id] as t.Note | undefined;
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

export async function waitTillSyncEnd(ms?: number) {
  await Promise.race([
    new Promise<void>(resolve => {
      function cb() {
        if (!syncing) {
          removeSyncListener(cb);
          resolve();
        }
      }
      addSyncListener(cb);
    }),
    ms && new Promise(resolve => setTimeout(resolve, ms)),
  ]);
}
