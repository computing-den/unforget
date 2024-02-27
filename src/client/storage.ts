let db: IDBDatabase | undefined;

const DB_NAME = 'unforget';
const NOTES_STORE = 'notes';

export async function setupStorage() {
  console.log('setting up storage');
  if (db) return;
  db = await new Promise<IDBDatabase>((resolve, reject) => {
    const dbOpenReq = indexedDB.open(DB_NAME, 4);

    dbOpenReq.onerror = () => {
      reject(dbOpenReq.error);
    };

    dbOpenReq.onupgradeneeded = () => {
      dbOpenReq.result.createObjectStore(NOTES_STORE, { keyPath: 'id' });
    };

    dbOpenReq.onsuccess = () => {
      resolve(dbOpenReq.result);
    };
  });
}

export async function req<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  if (!db) {
    console.error('DB is not setup.');
    await setupStorage();
  }
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction(NOTES_STORE, mode);
    const req = callback(transaction.objectStore(NOTES_STORE));
    transaction.oncomplete = () => resolve(req.result);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function get<T>(query: IDBValidKey | IDBKeyRange): Promise<T> {
  return req('readonly', store => store.get(query));
}

export async function getAll<T>(query?: IDBValidKey | IDBKeyRange | null, count?: number): Promise<T[]> {
  return req('readonly', store => store.getAll(query, count));
}

export function put(value: any, key?: IDBValidKey): Promise<IDBValidKey> {
  return req('readwrite', store => store.put(value, key));
}

export function del(query: IDBValidKey | IDBKeyRange): Promise<void> {
  return req('readwrite', store => store.delete(query));
}
