import type * as t from '../common/types.js';
import { createRoot } from 'react-dom/client';
import * as storage from './storage.js';
import { setUpManualScrollRestoration, patchHistory } from './router.jsx';
import React from 'react';
import App from './App.jsx';
import { postToServiceWorker } from './clientToServiceWorkerApi.js';
import * as appStore from './appStore.jsx';
import * as actions from './appStoreActions.jsx';
import { CACHE_VERSION } from '../common/util.js';
import log from './logger.js';
import { sync, syncInInterval, addSyncEventListener, type SyncEvent } from './sync.js';
import * as b from './cross-context-broadcast.js';
import { v4 as uuid } from 'uuid';

async function setup() {
  // Set up unique context id.
  window.unforgetContextId = uuid();

  // Set up broadcast.
  b.init();
  b.addListener(handleBroadcastMessage);

  // Set up storage before registering the service worker.
  // Because the service worker itself will try to set up the storage too.
  await storage.getStorage();

  // Initialize app store.
  // Must do before registering service worker because we need to update
  // the appStore in reaction to messages from the service worker.
  await actions.initAppStore();
  await actions.makeSureConsistentUserAndCookie();

  await registerServiceWorker();

  // // Tell the service worker there's a new window.
  // await postToServiceWorker({ command: 'newClient' });

  // Request sync status from service worker.
  // await postToServiceWorker({ command: 'sendSyncStatus' });

  // Sync online status.
  function onlineChanged() {
    appStore.update(app => {
      app.online = navigator.onLine;
    });
  }
  window.addEventListener('online', onlineChanged);
  window.addEventListener('offline', onlineChanged);

  // Listen to sync events.
  addSyncEventListener(handleSyncEvent);

  // Sync online status periodically.
  setInterval(onlineChanged, 5000);

  // Sync when online.
  window.addEventListener('online', () => {
    sync();
    // postToServiceWorker({ command: 'sync' });
  });

  // Check for app updates when page becomes visible.
  window.addEventListener('visibilitychange', function visibilityChanged() {
    if (document.visibilityState === 'visible') {
      actions.checkAppUpdate();
    }
  });

  // Check for app updates when online.
  window.addEventListener('online', actions.checkAppUpdate);

  // Check for app updates periodically.
  setInterval(actions.checkAppUpdate, 10 * 1000);

  // Initial check for app updates.
  actions.checkAppUpdate();

  // Update queue count periodically.
  setInterval(actions.updateQueueCount, 3 * 1000);

  // Notify user if app updated.
  actions.notifyIfAppUpdated();

  // Manual scroll restoration.
  setUpManualScrollRestoration();

  // Patch history required for our router.
  patchHistory();

  // Sync in interval
  syncInInterval();

  const root = createRoot(document.getElementById('app')!);
  root.render(<App />);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    log.error('window: service workers are not supported.');
    alert('Your browser does not support service workers. Please use another browser.');
    return;
  }

  navigator.serviceWorker.addEventListener('message', event => {
    log(`window: received message from service worker`, event.data);
    handleServiceWorkerMessage(event.data);
  });

  try {
    await navigator.serviceWorker.register('/serviceWorker.js');
    log('window: service worker registration successful');
  } catch (error) {
    actions.showMessage('Failed to register service worker: ' + (error as Error).message, { type: 'error' });
    log.error((error as Error).message);
  }

  // // Sometimes the service worker just gets disabled on iphone. I don't know why.
  // // Here, we try to register every 5s. According to MDN, it'll automatically
  // // check if there's already a registration.
  // setInterval(registerServiceWorkerHelper, 5000);
}

async function handleServiceWorkerMessage(message: t.ServiceWorkerToClientMessage) {
  switch (message.command) {
    case 'serviceWorkerActivated': {
      if (message.cacheVersion > CACHE_VERSION) {
        log(`window: require a page refresh to upgrade from ${CACHE_VERSION} to ${message.cacheVersion}`);
        actions.requireAppUpdate();
      }

      break;
    }
    case 'error': {
      actions.showMessage(message.error, { type: 'error' });
      break;
    }

    default:
      console.log('Unknown message', message);
  }
}

async function handleSyncEvent(event: SyncEvent) {
  switch (event.type) {
    case 'error': {
      actions.showMessage(event.error.message, { type: 'error' });
      break;
    }
    case 'mergedNotes': {
      b.broadcast({ type: 'notesInStorageChanged' });
      break;
    }
    case 'syncStatus': {
      appStore.update(app => {
        app.syncing = event.syncing;
      });
      break;
    }
    case 'unauthorized': {
      await actions.resetUser();
      b.broadcast({ type: 'refreshPage' });
      window.location.reload();
      break;
    }
  }
}

function handleBroadcastMessage(message: t.BroadcastChannelMessage) {
  switch (message.type) {
    case 'notesInStorageChanged': {
      break; // Will listen to and handle this in specific pages.
    }

    case 'refreshPage': {
      window.location.reload();
      break;
    }
  }
}

window.onload = setup;
