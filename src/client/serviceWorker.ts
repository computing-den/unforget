// Default type of `self` is `WorkerGlobalScope & typeof globalThis`
// https://github.com/microsoft/TypeScript/issues/14877
declare var self: ServiceWorkerGlobalScope;

import * as storage from './storage.js';

// The version of the cache.
const VERSION = '10';

// The name of the cache
const CACHE_NAME = `unforget-${VERSION}`;

// The static resources that the app needs to function.
const APP_STATIC_RESOURCES = ['/', '/style.css', '/index.js', '/barefront.svg', '/manifest.json', '/icon-256x256.png'];

// On install, cache the static resources
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      cache.addAll(APP_STATIC_RESOURCES);
    })(),
  );
});

// delete old caches on activate
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        }),
      );
      await storage.setupStorage();
      await self.clients.claim();
    })(),
  );
});

// On fetch, intercept server requests
// and respond with cached responses instead of going to network
self.addEventListener('fetch', event => {
  event.respondWith(handleFetchEvent(event));
});

async function handleFetchEvent(event: FetchEvent): Promise<Response> {
  const url = new URL(event.request.url);
  const { mode, method } = event.request;
  console.log('service worker fetch: ', mode, method, url.pathname);

  let response: Response | Promise<Response> | undefined;

  // As a single page app, direct app to always go to cached home page.
  if (mode === 'navigate') {
    response = await caches.match('/');
  } else if (method === 'GET' && url.pathname === '/api/notes') {
    const notes = await storage.getAll();
    response = new Response(JSON.stringify(notes), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    });
    // response = fetch(event.request);
  } else if (method === 'POST' && url.pathname === '/api/notes') {
    const clonedRequest = event.request.clone(); // Must clone because body is a stream that can be read only once.
    const notes = await clonedRequest.json();
    for (const note of notes) {
      // TODO do it atomically
      await storage.put(note);
    }
    response = new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } else {
    const cache = await caches.open(CACHE_NAME);
    response = await cache.match(event.request);
  }

  return response ?? fetch(event.request);
}
