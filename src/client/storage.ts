import type * as t from '../common/types.js';
import * as cutil from '../common/util.jsx';
import { exportEncryptionKey, importEncryptionKey } from './crypto.js';
import _ from 'lodash';
import log from './logger.js';

let _db: IDBDatabase | undefined;

export const DB_NAME = 'unforget';
export const NOTES_STORE = 'notes';
export const NOTES_STORE_ORDER_INDEX = 'orderIndex';
export const NOTES_QUEUE_STORE = 'notesQueue';
export const SETTINGS_STORE = 'settings';

type SaveNoteQueueItem = { note: t.Note; resolve: () => void; reject: (error: Error) => any };

let saveNoteQueue: SaveNoteQueueItem[] = [];
let saveNoteQueueActive: boolean = false;

export async function getStorage(): Promise<IDBDatabase> {
  _db ??= await new Promise<IDBDatabase>((resolve, reject) => {
    log('setting up storage');
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
        // log('transaction succeeded');
        resolve(res);
      };
      tx.onerror = () => {
        log('transaction error', tx!.error);
        reject(tx!.error);
      };
      res = await callback(tx);
    } catch (error) {
      try {
        tx?.abort();
      } catch (error2) {
        log.error('transaction abort() failed', error2);
      } finally {
        reject(error);
      }
    }
  });
}

export async function saveNote(note: t.Note) {
  return saveNotes([note]);
}

export async function saveNotes(notes: t.Note[]) {
  const promises = notes.map(enqueueNote);
  saveNextNotesInQueue(); // Don't await here.
  await Promise.all(promises);
}

function enqueueNote(note: t.Note): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    saveNoteQueue.unshift({ note, resolve, reject });
  });
}

async function saveNextNotesInQueue() {
  if (saveNoteQueueActive) return;
  if (saveNoteQueue.length === 0) return;

  const items = [...saveNoteQueue];
  saveNoteQueue.length = 0;

  try {
    await saveNoteQueueItems(items);
    log(
      'saved notes ',
      items.map(item => item.note.text),
    );
    for (const item of items) item.resolve();
  } catch (error) {
    for (const item of items) item.reject(error as Error);
  } finally {
    saveNoteQueueActive = false;
    saveNextNotesInQueue(); // Don't await here.
  }
}

async function saveNoteQueueItems(items: SaveNoteQueueItem[]) {
  await transaction([NOTES_STORE, NOTES_QUEUE_STORE], 'readwrite', tx => {
    for (const item of items) {
      tx.objectStore(NOTES_STORE).put(item.note);
      const noteHead: t.NoteHead = { id: item.note.id, modification_date: item.note.modification_date };
      tx.objectStore(NOTES_QUEUE_STORE).put(noteHead);
    }
  });
}

export function isSavingNote(): boolean {
  return saveNoteQueueActive;
}

export async function getAllNotes(): Promise<t.Note[]> {
  const req = await transaction(
    NOTES_STORE,
    'readonly',
    tx => tx.objectStore(NOTES_STORE).index(NOTES_STORE_ORDER_INDEX).getAll() as IDBRequest<t.Note[]>,
  );
  return req.result;
}

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
        const cursor = orderCursorReq.result;
        if (!cursor) {
          // Reached the end, we're done.
          done = true;
          resolve();
          return;
        }

        if (limit !== undefined && notes.length >= limit) {
          // Reached the limit, we're done.
          resolve();
          return;
        }

        // There is a note.
        const note = cursor.value as t.Note;

        if (opts?.archive) {
          // If archived notes were requested, continue until we reach the first archived note.
          if (note.not_archived) {
            cursor.continue();
            return;
          }
        } else if (!note.not_archived) {
          // If archived notes were not requested and we reached an archived note, we're done.
          done = true;
          resolve();
          return;
        }

        if (!note.not_deleted) {
          // If we hit a deleted note, we're done.
          done = true;
          resolve();
          return;
        }

        if (opts?.hidePinnedNotes && note.pinned) {
          // If pinned notes must be skipped, continue until the first non-pinned note.
          cursor.continue();
          return;
        }

        if (regexps && !regexps.every(regexp => regexp.test(note.text ?? ''))) {
          // If there's a search phrase and it doesn't match, skip.
          cursor.continue();
          return;
        }

        // Found a note.
        notes.push(note);
        cursor.continue();
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

export async function clearAll() {
  const db = await getStorage();
  const storeNames = Array.from(db.objectStoreNames);
  await transaction(storeNames, 'readwrite', tx => {
    for (const name of storeNames) tx.objectStore(name).clear();
  });
}

// export async function clearNotes() {
//   const storeNames = [NOTES_STORE, NOTES_QUEUE_STORE];
//   await transaction(storeNames, 'readwrite', tx => {
//     for (const name of storeNames) tx.objectStore(name).clear();
//   });
// }

export async function waitForDBRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onerror = () => {
      reject(req.error);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
  });
}

export async function countQueuedNotes(): Promise<number> {
  const res = await transaction([NOTES_QUEUE_STORE], 'readonly', tx => tx.objectStore(NOTES_QUEUE_STORE).count());
  return res.result;
}

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

/**
 * Safari (at least on iOS) has trouble serializing and deserializing CryptoKey.
 * It sets any value object that has a CryptoKey inside to null when we set it
 * in one context (window) and try to read it in another (service worker).
 * So, we export and import manually.
 */
export async function setUser(user: t.ClientLocalUser) {
  const u = { ...user, encryptionKey: await exportEncryptionKey(user.encryptionKey) };
  await setSetting(u, 'userJson');
}

export async function getUser(): Promise<t.ClientLocalUser | undefined> {
  const u = (await getSetting('userJson')) as any;
  if (u) {
    return { ...u, encryptionKey: await importEncryptionKey(u.encryptionKey) };
  }
}

export async function clearUser() {
  await setSetting(undefined, 'userJson');
}
