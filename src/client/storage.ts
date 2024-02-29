import type { Note } from '../common/types.js';

let _db: IDBDatabase | undefined;

export const DB_NAME = 'unforget';
export const NOTES_STORE = 'notes';
export const NOTES_STORE_ORDER_INDEX = 'orderIndex';
export const DIRTY_NOTES_IDS_STORE = 'dirtyNotesIds';
export const SETTINGS_STORE = 'settings';

export async function getStorage(): Promise<IDBDatabase> {
  console.log('setting up storage');
  _db ??= await new Promise<IDBDatabase>((resolve, reject) => {
    const dbOpenReq = indexedDB.open(DB_NAME, 50);

    dbOpenReq.onerror = () => {
      reject(dbOpenReq.error);
    };

    dbOpenReq.onupgradeneeded = e => {
      // By comparing e.oldVersion with e.newVersion, we can perform only the actions needed for the upgrade.
      const notesStore = dbOpenReq.result.createObjectStore(NOTES_STORE, { keyPath: 'id' });
      notesStore.createIndex(NOTES_STORE_ORDER_INDEX, 'order');
      dbOpenReq.result.createObjectStore(DIRTY_NOTES_IDS_STORE);
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let res: T;
    tx.oncomplete = () => {
      console.log('transaction succeeded');
      resolve(res);
    };
    tx.onerror = () => {
      console.log('transaction error', tx.error);
      reject(tx.error);
    };
    try {
      res = callback(tx);
    } catch (error) {
      try {
        tx.abort();
      } catch (error2) {
        console.error('transaction abort() failed', error2);
      }
      reject(error);
    }
  });
}

export async function addNote(note: Note) {
  await transaction([NOTES_STORE, DIRTY_NOTES_IDS_STORE], 'readwrite', tx => {
    tx.objectStore(NOTES_STORE).put(note);
    tx.objectStore(DIRTY_NOTES_IDS_STORE).put(null, note.id);
  });
}

export async function getAllNotes() {
  const req = await transaction(NOTES_STORE, 'readonly', tx =>
    tx.objectStore(NOTES_STORE).index(NOTES_STORE_ORDER_INDEX).getAll(),
  );
  return req.result.reverse();
}

export async function getAllDirtyNotes() {
  const idsReq = await transaction(DIRTY_NOTES_IDS_STORE, 'readonly', tx =>
    tx.objectStore(DIRTY_NOTES_IDS_STORE).getAllKeys(),
  );
  console.log('XXX', idsReq.result);
  const notesReqs = await transaction(NOTES_STORE, 'readonly', tx =>
    idsReq.result.map(id => tx.objectStore(NOTES_STORE).get(id)),
  );
  return notesReqs.map(req => req.result);
}

export async function sync(): Promise<Note[]> {
  const dirtyNotes = await getAllDirtyNotes();
  const syncRes = await fetch('/api/sync', {
    method: 'POST',
    body: JSON.stringify({ notes: dirtyNotes }),
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
  });
  const syncResJson = await syncRes.json();
  const newNotesFromServer = syncResJson.notes as Note[];

  await transaction([NOTES_STORE, DIRTY_NOTES_IDS_STORE], 'readwrite', tx => {
    for (const note of newNotesFromServer) tx.objectStore(NOTES_STORE).put(note);

    // TODO must check modification timestamp before deleting, maybe the note was changed again.
    for (const note of dirtyNotes) tx.objectStore(DIRTY_NOTES_IDS_STORE).delete(note.id);
  });

  return newNotesFromServer;
}

export async function clearAll() {
  const db = await getStorage();
  const storeNames = Array.from(db.objectStoreNames);
  await transaction(storeNames, 'readwrite', tx => {
    for (const name of storeNames) tx.objectStore(name).clear();
  });
}
