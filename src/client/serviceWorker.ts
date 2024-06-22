// Default type of `self` is `WorkerGlobalScope & typeof globalThis`
// https://github.com/microsoft/TypeScript/issues/14877
declare var self: ServiceWorkerGlobalScope;

import * as storage from './storage.js';
import { sync, syncInInterval, requireQueueSync, syncDebounced, isSyncing } from './serviceWorkerSync.js';
import { postToClient, postToClients } from './serviceWorkerToClientApi.js';
import type { ClientToServiceWorkerMessage } from '../common/types.js';
import { CACHE_VERSION, ServerError } from '../common/util.js';
import log from './logger.js';

const CACHE_NAME = `unforget-${CACHE_VERSION}`;
const APP_STATIC_RESOURCES = ['/', '/style.css', '/index.js', '/manifest.json', '/icon-256x256.png'];

self.addEventListener('install', event => {
  // The promise that skipWaiting() returns can be safely ignored.
  // Causes a newly installed service worker to progress into the activating state,
  // regardless of whether there is already an active service worker.
  self.skipWaiting();
  event.waitUntil(installServiceWorker());
});

// NOTE: The activate event is triggered only once after the install event.
self.addEventListener('activate', event => {
  event.waitUntil(activateServiceWorker());
});

// On fetch, intercept server requests
// and respond with cached responses instead of going to network
self.addEventListener('fetch', event => {
  event.respondWith(handleFetch(event));
});

// Listen to messages from window.
self.addEventListener('message', async event => {
  try {
    const message = event.data as ClientToServiceWorkerMessage;
    log('service worker: received message: ', message);
    if (event.source instanceof Client) {
      await handleClientMessage(event.source, message);
    }
  } catch (error) {
    log.error(error);
  }
});

async function installServiceWorker() {
  log('service worker: installing...');

  // Cache the static resources.
  const cache = await caches.open(CACHE_NAME);
  cache.addAll(APP_STATIC_RESOURCES);

  log('service worker: install done.');
}

// NOTE: The activate event is triggered only once after the install event.
// So, we must run syncInInterval() here as well as when a client connects.
async function activateServiceWorker() {
  log('service worker: activating...');

  // Delete old caches.
  const names = await caches.keys();
  await Promise.all(
    names.map(name => {
      if (name !== CACHE_NAME) {
        return caches.delete(name);
      }
    }),
  );

  // Set up storage.
  await storage.getStorage();

  // Take control of the clients and refresh them.
  // The refresh is necessary if the activate event was triggered by updateApp().
  await self.clients.claim();
  log('service worker: activated.');

  log('service worker: informing clients of serviceWorkerActivated with cacheVersion', CACHE_VERSION);
  postToClients({ command: 'serviceWorkerActivated', cacheVersion: CACHE_VERSION });
  syncInInterval();
}

async function handleFetch(event: FetchEvent): Promise<Response> {
  const url = new URL(event.request.url);
  const { mode, method } = event.request;
  log('service worker fetch: ', mode, method, url.pathname);

  let response: Response | undefined;

  // As a single page app, direct app to always go to cached home page.
  if (mode === 'navigate') {
    response = await caches.match('/');
  } else if (method === 'GET' && !Number(process.env.DISABLE_CACHE)) {
    const cache = await caches.open(CACHE_NAME);
    response = await cache.match(event.request);
  }

  if (response) return response;

  try {
    response = await fetch(event.request, {
      headers: new Headers([...event.request.headers, ['X-Service-Worker-Cache-Version', String(CACHE_VERSION)]]),
    });
  } catch (error) {
    return Response.error();
  }

  if (!response.ok) {
    try {
      const clonedResponse = response.clone();
      const error = ServerError.fromJSON(await clonedResponse.json());
      if (error.type === 'app_requires_update') {
        await self.registration.update();
      }
    } catch (error) {
      log.error(error);
    }
  }

  return response;
}

async function handleClientMessage(client: Client, message: ClientToServiceWorkerMessage) {
  switch (message.command) {
    case 'update': {
      await self.registration.update();
      break;
    }
    case 'sync': {
      if (message.queue) requireQueueSync();
      (message.debounced ? syncDebounced : sync)();
      break;
    }
    case 'tellOthersToRefreshPage': {
      postToClients({ command: 'refreshPage' }, { exceptClientIds: [client.id] });
      break;
    }
    case 'tellOthersNotesInStorageChanged': {
      postToClients({ command: 'notesInStorageChangedExternally' }, { exceptClientIds: [client.id] });
      break;
    }
    case 'sendSyncStatus': {
      postToClient(client, { command: 'syncStatus', syncing: isSyncing() });
      break;
    }
    case 'newClient': {
      syncInInterval();
      break;
    }
    default:
      log('Unknown message: ', message);
  }
}
