declare var self: ServiceWorkerGlobalScope;

import type * as t from '../common/types.js';
import { ServerError, isNoteNewerThan } from '../common/util.jsx';
import log from './logger.js';
import * as storage from './storage.js';
import * as api from './api.js';
import { postToClients } from './serviceWorkerToClientApi.js';
import { encryptNotes, decryptNotes } from './crypto.js';
import _ from 'lodash';

// export type SyncListenerArgs = { done: false } | { done: true; error?: Error; mergeCount: number };
// export type SyncListener = (args: SyncListenerArgs) => any;

// const syncListeners: SyncListener[] = [];
let syncing = false;
let shouldSyncAgain = false;
let queueSyncRequired = false;
let interval: any;

export function syncInInterval() {
  if (!interval) {
    interval = setInterval(sync, 5000);
    sync();
  }
}

export async function sync() {
  // Prevent running until the last run is done.
  if (syncing) {
    log('sync deferred: already running.');
    shouldSyncAgain = true;
    return;
  }

  // Skip if user not logged in.
  const user = await storage.getUser();
  if (!user) return;

  // Skip if this is a demo.
  if (user.username === 'demo') return;

  // NOTE: Don't do this. If the online status is not updated properly it'll get the sync stuck.
  // Skip if user is offline
  // if (!appStore.get().online) return;

  log('sync started.');
  shouldSyncAgain = false;
  syncing = true;

  postToClients({ command: 'syncStatus', syncing: true });
  // callSyncListeners({ done: false });

  let error: Error | undefined;
  let mergeCount = 0;
  const start = Date.now();
  try {
    // Delta sync. Server will either send delta sync data or request a queue sync.
    if (!queueSyncRequired) {
      const deltaSyncReq: t.DeltaSyncReq = await getDeltaSyncData(user);
      const deltaSyncRes: t.DeltaSyncRes = await api.post('/api/delta-sync', deltaSyncReq);
      // Server already checks if sync numbers are the same. But just to be sure we do it here too.
      if (deltaSyncRes.type === 'ok' && deltaSyncReq.syncNumber === deltaSyncRes.syncNumber) {
        mergeCount = await mergeSyncData(deltaSyncReq, deltaSyncRes, user);
      } else {
        queueSyncRequired = true;
      }
    }

    // Queue sync.
    if (queueSyncRequired) {
      const queueSyncReq: t.QueueSyncReq = await getQueueSyncData();
      const queueSyncRes: t.QueueSyncRes = await api.post('/api/queue-sync', queueSyncReq);
      await mergeSyncHeadsData(queueSyncReq, queueSyncRes);
      shouldSyncAgain = true;
      queueSyncRequired = false;
    }
  } catch (err) {
    // log.error(err);
    error = err as Error;
  }

  log(`sync ended${error ? ' with error' : ''} in ${Date.now() - start}ms`);

  syncing = false;

  // Handle errors.
  if (error) {
    if (error instanceof TypeError) {
      // TypeError is thrown when device is offline or server is down or there's a Cors problem etc.
      // Should be ignored.
    } else if (error instanceof ServerError && error.code === 401) {
      // We cannot reset the cookie here because service worker doesn't have access to document
      // and the Cookie Store API is not universally supported yet.
      // setUserCookies('');
      await storage.clearUser();
      postToClients({ command: 'refreshPage' });
    } else if (error instanceof ServerError && error.type === 'app_requires_update') {
      await self.registration.update();
    } else {
      postToClients({ command: 'error', error: error.message });
    }
  }

  // Tell clients about changes.
  if (mergeCount > 0) {
    postToClients({ command: 'notesInStorageChangedExternally' });
  }

  // Schedule another sync or tell client that sync is done.
  if (shouldSyncAgain) {
    setTimeout(sync, 0);
  } else {
    postToClients({ command: 'syncStatus', syncing: false });
  }
}

export function isSyncing(): boolean {
  return syncing;
}

async function getDeltaSyncData(user: t.ClientLocalUser): Promise<t.SyncData> {
  const res = await storage.transaction(
    [storage.NOTES_STORE, storage.NOTES_QUEUE_STORE, storage.SETTINGS_STORE],
    'readonly',
    async tx => {
      const items = await storage.waitForDBRequest(
        tx.objectStore(storage.NOTES_QUEUE_STORE).getAll() as IDBRequest<t.NoteHead[]>,
      );
      const notesReqs = items.map(item => tx.objectStore(storage.NOTES_STORE).get(item.id) as IDBRequest<t.Note>);
      const syncNumberReq = tx.objectStore(storage.SETTINGS_STORE).get('syncNumber') as IDBRequest<number | undefined>;
      return { notesReqs, syncNumberReq };
    },
  );
  const notes = await encryptNotes(
    res.notesReqs.map(req => req.result),
    user.encryptionKey,
  );
  return { notes, syncNumber: res.syncNumberReq.result ?? 0 };
}

async function getQueueSyncData(): Promise<t.SyncHeadsData> {
  const res = await storage.transaction([storage.NOTES_STORE, storage.SETTINGS_STORE], 'readonly', async tx => {
    const notesReqs = tx.objectStore(storage.NOTES_STORE).getAll() as IDBRequest<t.Note[]>;
    const syncNumberReq = tx.objectStore(storage.SETTINGS_STORE).get('syncNumber') as IDBRequest<number | undefined>;
    return { notesReqs, syncNumberReq };
  });
  const noteHeads = res.notesReqs.result.map(note => ({ id: note.id, modification_date: note.modification_date }));
  return { noteHeads, syncNumber: res.syncNumberReq.result ?? 0 };
}

// async function getSyncNumber(): Promise<number> {
//   const res = await storage.transaction([storage.SETTINGS_STORE], 'readonly', async tx => {
//     return tx.objectStore(storage.SETTINGS_STORE).get('syncNumber') as IDBRequest<number | undefined>;
//   });
//   return res.result ?? 0;
// }

async function mergeSyncData(
  reqSyncData: t.SyncData,
  resSyncData: t.SyncData,
  user: t.ClientLocalUser,
): Promise<number> {
  // Doing this one-by-one inside the transaction can cause the transaction to finish prematurely. I don't know why.
  const receivedNotes = await decryptNotes(resSyncData.notes, user.encryptionKey);

  return storage.transaction(
    [storage.NOTES_STORE, storage.NOTES_QUEUE_STORE, storage.SETTINGS_STORE],
    'readwrite',
    async tx => {
      let mergeCount = 0;
      const notesStore = tx.objectStore(storage.NOTES_STORE);

      // Replace local notes with received notes if necessary.
      for (const receivedNote of receivedNotes) {
        const localNote = await storage.waitForDBRequest(
          notesStore.get(receivedNote.id) as IDBRequest<t.Note | undefined>,
        );
        if (isNoteNewerThan(receivedNote, localNote)) {
          notesStore.put(receivedNote);
          mergeCount++;
        }
      }

      // Clear local note queue.
      const queueStore = tx.objectStore(storage.NOTES_QUEUE_STORE);
      const queuedNoteHeads = await storage.waitForDBRequest(queueStore.getAll() as IDBRequest<t.NoteHead[]>);
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
      tx.objectStore(storage.SETTINGS_STORE).put(newSyncNumber, 'syncNumber');

      log('mergeSyncData mergeCount:', mergeCount);

      return mergeCount;
    },
  );
}

async function mergeSyncHeadsData(reqSyncHeadsData: t.SyncHeadsData, resSyncHeadsData: t.SyncHeadsData): Promise<void> {
  return storage.transaction([storage.NOTES_QUEUE_STORE, storage.SETTINGS_STORE], 'readwrite', async tx => {
    const queueStore = tx.objectStore(storage.NOTES_QUEUE_STORE);
    const sentNoteHeads = reqSyncHeadsData.noteHeads;
    const receivedNoteHeadsById = _.keyBy(resSyncHeadsData.noteHeads, 'id');
    let addedToQueueCount = 0;
    let removedFromQueueCount = 0;

    const latestQueueItems = await storage.waitForDBRequest<t.NoteHead[]>(queueStore.getAll());
    const latestQueueItemsById = _.keyBy(latestQueueItems, 'id');

    // Put the sent note head in queue if necessary to be sent in full later, or delete it from queue.
    for (const sentNoteHead of sentNoteHeads) {
      const receivedNoteHead = receivedNoteHeadsById[sentNoteHead.id];
      if (isNoteNewerThan(sentNoteHead, receivedNoteHead)) {
        queueStore.put(sentNoteHead);
        addedToQueueCount++;
      } else if (latestQueueItemsById[sentNoteHead.id]) {
        queueStore.delete(sentNoteHead.id);
        removedFromQueueCount++;
      }
    }

    // Update sync number.
    const newSyncNumber = Math.max(reqSyncHeadsData.syncNumber, resSyncHeadsData.syncNumber) + 1;
    tx.objectStore(storage.SETTINGS_STORE).put(newSyncNumber, 'syncNumber');

    log(`mergeSyncHeadsData added ${addedToQueueCount} to queue and removed ${removedFromQueueCount}`);
  });
}

export const syncDebounced = _.debounce(sync, 500, { leading: false, trailing: true, maxWait: 3000 });

export function requireQueueSync() {
  queueSyncRequired = true;
}
