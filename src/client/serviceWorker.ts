// Default type of `self` is `WorkerGlobalScope & typeof globalThis`
// https://github.com/microsoft/TypeScript/issues/14877
declare var self: ServiceWorkerGlobalScope;

import * as storage from './storage.js';
import { CACHE_VERSION, ServerError } from '../common/util.js';
import type * as t from '../common/types.js';

// The name of the cache
const CACHE_NAME = `unforget-${CACHE_VERSION}`;

// The static resources that the app needs to function.
const APP_STATIC_RESOURCES = [
  '/',
  '/style.css',
  '/index.js',
  '/barefront.svg',
  '/manifest.json',
  '/icon-256x256.png',
  '/icons/archive-filled.svg',
  '/icons/archive-empty.svg',
  '/icons/archive-filled-white.svg',
  '/icons/archive-empty-white.svg',
  '/icons/check-white.svg',
  '/icons/log-out.svg',
  '/icons/menu-white.svg',
  '/icons/pin-empty.svg',
  '/icons/pin-empty-white.svg',
  '/icons/pin-filled.svg',
  '/icons/pin-filled-white.svg',
  '/icons/refresh-ccw.svg',
  '/icons/trash-white.svg',
  '/icons/user.svg',
  '/icons/search-white.svg',
  '/icons/show-pinned-white.svg',
  '/icons/hide-pinned-white.svg',
  '/icons/info.svg',
  '/icons/notes.svg',
  '/icons/add-white.svg',
  '/icons/checkbox-list.svg',
  '/icons/bulletpoint-white.svg',
];

self.addEventListener('install', event => {
  // The promise that skipWaiting() returns can be safely ignored.
  // Causes a newly installed service worker to progress into the activating state,
  // regardless of whether there is already an active service worker.
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      console.log('service worker: installing...');

      // Cache the static resources.
      const cache = await caches.open(CACHE_NAME);
      cache.addAll(APP_STATIC_RESOURCES);

      console.log('service worker: install done.');
    })(),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      console.log('service worker: activating...');

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
      for (const client of await self.clients.matchAll()) {
        console.log('service worker: calling refreshPage on a client');
        client.postMessage({ command: 'refreshPage' });
      }
      console.log('service worker: activated.');
    })(),
  );
});

// On fetch, intercept server requests
// and respond with cached responses instead of going to network
self.addEventListener('fetch', event => {
  event.respondWith(handleFetchEvent(event));
});

// Listen to messages from window.
self.addEventListener('message', async event => {
  try {
    const message = event.data;
    console.log('service worker: received message: ', message);

    // Example of how to respond based on the message type
    if (message.command === 'update') {
      await self.registration.update();
    }
  } catch (error) {
    console.error(error);
  }
});

async function handleFetchEvent(event: FetchEvent): Promise<Response> {
  const url = new URL(event.request.url);
  const { mode, method } = event.request;
  console.log('service worker fetch: ', mode, method, url.pathname);

  let response: Response | undefined;

  // As a single page app, direct app to always go to cached home page.
  if (mode === 'navigate') {
    response = await caches.match('/');
    // } else if (method === 'GET' && url.pathname === '/api/notes') {
    //   const notesReq = await storage.transaction(storage.NOTES_STORE, 'readonly', tx =>
    //     tx.objectStore(storage.NOTES_STORE).getAll(),
    //   );
    //   response = new Response(JSON.stringify(notesReq.result), {
    //     headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    //   });
    //   // response = fetch(event.request);
    // } else if (method === 'POST' && url.pathname === '/api/notes') {
    //   const clonedRequest = event.request.clone(); // Must clone because body is a stream that can be read only once.
    //   const notes = (await clonedRequest.json()) as Note[];
    //   await storage.transaction(storage.NOTES_STORE, 'readwrite', tx =>
    //     notes.map(note => tx.objectStore(storage.NOTES_STORE).put(note)),
    //   );
    //   response = new Response(JSON.stringify({ ok: true }), {
    //     headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    //   });
  } else if (!Number(process.env.DISABLE_CACHE)) {
    const cache = await caches.open(CACHE_NAME);
    response = await cache.match(event.request);
  }

  if (response) return response;

  try {
    response = await fetch(event.request, {
      headers: new Headers([...event.request.headers, ['X-Cache-Version', String(CACHE_VERSION)]]),
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
      console.error(error);
    }
  }

  return response;
}
