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
  if (!_db) {
    _db = await new Promise<IDBDatabase>((resolve, reject) => {
      log('setting up storage');
      const dbOpenReq = indexedDB.open(DB_NAME, 53);

      dbOpenReq.onerror = () => {
        _db = undefined;
        reject(dbOpenReq.error);
      };

      dbOpenReq.onupgradeneeded = e => {
        // By comparing e.oldVersion with e.newVersion, we can perform only the actions needed for the upgrade.
        if (e.oldVersion < 52) {
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

    _db.onversionchange = () => {
      _db?.close();
      log('new version of database is ready. Closing the database ...');
    };
    _db.onclose = () => {
      _db = undefined;
      log('database is closed');
    };
    _db.onabort = () => {
      log('database is aborted');
    };
    _db.onerror = error => {
      log.error(error);
    };
  }

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
      tx.objectStore(NOTES_QUEUE_STORE).put(createNoteHeadFromNote(item.note));
    }
  });
}

function createNoteHeadFromNote(note: t.Note): t.NoteHead {
  return { id: note.id, modification_date: note.modification_date };
}

export async function moveNotesUp(ids: string[]) {
  const start = performance.now();
  await transaction([NOTES_STORE, NOTES_QUEUE_STORE], 'readwrite', async tx => {
    const notesStore = tx.objectStore(NOTES_STORE);
    const notesQueueStore = tx.objectStore(NOTES_QUEUE_STORE);
    const orderIndex = notesStore.index(NOTES_STORE_ORDER_INDEX);

    const sparseNotes = await Promise.all(ids.map(id => waitForDBRequest<t.Note | undefined>(notesStore.get(id))));
    const notes = _.orderBy(_.compact(sparseNotes), 'order', 'desc');

    for (const note of notes) {
      // Get the newer note
      const lowerKey = [note.not_archived, note.not_deleted, note.pinned, note.order];
      const upperKey = [note.not_archived, note.not_deleted, note.pinned, Infinity];
      const newerNoteCursorReq = orderIndex.openCursor(IDBKeyRange.bound(lowerKey, upperKey, true, true));
      const newerNoteCursorRes = await waitForDBRequest(newerNoteCursorReq);
      const newerNote: t.Note = newerNoteCursorRes?.value;

      // Skip if not found.
      if (!newerNote) continue;

      // // The newerNote may not actually be newer if it differs in not_archived, not_deleted, or pinned.
      // if (newerNote.order <= note.order) continue;

      // Don't jump over a note in the selection. In other words, the relative order of selection
      // stays the same.
      if (notes.find(n => n.id === newerNote.id)) continue;

      // Swap the orders and set modification time.
      [note.order, newerNote.order] = [newerNote.order, note.order];
      note.modification_date = newerNote.modification_date = new Date().toISOString();

      // Save both
      await Promise.all([
        waitForDBRequest(notesStore.put(note)),
        waitForDBRequest(notesStore.put(newerNote)),
        waitForDBRequest(notesQueueStore.put(createNoteHeadFromNote(note))),
        waitForDBRequest(notesQueueStore.put(createNoteHeadFromNote(newerNote))),
      ]);
    }
  });
  log(`moveNotesUp done in ${performance.now() - start}ms`);
}

export async function moveNotesDown(ids: string[]) {
  const start = performance.now();
  await transaction([NOTES_STORE, NOTES_QUEUE_STORE], 'readwrite', async tx => {
    const notesStore = tx.objectStore(NOTES_STORE);
    const notesQueueStore = tx.objectStore(NOTES_QUEUE_STORE);
    const orderIndex = notesStore.index(NOTES_STORE_ORDER_INDEX);

    const sparseNotes = await Promise.all(ids.map(id => waitForDBRequest<t.Note | undefined>(notesStore.get(id))));
    const notes = _.orderBy(_.compact(sparseNotes), 'order', 'asc');

    // Going in reverse order (oldest to newest notes).
    for (const note of notes) {
      // Get the older note.
      const lowerKey = [note.not_archived, note.not_deleted, note.pinned, 0];
      const upperKey = [note.not_archived, note.not_deleted, note.pinned, note.order];
      const olderNoteCursorReq = orderIndex.openCursor(IDBKeyRange.bound(lowerKey, upperKey, true, true), 'prev');
      const olderNoteCursorRes = await waitForDBRequest(olderNoteCursorReq);
      const olderNote: t.Note = olderNoteCursorRes?.value;

      // Skip if not found.
      if (!olderNote) continue;

      // Don't jump over a note in the selection. In other words, the relative order of selection
      // stays the same.
      if (notes.find(n => n.id === olderNote.id)) continue;

      // // The olderNote may not actually be older if it differs in not_archived, not_deleted, or pinned.
      // if (olderNote.order >= note.order) continue;

      // Swap the orders and set modification time.
      [note.order, olderNote.order] = [olderNote.order, note.order];
      note.modification_date = olderNote.modification_date = new Date().toISOString();

      // Save both
      await Promise.all([
        waitForDBRequest(notesStore.put(note)),
        waitForDBRequest(notesStore.put(olderNote)),
        waitForDBRequest(notesQueueStore.put(createNoteHeadFromNote(note))),
        waitForDBRequest(notesQueueStore.put(createNoteHeadFromNote(olderNote))),
      ]);
    }
  });
  log(`moveNotesDown done in ${performance.now() - start}ms`);
}

export async function moveNotesToTop(ids: string[]) {
  const start = performance.now();
  await transaction([NOTES_STORE, NOTES_QUEUE_STORE], 'readwrite', async tx => {
    const notesStore = tx.objectStore(NOTES_STORE);
    const notesQueueStore = tx.objectStore(NOTES_QUEUE_STORE);
    const orderIndex = notesStore.index(NOTES_STORE_ORDER_INDEX);

    const sparseNotes = await Promise.all(ids.map(id => waitForDBRequest<t.Note | undefined>(notesStore.get(id))));
    const notes = _.orderBy(_.compact(sparseNotes), 'order', 'asc');

    // Going in reverse order (oldest to newest notes).
    // Must do this one at a time because we can't get the absolute max/min order (unless we create a new index) and
    // some of the notes may differ in not_archived, not_deleted, and pinned.
    for (const note of notes) {
      // Get the newest note
      const lowerKey = [note.not_archived, note.not_deleted, note.pinned, 0];
      const upperKey = [note.not_archived, note.not_deleted, note.pinned, Infinity];
      const newestNoteCursorReq = orderIndex.openCursor(IDBKeyRange.bound(lowerKey, upperKey), 'prev');
      const newestNoteCursorRes = await waitForDBRequest(newestNoteCursorReq);
      const newestNote: t.Note = newestNoteCursorRes?.value;

      // Skip if not found.
      if (!newestNote) continue;

      // set the order and modification time.
      note.order = newestNote.order + 1000;
      note.modification_date = new Date().toISOString();

      // Save
      await Promise.all([
        waitForDBRequest(notesStore.put(note)),
        waitForDBRequest(notesQueueStore.put(createNoteHeadFromNote(note))),
      ]);
    }
  });
  log(`moveNotesToTop done in ${performance.now() - start}ms`);
}

export async function moveNotesToBottom(ids: string[]) {
  const start = performance.now();
  await transaction([NOTES_STORE, NOTES_QUEUE_STORE], 'readwrite', async tx => {
    const notesStore = tx.objectStore(NOTES_STORE);
    const notesQueueStore = tx.objectStore(NOTES_QUEUE_STORE);
    const orderIndex = notesStore.index(NOTES_STORE_ORDER_INDEX);

    const sparseNotes = await Promise.all(ids.map(id => waitForDBRequest<t.Note | undefined>(notesStore.get(id))));
    const notes = _.orderBy(_.compact(sparseNotes), 'order', 'desc');

    // Must do this one at a time because we can't get the absolute max/min order (unless we create a new index) and
    // some of the notes may differ in not_archived, not_deleted, and pinned.
    for (const note of notes) {
      // Get the oldest note
      const lowerKey = [note.not_archived, note.not_deleted, note.pinned, 0];
      const upperKey = [note.not_archived, note.not_deleted, note.pinned, Infinity];
      const oldestNoteCursorReq = orderIndex.openCursor(IDBKeyRange.bound(lowerKey, upperKey));
      const oldestNoteCursorRes = await waitForDBRequest(oldestNoteCursorReq);
      const oldestNote: t.Note = oldestNoteCursorRes?.value;

      // Skip if not found.
      if (!oldestNote) continue;

      // set the order and modification time.
      note.order = oldestNote.order - 1000;
      note.modification_date = new Date().toISOString();

      // Save
      await Promise.all([
        waitForDBRequest(notesStore.put(note)),
        waitForDBRequest(notesQueueStore.put(createNoteHeadFromNote(note))),
      ]);
    }
  });
  log(`moveNotesToBottom done in ${performance.now() - start}ms`);
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
      const cursorReq = orderIndex.openCursor(null, 'prev');
      cursorReq.onerror = () => {
        reject(cursorReq.error);
      };
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
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

export async function getNotesById(ids: string[]): Promise<(t.Note | undefined)[]> {
  const reqs = await transaction(NOTES_STORE, 'readonly', tx => {
    const notesStore = tx.objectStore(NOTES_STORE);
    return ids.map(id => notesStore.get(id)) as IDBRequest<t.Note | undefined>[];
  });
  return reqs.map(req => req.result);
}

export async function getNote(id: string): Promise<t.Note | undefined> {
  return (await getNotesById([id]))[0];
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
